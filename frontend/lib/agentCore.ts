import OpenAI from 'openai';
import { healClient } from './llmCompat';
import { z } from 'zod';
import { search as runVectorSearch } from './vectorSearch';
import {
  findCitedSentences,
  parseJSONWithSchema,
  removeCitations,
} from './agentUtils';

/**
 * Building blocks shared by the agentic chat modes (multiAgent.ts, deepResearch.ts):
 * retrieval types, rank fusion, numbered-context building, the JSON-agent LLM
 * wrapper (retry + schema validation + circuit breaker), archive search and the
 * step-progress sentinel.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DocumentChunk {
  id: string;
  distance: number;
  text: string;
  text_anonymized?: string;
  metadata: { doc_id: string; chunk_size: number };
}

export interface RetrievedDocument {
  id: number | string;
  title: string;
  preview: string;
  chunks: DocumentChunk[];
  full_docs?: boolean;
}

// Raw shape returned by the indexer backend
export interface RawIndexerDoc {
  doc: { id: number; name: string; preview?: string };
  chunks: DocumentChunk[];
  full_docs?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sentinels (parsed by hooks/use-chat.ts)
// ─────────────────────────────────────────────────────────────────────────────

// Sent to the browser to discard the answer text streamed so far (the answer
// is being regenerated or corrected); use-chat.ts clears the message on it.
export const RESET_SENTINEL = '\x02DAVE_RESET\x03';

/** Emit a step-progress sentinel event to the frontend stream. */
export function emitStepChunk(
  streamChunk: ((chunk: string) => void) | undefined,
  agent: string,
  step: string,
  status: 'start' | 'done',
  durationMs?: number,
  details?: string
) {
  const payload = JSON.stringify({
    agent,
    step,
    status,
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(details ? { details } : {}),
  });
  streamChunk?.(`\x02DAVE_STEP\x1E${payload}\x03`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion
 * score(d) = Σ  1 / (k + rank(d, list_i))
 * Chunks from the same document that appear in multiple lists are merged.
 */
export function reciprocalRankFusion(
  lists: RetrievedDocument[][],
  k = 60
): RetrievedDocument[] {
  const scores = new Map<string, number>();
  const docMap = new Map<string, RetrievedDocument>();

  for (const list of lists) {
    list.forEach((doc, rank) => {
      const key = String(doc.id);
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));

      if (!docMap.has(key)) {
        docMap.set(key, { ...doc, chunks: [...doc.chunks] });
      } else {
        // merge unique chunks
        const existing = docMap.get(key)!;
        const existingIds = new Set(existing.chunks.map((c) => c.id));
        for (const chunk of doc.chunks) {
          if (!existingIds.has(chunk.id)) {
            existing.chunks.push(chunk);
          }
        }
      }
    });
  }

  return Array.from(scores.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => docMap.get(key)!)
    .filter(Boolean);
}

/**
 * The chunks the answer is written from, each prefixed with its global [n]
 * number (the same numbering the frontend uses for citation tooltips). With
 * `keep` only those numbers are included; whole chunks are dropped from the
 * end once `maxChars` is reached, so the best-ranked ones survive.
 */
export function buildNumberedContext(
  docs: RetrievedDocument[],
  chunkIndexMap: { [chunkId: string]: number },
  keep: Set<number> | null,
  maxChars: number
): string {
  const blocks: string[] = [];
  let used = 0;
  for (const doc of docs) {
    const lines: string[] = [];
    for (const chunk of doc.chunks) {
      const n = chunkIndexMap[chunk.id];
      if (n === undefined || (keep && !keep.has(n))) continue;
      const line = `[${n}] ${chunk.text}`;
      if (used + line.length > maxChars && used > 0) continue;
      used += line.length;
      lines.push(line);
    }
    if (lines.length) {
      blocks.push(
        `<document name="${doc.title}">\n${lines.join('\n')}\n</document>`
      );
    }
  }
  return blocks.join('\n\n');
}

/**
 * Numbers every chunk of `docs` (1-based, in order) so the writer prompts, the
 * citation checks and the frontend's tooltips all use the same [n].
 */
export function numberChunks(docs: RetrievedDocument[]) {
  const chunkMap: { [chunkId: string]: string } = {};
  const chunkIndexMap: { [chunkId: string]: number } = {};
  let n = 0;
  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      n++;
      chunkMap[chunk.id] = chunk.text;
      chunkIndexMap[chunk.id] = n;
    }
  }
  return { chunkMap, chunkIndexMap };
}

/**
 * The DAVE_CTX sentinel chunk: retrieved documents plus the chunk maps, sent
 * after the answer text. use-chat.ts strips it, fills the context panel and
 * renders the [n] citation tooltips from it.
 */
export function buildContextSentinel(
  docs: RetrievedDocument[],
  chunkMap: { [chunkId: string]: string },
  chunkIndexMap: { [chunkId: string]: number }
): string {
  const payload = JSON.stringify({
    docs: docs.map((doc) => ({
      id: typeof doc.id === 'string' ? parseInt(doc.id, 10) || doc.id : doc.id,
      title: doc.title,
      preview: doc.preview,
      chunks: doc.chunks.map((c) => ({
        id: c.id,
        distance: c.distance,
        text: c.text,
        text_anonymized: c.text_anonymized,
        metadata: c.metadata,
      })),
      full_docs: doc.full_docs ?? false,
    })),
    chunkMap,
    chunkIndexMap,
  });
  return `\x02DAVE_CTX\x1E${payload}\x03`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM wrapper for JSON agents
// ─────────────────────────────────────────────────────────────────────────────

// Some models "think" before answering and send that reasoning in a separate
// field. With the small token budgets of the JSON agents they can spend the
// whole budget on it and return an empty reply (finish_reason "length"). A
// retry fails the same way, and so does every later JSON agent, so after a few
// such replies the JSON agents are skipped for a while and use their fallback.
const JSON_AGENT_BREAKER_THRESHOLD = 2;
const JSON_AGENT_BREAKER_MS = 10 * 60 * 1000;
const jsonAgentBreakers = new Map<string, { empty: number; until: number }>();

export class AgentLLM {
  readonly openai: OpenAI;

  constructor(
    private readonly baseURL: string,
    apiKey: string,
    private readonly model: string,
    /** Log prefix, e.g. "MultiAgent" or "DeepResearch". */
    private readonly label: string
  ) {
    // Self-healing: parameters the server rejects are dropped (llmCompat.ts).
    this.openai = healClient(new OpenAI({ baseURL, apiKey }));
  }

  async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastErr = err;
        const isRetryable =
          (err as any)?.status >= 500 ||
          (err as any)?.code === 'ECONNRESET' ||
          (err as any)?.name === 'FetchError';
        if (attempt < maxAttempts && isRetryable) {
          const delay = attempt * 1000;
          console.warn(
            `[${this.label}] LLM call failed (attempt ${attempt}), retrying in ${delay}ms...`,
            err
          );
          await new Promise((r) => setTimeout(r, delay));
        } else {
          break;
        }
      }
    }
    throw lastErr;
  }

  /**
   * Asks the model for a JSON reply and validates it against `schema`. A reply
   * that is not valid JSON for the schema gets one repair attempt (the model
   * sees what was wrong); after that the caller's fallback is used.
   */
  async askJSON<T>(params: {
    agent: string;
    system: string;
    user: string;
    schema: z.ZodType<T>;
    fallback: T;
    maxTokens: number;
    temperature?: number;
    expectArray?: boolean;
    /**
     * Ignore (and never arm) the empty-reply circuit breaker. For callers whose
     * fallback would silently ruin the result, so the model is always asked.
     */
    bypassBreaker?: boolean;
    /** When a reply is cut off before any content, retry once with double the budget. */
    escalateOnLength?: boolean;
    /** Called with the reason whenever the fallback is returned. */
    onFallback?: (reason: string) => void;
  }): Promise<T> {
    const { agent, system, user, schema, fallback } = params;
    let maxTokens = params.maxTokens;
    const useFallback = (reason: string): T => {
      params.onFallback?.(reason);
      return fallback;
    };

    const breakerKey = `${this.baseURL}|${this.model}`;
    const breaker = jsonAgentBreakers.get(breakerKey) ?? { empty: 0, until: 0 };
    if (!params.bypassBreaker && Date.now() < breaker.until) {
      console.log(
        `[${this.label}][${agent}] skipped: this model's replies were empty (reasoning used the whole token budget), using the fallback`
      );
      return useFallback(
        "skipped: the model's recent replies were empty (circuit breaker)"
      );
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    let escalated = false;
    const maxAttempts = params.escalateOnLength ? 3 : 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const resp = await this.withRetry(() =>
        this.openai.chat.completions.create({
          model: this.model,
          messages,
          temperature: params.temperature ?? 0.1,
          max_tokens: maxTokens,
          stream: false,
        })
      );
      const text = resp.choices[0]?.message?.content ?? '';
      const parsed = parseJSONWithSchema(text, schema, params.expectArray);
      if (parsed !== null) {
        if (!params.bypassBreaker) {
          jsonAgentBreakers.set(breakerKey, { empty: 0, until: 0 });
        }
        return parsed;
      }

      // Empty reply cut off by the token limit: the model spent the budget
      // reasoning. Repeating the call with the same budget would fail
      // identically, so it is retried with a larger one when allowed.
      if (!text.trim() && resp.choices[0]?.finish_reason === 'length') {
        if (params.escalateOnLength && !escalated) {
          escalated = true;
          console.warn(
            `[${
              this.label
            }][${agent}] empty reply: the token budget (${maxTokens}) went on reasoning; retrying with ${
              maxTokens * 2
            }`
          );
          maxTokens *= 2;
          continue;
        }
        let open = false;
        if (!params.bypassBreaker) {
          const empty = breaker.empty + 1;
          open = empty >= JSON_AGENT_BREAKER_THRESHOLD;
          jsonAgentBreakers.set(breakerKey, {
            empty,
            until: open ? Date.now() + JSON_AGENT_BREAKER_MS : 0,
          });
        }
        console.warn(
          `[${
            this.label
          }][${agent}] empty reply: the token budget (${maxTokens}) went on reasoning${
            open ? '; skipping the JSON agents for 10 minutes' : ''
          }`
        );
        return useFallback(
          `the model's reply was empty: its ${maxTokens}-token budget went on reasoning`
        );
      }

      console.warn(
        `[${this.label}][${agent}] reply was not valid JSON for its schema (attempt ${attempt})`
      );
      messages.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content:
            'That reply was not valid JSON in the required format. Reply again with ONLY the JSON, no other text.',
        }
      );
    }
    return useFallback('the model did not return valid JSON');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Archive search
// ─────────────────────────────────────────────────────────────────────────────

/** Runs at most `max` of the functions passed to the returned wrapper at once. */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs `queries` concurrently against the archive (each with its own timeout)
 * and merges the results, deduplicating by document id and merging chunks.
 */
export async function searchArchive(params: {
  indexName: string;
  collectionId?: string;
  filterIds?: string[];
  queries: string[];
  retrievalMethod: string;
  forceRag: boolean;
  /** How many of `queries` to actually fire. */
  maxQueries: number;
  label: string;
  /** Per-query timeout (default 15 s). */
  timeoutMs?: number;
  /** Wraps every single search, e.g. to cap how many run at once. */
  limit?: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Incremented for every search that timed out / failed. */
  stats?: { timeouts: number; errors: number };
}): Promise<RetrievedDocument[]> {
  const { indexName, queries, label } = params;
  if (!indexName) {
    console.warn(`[${label}] indexName not set – skipping retrieval`);
    return [];
  }

  const seenIds = new Set<string>();
  const docs: RetrievedDocument[] = [];

  // Fire all queries concurrently (each with its own timeout) and merge
  // results after. This reduces retrieval latency from O(n) sequential
  // round-trips to O(1) — the slowest single request sets the pace.
  const batchResults = await Promise.all(
    queries.slice(0, params.maxQueries).map(async (query) => {
      const run = () => {
        // The timer starts when the search starts, not while it waits for a slot.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(
            () => resolve('timeout'),
            params.timeoutMs ?? 15_000
          );
        });
        return Promise.race([
          runVectorSearch({
            collectionName: indexName,
            query,
            filterIds: params.filterIds,
            retrievalMethod: params.retrievalMethod,
            forceRag: params.forceRag,
            collectionId: params.collectionId,
          }),
          timeout,
        ]).finally(() => clearTimeout(timer!));
      };
      try {
        const result = await (params.limit ? params.limit(run) : run());

        if (result === 'timeout') {
          if (params.stats) params.stats.timeouts++;
          console.warn(`[${label}][callIndexer] Timeout for query "${query}"`);
          return [] as RawIndexerDoc[];
        }

        return result as unknown as RawIndexerDoc[];
      } catch (err) {
        if (params.stats) params.stats.errors++;
        console.error(
          `[${label}][callIndexer] Error for query "${query}":`,
          err
        );
        return [] as RawIndexerDoc[];
      }
    })
  );

  // Merge parallel results, deduplicating by document id and merging chunks
  for (const rawDocs of batchResults) {
    for (const raw of rawDocs) {
      const key = String(raw.doc.id);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        docs.push({
          id: raw.doc.id,
          title: raw.doc.name,
          preview: raw.doc.preview ?? '',
          chunks: raw.chunks,
          full_docs: raw.full_docs,
        });
      } else {
        // Merge new chunks into the already-seen document
        const existing = docs.find((d) => String(d.id) === key)!;
        const existingIds = new Set(existing.chunks.map((c) => c.id));
        for (const chunk of raw.chunks) {
          if (!existingIds.has(chunk.id)) {
            existing.chunks.push(chunk);
          }
        }
      }
    }
  }

  return docs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Citation verification
// ─────────────────────────────────────────────────────────────────────────────

const CitationCheckSchema = z.object({
  unsupported: z
    .array(z.object({ sentence: z.number(), marker: z.number() }))
    .catch([]),
});

/**
 * Drops the [n] markers of `draft` that point at no chunk, then asks the model
 * whether each remaining cited chunk really supports its sentence and drops the
 * ones that do not. Any failure keeps the citations as they were.
 */
export async function verifyCitations(params: {
  llm: AgentLLM;
  draft: string;
  chunkIndexMap: { [chunkId: string]: number };
  chunkMap: { [chunkId: string]: string };
  maxSentences: number;
  /** Token budget of the verdict call (thinking models also spend it on reasoning). */
  maxTokens?: number;
  /** Extra askJSON options (breaker bypass, budget escalation, fallback notice). */
  jsonOptions?: {
    bypassBreaker?: boolean;
    escalateOnLength?: boolean;
    onFallback?: (reason: string) => void;
  };
}): Promise<{ answer: string; removed: number }> {
  const { llm, draft, chunkIndexMap, chunkMap } = params;
  const validMarkers = new Set(Object.values(chunkIndexMap));
  const chunkByNumber = new Map<number, string>();
  for (const [id, n] of Object.entries(chunkIndexMap)) {
    chunkByNumber.set(n, chunkMap[id] ?? '');
  }

  // 1. Markers that point at no chunk.
  let answer = removeCitations(draft, [], validMarkers);

  // 2. Markers whose chunk does not support the sentence.
  const cited = findCitedSentences(answer).slice(0, params.maxSentences);
  if (!cited.length) {
    return { answer, removed: 0 };
  }

  const items = cited
    .map(
      (c) =>
        `SENTENCE ${c.index}: ${c.text}\n` +
        c.markers
          .map(
            (n) =>
              `  CHUNK [${n}]: ${(chunkByNumber.get(n) ?? '').slice(0, 400)}`
          )
          .join('\n')
    )
    .join('\n\n');

  const system = `You are a Citation Verification Agent.
For each SENTENCE you get the numbered CHUNKS it cites. A citation is supported only if the chunk directly states or clearly implies what the sentence claims.
A SENTENCE may be a fragment of a longer sentence: flag a citation only when the chunk clearly does not support it.
Return ONLY a JSON object listing the unsupported citations:
{"unsupported": [{"sentence": <sentence number>, "marker": <chunk number>}]}
If every citation is supported, return {"unsupported": []}.
RESPOND ONLY WITH THE JSON OBJECT.`;

  const check = await llm.askJSON({
    agent: 'CitationVerifier',
    system,
    user: items,
    schema: CitationCheckSchema,
    fallback: { unsupported: [] },
    maxTokens: params.maxTokens ?? 400,
    ...params.jsonOptions,
  });

  // Only accept removals that name a sentence and marker we actually showed.
  const shown = new Map(cited.map((c) => [c.index, new Set(c.markers)]));
  const removals = check.unsupported.filter((u) =>
    shown.get(u.sentence)?.has(u.marker)
  );
  if (removals.length) {
    answer = removeCitations(answer, removals, validMarkers);
  }
  return { answer, removed: removals.length };
}
