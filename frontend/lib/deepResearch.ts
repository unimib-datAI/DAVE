import { z } from 'zod';
import { findEntityDocuments } from './entityLookup';
import { summarizeForTrace } from './agentUtils';
import {
  AgentLLM,
  RESET_SENTINEL,
  buildContextSentinel,
  buildNumberedContext,
  createLimiter,
  emitStepChunk,
  numberChunks,
  reciprocalRankFusion,
  searchArchive,
  verifyCitations,
  type Message,
  type RetrievedDocument,
} from './agentCore';

/**
 * Deep research mode
 *
 * Searches the archive only and writes a long cited report:
 *  1. Planner          – standalone question + 3–6 sub-questions (report sections)
 *  2. EntityRetriever  – documents mentioning the entities named in the question
 *  3. Researcher       – per sub-question hybrid retrieval, in parallel
 *  4. Reflector        – judges coverage per sub-question, proposes gap queries;
 *                        steps 3–4 repeat up to `maxRounds` rounds
 *  5. SectionWriter    – one section per sub-question, in parallel, from its own
 *                        numbered evidence, with inline [n] citations
 *  6. Synthesizer      – streams the report: introduction, sections, conclusion
 *  7. CitationVerifier – drops markers whose chunk does not support the sentence
 *                        (if anything changed the streamed text is replaced)
 *
 * Reuses the shared building blocks of agentCore.ts and the same stream
 * protocol (STEP / RESET / CTX sentinels) as the multi-agent mode.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepResearchOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  indexName?: string;
  collectionId?: string;
  filterIds?: string[];
  /** Research rounds (retrieve + reflect). Default: env DEEP_MAX_ROUNDS or 3. */
  maxRounds?: number;
  /** Sub-questions / report sections. Default: env DEEP_MAX_SUBQUESTIONS or 5. */
  maxSubQuestions?: number;
  /** Aborted when the client goes away: the run stops between phases. */
  signal?: AbortSignal;
}

export interface ResearchSection {
  id: number;
  title: string;
  question: string;
  /** Queries for the first round. */
  queries: string[];
  /** Queries already fired (lower-cased), so a round never repeats one. */
  usedQueries: Set<string>;
  /** Queries proposed by the reflector for the next round. */
  gapQueries: string[];
  /** Evidence found so far, best first. */
  docs: RetrievedDocument[];
  satisfied: boolean;
}

export interface Reflection {
  sufficient: boolean;
  gapQueries: string[];
}

const LABEL = 'DeepResearch';
const HISTORY_MESSAGES = 6;
const HISTORY_MESSAGE_CHARS = 400;
const MAX_QUERIES_PER_SEARCH = 3;
const MAX_GAP_QUERIES = 2;
// Upper bound on the evidence one section is written from (whole chunks only).
const SECTION_CONTEXT_MAX_CHARS = 6000;
// Documents kept in the shared evidence pool (bounds the CTX payload).
const MAX_POOL_DOCS = 40;
const MAX_VERIFIED_SENTENCES = 80;
const STREAM_CHUNK_SIZE = 200;
// Token budget of the JSON agents (planner, reflector, citation check). Thinking
// models spend it on reasoning before the JSON: with a small budget their reply
// comes back empty ("length") and the agent silently uses its fallback.
const DEFAULT_JSON_AGENT_TOKENS = 4000;

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PlanSchema = z.object({
  standaloneQuery: z.string().catch(''),
  language: z.string().catch('it'),
  entities: z.array(z.string()).catch([]),
  sections: z
    .array(
      z.object({
        title: z.string().catch(''),
        question: z.string().catch(''),
        queries: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
});

export const ReflectionSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.number(),
        sufficient: z.boolean().catch(true),
        gapQueries: z.array(z.string()).catch([]),
      })
    )
    .catch([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Turns the planner's reply into sections: trimmed, deduplicated, capped. */
export function sectionsFromPlan(
  plan: z.infer<typeof PlanSchema>,
  fallbackQuestion: string,
  maxSections: number
): ResearchSection[] {
  const seen = new Set<string>();
  const sections: ResearchSection[] = [];
  for (const raw of plan.sections) {
    const question = raw.question.trim();
    if (!question || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    const queries = [question, ...raw.queries]
      .map((q) => q.trim())
      .filter(Boolean);
    sections.push(
      newSection(
        sections.length,
        raw.title.trim() || question,
        question,
        queries
      )
    );
    if (sections.length >= maxSections) break;
  }
  if (!sections.length) {
    sections.push(
      newSection(0, fallbackQuestion, fallbackQuestion, [fallbackQuestion])
    );
  }
  return sections;
}

function newSection(
  id: number,
  title: string,
  question: string,
  queries: string[]
): ResearchSection {
  // Case-insensitive dedupe that keeps the first occurrence (the question).
  const seen = new Set<string>();
  const unique = queries.filter((q) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    id,
    title,
    question,
    queries: unique,
    usedQueries: new Set(),
    gapQueries: [],
    docs: [],
    satisfied: false,
  };
}

/**
 * The evidence pool shared by the whole report: every section's documents
 * fused by RRF (capped), with one global [n] numbering over all their chunks.
 */
export function buildEvidencePool(sections: ResearchSection[]) {
  const docs = reciprocalRankFusion(
    sections.map((s) => s.docs).filter((d) => d.length)
  ).slice(0, MAX_POOL_DOCS);
  return { docs, ...numberChunks(docs) };
}

/**
 * Retrieve → reflect loop. Each round researches the sections that are not yet
 * satisfied, then asks `reflect` whether they are covered. It ends when every
 * section is satisfied, when no new query is left to try, after `maxRounds`
 * rounds, or when `signal` is aborted. Returns the number of rounds run.
 */
export async function runResearchLoop(params: {
  sections: ResearchSection[];
  maxRounds: number;
  search: (
    queries: string[],
    section: ResearchSection
  ) => Promise<RetrievedDocument[]>;
  reflect: (sections: ResearchSection[]) => Promise<Map<number, Reflection>>;
  onRound?: (round: number, active: ResearchSection[]) => void;
  signal?: AbortSignal;
}): Promise<number> {
  const { sections, maxRounds, search, reflect } = params;
  let round = 0;
  while (round < maxRounds) {
    if (params.signal?.aborted) throw new Error('Deep research aborted');
    const active = sections.filter((s) => !s.satisfied);
    if (!active.length) break;
    round++;
    params.onRound?.(round, active);

    await Promise.all(
      active.map(async (s) => {
        const queries = (round === 1 ? s.queries : s.gapQueries)
          .filter((q) => !s.usedQueries.has(q.toLowerCase()))
          .slice(0, MAX_QUERIES_PER_SEARCH);
        s.gapQueries = [];
        if (!queries.length) {
          s.satisfied = true; // nothing new to try
          return;
        }
        queries.forEach((q) => s.usedQueries.add(q.toLowerCase()));
        const found = await search(queries, s);
        s.docs = s.docs.length ? reciprocalRankFusion([s.docs, found]) : found;
      })
    );

    if (round >= maxRounds) break;
    const stillActive = active.filter((s) => !s.satisfied);
    if (!stillActive.length) break;

    const reflections = await reflect(stillActive);
    for (const s of stillActive) {
      const r = reflections.get(s.id);
      const fresh = (r?.gapQueries ?? [])
        .map((q) => q.trim())
        .filter((q) => q && !s.usedQueries.has(q.toLowerCase()))
        .slice(0, MAX_GAP_QUERIES);
      s.gapQueries = fresh;
      // Covered, or nothing new to look for: this section is done.
      s.satisfied = !r || r.sufficient || fresh.length === 0;
    }
  }
  return round;
}

/**
 * Cleans up model Markdown so it renders readably: a blank line around headings
 * and before a list, no run of blank lines, no space left before punctuation
 * where a citation marker was removed.
 */
export function normalizeMarkdown(text: string): string {
  const isHeading = (l: string) => /^#{1,6}\s/.test(l);
  const isItem = (l: string) => /^\s*([-*+]|\d+[.)])\s/.test(l);
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/[ \t]+$/, '').replace(/ +([.,;:!?])/g, '$1');
    const prev = out.length ? out[out.length - 1] : '';
    const needsGap =
      prev !== '' &&
      line !== '' &&
      (isHeading(line) || isHeading(prev) || (isItem(line) && !isItem(prev)));
    if (needsGap) out.push('');
    out.push(line);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────────────────────

class DeepResearchSystem {
  private llm: AgentLLM;
  private model: string;
  private temperature: number;
  private max_tokens: number;
  private indexName: string;
  private collectionId?: string;
  private filterIds?: string[];
  private maxRounds: number;
  private maxSubQuestions: number;
  private jsonTokens: number;
  /** Set when a JSON agent had to use its fallback; shown in the step text. */
  private fallbackNote = '';
  private searchTimeoutMs: number;
  private searchLimit: ReturnType<typeof createLimiter>;
  private signal?: AbortSignal;
  private streamChunk?: (chunk: string) => void;
  /** Everything sent to the client as answer text so far. */
  private streamedText = '';

  constructor(options: DeepResearchOptions) {
    this.llm = new AgentLLM(
      options.baseURL,
      options.apiKey,
      options.model,
      LABEL
    );
    this.model = options.model;
    this.temperature = options.temperature ?? 0.5;
    this.max_tokens = options.max_tokens ?? 4096;
    this.indexName = options.indexName ?? process.env.ELASTIC_INDEX ?? '';
    this.collectionId = options.collectionId;
    this.filterIds = options.filterIds;
    this.maxRounds = options.maxRounds ?? envInt('DEEP_MAX_ROUNDS', 3);
    this.maxSubQuestions =
      options.maxSubQuestions ?? envInt('DEEP_MAX_SUBQUESTIONS', 5);
    this.jsonTokens = envInt('DEEP_JSON_MAX_TOKENS', DEFAULT_JSON_AGENT_TOKENS);
    this.searchTimeoutMs = envInt('DEEP_SEARCH_TIMEOUT_MS', 60_000);
    this.searchLimit = createLimiter(envInt('DEEP_SEARCH_CONCURRENCY', 3));
    this.signal = options.signal;
  }

  /** askJSON options shared by the deep research agents. */
  private get jsonOptions() {
    return {
      bypassBreaker: true,
      escalateOnLength: true,
      onFallback: (reason: string) => {
        this.fallbackNote = reason;
      },
    };
  }

  /** Returns and clears the note about a fallback, formatted for the panel. */
  private takeFallbackNote(): string {
    const note = this.fallbackNote;
    this.fallbackNote = '';
    return note ? `\n⚠ fallback used: ${note}` : '';
  }

  private checkAbort() {
    if (this.signal?.aborted) throw new Error('Deep research aborted');
  }

  private async runStep<T>(
    agent: string,
    step: string,
    fn: () => Promise<T>,
    /** Short text for the progress panel; default: a compact dump of the output. */
    describe?: (output: T) => string
  ): Promise<T> {
    this.checkAbort();
    const start = Date.now();
    emitStepChunk(this.streamChunk, agent, step, 'start');
    console.log(`[${LABEL}][${agent}] ${step}`);
    const output = await fn();
    const durationMs = Date.now() - start;
    emitStepChunk(
      this.streamChunk,
      agent,
      step,
      'done',
      durationMs,
      describe ? describe(output) : summarizeForTrace(output)
    );
    console.log(`[${LABEL}][${agent}] ✓ ${durationMs}ms`);
    return output;
  }

  async execute(
    messages: Message[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    this.streamChunk = onChunk;
    this.streamedText = '';
    const started = Date.now();
    try {
      const question = this.extractUserQuery(messages);

      // 1. Plan
      const plan = await this.runStep(
        'Planner',
        'Planning the research',
        () => this.planner(messages, question),
        (p) =>
          `${p.sections.length} sub-questions, entities: ${
            p.entities.join(', ') || 'none'
          }${this.takeFallbackNote()}`
      );
      const standalone = plan.standaloneQuery.trim() || question;
      const lang = plan.language;
      const sections = sectionsFromPlan(plan, standalone, this.maxSubQuestions);

      // 2. Entities named in the question
      const entityDocIds = await this.runStep(
        'EntityRetriever',
        'Finding documents that mention the entities in the question',
        () => this.entityDocIds(plan.entities),
        (ids) =>
          ids.length
            ? `${ids.length} documents mention ${plan.entities.join(', ')}`
            : 'no entities in the question, or none found in the archive'
      ).catch(() => [] as string[]);

      // 3–4. Research loop
      const rounds = await runResearchLoop({
        sections,
        maxRounds: this.maxRounds,
        signal: this.signal,
        search: (queries, section) =>
          this.runStep(
            'Researcher',
            `Searching: ${section.title}`,
            () => this.researchSection(queries, entityDocIds),
            (r) => {
              const chunks = r.docs.reduce((n, d) => n + d.chunks.length, 0);
              const problems = [
                r.stats.timeouts ? `${r.stats.timeouts} timed out` : '',
                r.stats.errors ? `${r.stats.errors} failed` : '',
              ].filter(Boolean);
              return `${queries.length} queries: ${
                r.docs.length
              } documents, ${chunks} chunks${
                problems.length ? ` (${problems.join(', ')})` : ''
              }`;
            }
          )
            .then((r) => r.docs)
            .catch((err) => {
              console.warn(
                `[${LABEL}] search failed for "${section.title}":`,
                err
              );
              return [] as RetrievedDocument[];
            }),
        reflect: (active) =>
          this.runStep(
            'Reflector',
            'Checking what is still missing',
            () => this.reflector(standalone, active),
            (m) =>
              active
                .map((sec) => {
                  const r = m.get(sec.id);
                  return `${sec.title}: ${
                    !r || r.sufficient
                      ? 'covered'
                      : `missing, will try ${r.gapQueries.join(' | ') || '-'}`
                  }`;
                })
                .join('\n') + this.takeFallbackNote()
          ),
        onRound: (round, active) =>
          console.log(
            `[${LABEL}] round ${round}/${this.maxRounds}: ${active.length} sub-question(s)`
          ),
      });

      const pool = buildEvidencePool(sections);
      console.log(
        `[${LABEL}] evidence per section: ${sections
          .map((s) => `${s.title}: ${s.docs.length} docs`)
          .join(' | ')}`
      );
      if (!pool.docs.length) {
        const none =
          lang === 'en'
            ? 'I found nothing in the archive that is relevant to this question.'
            : "Non ho trovato nulla di pertinente a questa domanda nell'archivio.";
        this.emit(none);
        return none;
      }

      // 5. Write the sections
      const drafts = await Promise.all(
        sections.map((s) =>
          this.runStep('SectionWriter', `Writing: ${s.title}`, () =>
            this.sectionWriter(
              standalone,
              lang,
              s,
              pool,
              sections.filter((o) => o !== s).map((o) => o.title)
            )
          )
        )
      );
      const body = sections
        .map((s, i) => `## ${s.title}\n\n${drafts[i].trim()}`)
        .join('\n\n');

      // 6. Stream the report: introduction, sections, conclusion
      const report = await this.runStep(
        'Synthesizer',
        'Writing the report',
        () => this.synthesize(standalone, lang, body)
      );

      // 7. Verify the citations; replace the streamed text if anything changed
      let finalReport = report;
      try {
        const verified = await this.runStep(
          'CitationVerifier',
          'Checking that each citation supports its sentence',
          () =>
            verifyCitations({
              llm: this.llm,
              draft: report,
              chunkIndexMap: pool.chunkIndexMap,
              chunkMap: pool.chunkMap,
              maxSentences: MAX_VERIFIED_SENTENCES,
              maxTokens: this.jsonTokens,
              jsonOptions: this.jsonOptions,
            })
        );
        finalReport = verified.answer;
      } catch (err) {
        console.warn(`[${LABEL}] citation verification failed`, err);
      }
      if (onChunk && finalReport !== this.streamedText) {
        onChunk(RESET_SENTINEL);
        this.streamedText = '';
        this.streamText(finalReport);
      }

      onChunk?.(
        buildContextSentinel(pool.docs, pool.chunkMap, pool.chunkIndexMap)
      );
      console.log(
        `[${LABEL}] done in ${Date.now() - started}ms: ${
          sections.length
        } sections, ${rounds} round(s), ${pool.docs.length} documents`
      );
      return finalReport;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${LABEL}] Pipeline error:`, err);
      if (onChunk && !this.signal?.aborted) {
        onChunk(
          `\n\n> ⚠️ The deep research pipeline encountered an error and could not complete.\n> _${msg}_`
        );
      }
      throw err;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Agents
  // ───────────────────────────────────────────────────────────────────────────

  private async planner(messages: Message[], question: string) {
    const history = messages
      .slice(-(HISTORY_MESSAGES + 1), -1)
      .map(
        (m) =>
          `${m.role.toUpperCase()}: ${m.content.slice(
            0,
            HISTORY_MESSAGE_CHARS
          )}`
      )
      .join('\n');

    const system = `You are a Research Planning Agent. A user asks a question that will be answered with a report written from an archive of documents.
1. Rewrite the question so it is understandable without the chat history ("standaloneQuery").
2. Detect the language of the question: "it" or "en" ("language").
3. List the named entities in it: people, places, organisations ("entities").
4. Split the question into 3 to ${this.maxSubQuestions} focused sub-questions that together cover it. Each becomes one report section: a short "title", the "question" to research, and up to 2 alternative search "queries" (keywords or paraphrases). For a simple question use fewer sub-questions.
RESPOND ONLY WITH JSON: {"standaloneQuery": "...", "language": "it", "entities": ["..."], "sections": [{"title": "...", "question": "...", "queries": ["..."]}]}`;

    return this.llm.askJSON({
      agent: 'Planner',
      system,
      user: `${
        history ? `Chat history:\n${history}\n\n` : ''
      }Question: ${question}`,
      schema: PlanSchema,
      fallback: {
        standaloneQuery: question,
        language: 'it',
        entities: [],
        sections: [],
      },
      maxTokens: this.jsonTokens,
      ...this.jsonOptions,
    });
  }

  private async entityDocIds(names: string[]): Promise<string[]> {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    if (!clean.length || !this.indexName) return [];
    const lookup = await findEntityDocuments({
      indexName: this.indexName,
      names: clean,
      collectionId: this.collectionId,
      filterIds: this.filterIds,
    });
    return lookup.docIds.map(String);
  }

  /**
   * Hybrid search (dense + full-text, fused inside vectorSearch) for each query,
   * plus the same queries restricted to the documents that mention the entities
   * of the question. Searches run through a concurrency limiter so the
   * embedder is not flooded.
   */
  private async researchSection(
    queries: string[],
    entityDocIds: string[]
  ): Promise<{
    docs: RetrievedDocument[];
    stats: { timeouts: number; errors: number };
  }> {
    const stats = { timeouts: 0, errors: 0 };
    const base = {
      indexName: this.indexName,
      collectionId: this.collectionId,
      queries,
      forceRag: false,
      retrievalMethod: 'full',
      maxQueries: MAX_QUERIES_PER_SEARCH,
      label: LABEL,
      timeoutMs: this.searchTimeoutMs,
      limit: this.searchLimit,
      stats,
    };
    const lists = await Promise.all([
      searchArchive({ ...base, filterIds: this.filterIds }),
      entityDocIds.length
        ? searchArchive({ ...base, filterIds: entityDocIds })
        : Promise.resolve([] as RetrievedDocument[]),
    ]);
    return { docs: reciprocalRankFusion(lists.filter((l) => l.length)), stats };
  }

  private async reflector(
    question: string,
    active: ResearchSection[]
  ): Promise<Map<number, Reflection>> {
    const digest = active
      .map((s) => {
        const snippets = s.docs
          .flatMap((d) =>
            d.chunks
              .slice(0, 1)
              .map((c) => `- (${d.title}) ${c.text.slice(0, 200)}`)
          )
          .slice(0, 6)
          .join('\n');
        return `SECTION ${s.id}: ${s.question}\nQueries tried: ${Array.from(
          s.usedQueries
        ).join(' | ')}\nDocuments found: ${s.docs.length}\nTop evidence:\n${
          snippets || '(none)'
        }`;
      })
      .join('\n\n');

    const system = `You are a Research Coverage Agent. For each SECTION decide whether the evidence found so far is enough to answer its question in a report. If it is not, propose up to ${MAX_GAP_QUERIES} NEW search queries (different from those already tried) that target what is missing.
RESPOND ONLY WITH JSON: {"sections": [{"id": <section number>, "sufficient": true|false, "gapQueries": ["..."]}]}`;

    const reply = await this.llm.askJSON({
      agent: 'Reflector',
      system,
      user: `Overall question: ${question}\n\n${digest}`,
      schema: ReflectionSchema,
      fallback: { sections: [] },
      maxTokens: this.jsonTokens,
      ...this.jsonOptions,
    });
    return new Map(
      reply.sections.map((r) => [
        r.id,
        { sufficient: r.sufficient, gapQueries: r.gapQueries },
      ])
    );
  }

  private languageInstruction(lang: string) {
    return lang === 'en' ? 'Respond in ENGLISH.' : 'Rispondi in ITALIANO.';
  }

  private async sectionWriter(
    question: string,
    lang: string,
    section: ResearchSection,
    pool: ReturnType<typeof buildEvidencePool>,
    otherTitles: string[]
  ): Promise<string> {
    const context = buildNumberedContext(
      section.docs,
      pool.chunkIndexMap,
      null,
      SECTION_CONTEXT_MAX_CHARS
    );
    if (!context) {
      return lang === 'en'
        ? 'The archive contains no information on this point.'
        : "L'archivio non contiene informazioni su questo punto.";
    }

    const system = `You are an expert research writer. ${this.languageInstruction(
      lang
    )}
Write ONE section of a research report, using ONLY the provided context. Do NOT state facts that are not in the context.
Format (Markdown), easy to scan:
- First one sentence that answers the section question directly.
- Then a bullet list ("- "), one bullet per distinct fact, person or item: put the key name in bold (**Name**), then a concise explanation of at most two sentences. At most 8 bullets. No long paragraphs.
- Cover ONLY this section's question. The other sections of the report cover: ${
      otherTitles.join('; ') || 'nothing else'
    }. Do not repeat what belongs to them.
- If the context only partly answers the question, add one short sentence saying what is missing. Do not claim the archive has no information if the context contains relevant facts.
- Do not write a heading and do not repeat the question.
Cite your sources: the context is split into numbered chunks like "[3] text". After each statement that a chunk supports, add that chunk's number in square brackets, e.g. "... was approved [3]." or "[2][5]" for several chunks. Cite only numbers that appear in the context, never invent one, and do not add a list of sources.`;

    const resp = await this.llm.withRetry(() =>
      this.llm.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Context:\n${context}\n\nOverall question: ${question}\nSection: ${section.title}\nSection question: ${section.question}`,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.max_tokens,
        stream: false,
      })
    );
    return resp.choices[0]?.message?.content?.trim() ?? '';
  }

  /** Streams introduction + sections + conclusion; returns the whole report. */
  private async synthesize(
    question: string,
    lang: string,
    body: string
  ): Promise<string> {
    const intro = await this.streamedPart(
      lang,
      `Write ONLY: a level-1 Markdown heading with a fitting report title, then an introduction of two sentences (at most 60 words) saying what the report covers and how it is organised. Do NOT list names, facts or findings, and do not use citations.`,
      question,
      body
    );
    this.streamText('\n\n');
    this.streamText(body);
    this.streamText('\n\n');
    const conclusion = await this.streamedPart(
      lang,
      `Write the conclusion of the research report: start with the heading "## ${
        lang === 'en' ? 'Conclusions' : 'Conclusioni'
      }", then at most 5 bullet points ("- "), one sentence each, with the key takeaways, then one sentence on the main gaps if the sections report any. At most 120 words in total. Do not repeat the text of the sections and add no new facts.`,
      question,
      body
    );
    return normalizeMarkdown(`${intro}\n\n${body}\n\n${conclusion}`);
  }

  private async streamedPart(
    lang: string,
    task: string,
    question: string,
    body: string
  ): Promise<string> {
    const system = `You are an expert research writer. ${this.languageInstruction(
      lang
    )}
${task}
You may reuse the [n] citation markers found in the sections for statements they support; never invent a marker.`;
    const stream = await this.llm.withRetry(() =>
      this.llm.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Question: ${question}\n\nSections:\n${body}`,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.max_tokens,
        stream: true,
      })
    );
    // Reasoning deltas (a separate field on thinking models) are not forwarded.
    let text = '';
    for await (const part of stream) {
      this.checkAbort();
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        this.emit(delta);
      }
    }
    return text.trim();
  }

  private emit(text: string) {
    this.streamedText += text;
    this.streamChunk?.(text);
  }

  private streamText(text: string) {
    if (!this.streamChunk) return;
    for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
      this.emit(text.slice(i, i + STREAM_CHUNK_SIZE));
    }
  }

  private extractUserQuery(messages: Message[]): string {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    return last?.content ?? '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public factory
// ─────────────────────────────────────────────────────────────────────────────

export async function executeDeepResearch(
  messages: Message[],
  options: DeepResearchOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const system = new DeepResearchSystem(options);
  return system.execute(messages, onChunk);
}
