import OpenAI from 'openai';
import { search as runVectorSearch } from './vectorSearch';

/**
 * Multi-Agent RAG System
 *
 * Pipeline:
 *  1. QueryAnalyzer        – understand intent, topics, language
 *  2. QueryRewriter        – expand into multiple search queries
 *  3. Orchestrator         – choose retrieval strategy (dense / fulltext / hybrid / summary)
 *  4. Retrievers           – dense, fulltext, or document-summary retrievers
 *  5. ResultFusion         – RRF (Reciprocal Rank Fusion) across retriever results
 *  6. RelevanceCoverage    – check if context is sufficient; if not, loop back (max 2 iterations)
 *  7. ContextCompressor    – rewrite context to extract only relevant information
 *  8. AnswerGenerator      – generate the final answer from compressed context
 *  9. AnswerEvaluator      – score for coverage / hallucinations; if bad, loop back (max 2 iterations)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DocumentChunk {
  id: string;
  distance: number;
  text: string;
  text_anonymized?: string;
  metadata: { doc_id: string; chunk_size: number };
}

interface RetrievedDocument {
  id: number | string;
  title: string;
  preview: string;
  chunks: DocumentChunk[];
  full_docs?: boolean;
}

// Raw shape returned by the indexer backend
interface RawIndexerDoc {
  doc: { id: number; name: string; preview?: string };
  chunks: DocumentChunk[];
  full_docs?: boolean;
}

type OrchestratorStrategy = 'dense' | 'fulltext' | 'hybrid' | 'summary';

interface QueryAnalysis {
  intent: string;
  keyTopics: string[];
  queryType:
    | 'factual'
    | 'analytical'
    | 'comparative'
    | 'summary'
    | 'procedural';
  language: string;
  requiresFullDocument: boolean;
}

interface OrchestratorDecision {
  strategy: OrchestratorStrategy;
  reasoning: string;
}

interface CoverageResult {
  isSufficient: boolean;
  coverageIssues: string[];
  gapQueries: string[];
}

interface EvaluationResult {
  isGood: boolean;
  score: number; // 0–10
  issues: string[];
  additionalInstructions: string;
}

// ── Tracing ──────────────────────────────────────────────────────────────────

interface TraceEntry {
  agent: string;
  step: string;
  timestamp: string;
  durationMs: number;
  output?: unknown;
  notes?: string;
}

interface AgentTrace {
  query: string;
  strategy: OrchestratorStrategy | null;
  retrievalIterations: number;
  answerIterations: number;
  totalMs: number;
  steps: TraceEntry[];
}

// ── State ─────────────────────────────────────────────────────────────────────

interface AgentState {
  originalQuery: string;
  messages: Message[];
  // step 1
  queryAnalysis: QueryAnalysis | null;
  // step 2
  rewrittenQueries: string[];
  // step 3
  strategy: OrchestratorStrategy | null;
  orchestratorReasoning: string;
  // step 4
  denseResults: RetrievedDocument[];
  fulltextResults: RetrievedDocument[];
  summaryResults: RetrievedDocument[];
  // step 5
  fusedResults: RetrievedDocument[];
  // step 6
  isContextSufficient: boolean;
  coverageIssues: string[];
  gapQueries: string[];
  retrievalIteration: number;
  // step 7
  compressedContext: string;
  // step 8
  draftAnswer: string;
  answerIteration: number;
  answerFeedback: string;
  // step 9 → final
  finalAnswer: string;
  // step 10 – citations
  /** flat map of every chunk in the fused results: chunkId → display text */
  chunkMap: { [chunkId: string]: string };
  /** chunkId → 1-based sequential number used in [n] markers */
  chunkIndexMap: { [chunkId: string]: number };
  /** finalAnswer annotated with inline [n] citation markers */
  citedAnswer: string;
  // trace
  trace: TraceEntry[];
}

export interface MultiAgentOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  // Retrieval
  indexerBaseURL?: string;
  indexName?: string;
  collectionId?: string;
  filterIds?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIEVAL_ITERATIONS = 2;
const MAX_ANSWER_ITERATIONS = 2;
const MAX_QUERIES_PER_RETRIEVER = 3; // how many expanded queries to actually fire

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Try to parse JSON from an LLM text response (handles markdown code fences). */
function extractJSON<T>(text: string): T | null {
  // 1. direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    /* continue */
  }

  // 2. markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]) as T;
    } catch {
      /* continue */
    }
  }

  // 3. first {...} in the text
  const objMatch = text.match(/\{[\s\S]+\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* continue */
    }
  }

  return null;
}

/** Try to parse a JSON array from an LLM text response. */
function extractJSONArray(text: string): string[] | null {
  const arrMatch = text.match(/\[[\s\S]+\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return arr as string[];
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * Reciprocal Rank Fusion
 * score(d) = Σ  1 / (k + rank(d, list_i))
 * Chunks from the same document that appear in multiple lists are merged.
 */
function reciprocalRankFusion(
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

/** Build the <document> context string passed to the answer generator. */
function buildContextString(docs: RetrievedDocument[]): string {
  if (!docs?.length) return '';
  return docs
    .map((doc, di) => {
      const lines = doc.chunks
        .map((c, ci) => `[${ci + 1}] ${c.text}`)
        .join('\n');
      return `<document id="DOC_${di + 1}" name="${
        doc.title
      }">\n${lines}\n</document>`;
    })
    .join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MultiAgentSystem Class
// ─────────────────────────────────────────────────────────────────────────────

class MultiAgentSystem {
  private openai: OpenAI;
  private model: string;
  private temperature: number;
  private max_tokens: number;
  private indexerBaseURL: string;
  private indexName: string;
  private collectionId?: string;
  private filterIds?: string[];
  /** Callback used to stream both text chunks and progress sentinel events. */
  private streamChunk?: (chunk: string) => void;

  private async withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3
  ): Promise<T> {
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
            `[MultiAgent] LLM call failed (attempt ${attempt}), retrying in ${delay}ms...`,
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

  constructor(options: MultiAgentOptions) {
    this.openai = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
    });
    this.model = options.model;
    this.temperature = options.temperature ?? 0.7;
    this.max_tokens = options.max_tokens ?? 1500;
    this.indexerBaseURL =
      options.indexerBaseURL ?? process.env.API_INDEXER ?? '';
    this.indexName = options.indexName ?? process.env.ELASTIC_INDEX ?? '';
    this.collectionId = options.collectionId;
    this.filterIds = options.filterIds;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Main execution entry-point
  // ───────────────────────────────────────────────────────────────────────────

  async execute(
    messages: Message[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    // Make onChunk available to runStep for real-time progress events.
    this.streamChunk = onChunk;
    try {
      const state: AgentState = {
        originalQuery: this.extractUserQuery(messages),
        messages,
        queryAnalysis: null,
        rewrittenQueries: [],
        strategy: null,
        orchestratorReasoning: '',
        denseResults: [],
        fulltextResults: [],
        summaryResults: [],
        fusedResults: [],
        isContextSufficient: false,
        coverageIssues: [],
        gapQueries: [],
        retrievalIteration: 0,
        compressedContext: '',
        draftAnswer: '',
        answerIteration: 0,
        answerFeedback: '',
        finalAnswer: '',
        chunkMap: {},
        chunkIndexMap: {},
        citedAnswer: '',
        trace: [],
      };

      // ── 1. Query Analysis ────────────────────────────────────────────────────
      await this.runStep(
        state,
        'QueryAnalyzer',
        'Analysing query intent, topics and language',
        async () => {
          state.queryAnalysis = await this.queryAnalyzer(state);
          return state.queryAnalysis;
        }
      );

      // ── 2 + 3. Query Rewriting & Orchestration — run IN PARALLEL ─────────────
      // Both agents only READ state.queryAnalysis (set in step 1) and write to
      // completely disjoint state fields, so there is no race condition.
      await Promise.all([
        this.runStep(
          state,
          'QueryRewriter',
          'Rewriting and expanding queries for retrieval',
          async () => {
            state.rewrittenQueries = await this.queryRewriter(state);
            return { queries: state.rewrittenQueries };
          }
        ),
        this.runStep(
          state,
          'Orchestrator',
          'Choosing retrieval strategy',
          async () => {
            const dec = await this.orchestrator(state);
            state.strategy = dec.strategy;
            state.orchestratorReasoning = dec.reasoning;
            return dec;
          }
        ),
      ]);

      // ── 4-5-6. Retrieval → Fusion → Coverage (loop) ──────────────────────────
      do {
        state.retrievalIteration++;
        const queries =
          state.retrievalIteration === 1
            ? state.rewrittenQueries
            : state.gapQueries;

        if (state.strategy === 'summary') {
          // ── Summary path ──────────────────────────────────────────────────
          await this.runStep(
            state,
            'SummaryRetriever',
            `Fetching full document content (iter ${state.retrievalIteration})`,
            async () => {
              const results = await this.summaryRetriever(queries);
              state.summaryResults.push(...results);
              return { docCount: results.length };
            }
          );
          state.fusedResults = reciprocalRankFusion([state.summaryResults]);
        } else if (state.strategy === 'dense') {
          // ── Dense path ────────────────────────────────────────────────────
          await this.runStep(
            state,
            'DenseRetriever',
            `Vector (dense) retrieval (iter ${state.retrievalIteration})`,
            async () => {
              const results = await this.denseRetriever(queries);
              state.denseResults.push(...results);
              return { docCount: results.length };
            }
          );
          state.fusedResults = state.denseResults;
        } else if (state.strategy === 'fulltext') {
          // ── Full-text path ────────────────────────────────────────────────
          await this.runStep(
            state,
            'FulltextRetriever',
            `Full-text (BM25) retrieval (iter ${state.retrievalIteration})`,
            async () => {
              const results = await this.fulltextRetriever(queries);
              state.fulltextResults.push(...results);
              return { docCount: results.length };
            }
          );
          state.fusedResults = state.fulltextResults;
        } else {
          // ── Hybrid path (dense + fulltext) ────────────────────────────────
          await this.runStep(
            state,
            'HybridRetriever',
            `Hybrid retrieval (dense + fulltext, iter ${state.retrievalIteration})`,
            async () => {
              const [dense, fulltext] = await Promise.all([
                this.denseRetriever(queries),
                this.fulltextRetriever(queries),
              ]);
              state.denseResults.push(...dense);
              state.fulltextResults.push(...fulltext);
              return {
                denseCount: dense.length,
                fulltextCount: fulltext.length,
              };
            }
          );

          // ── Result Fusion ─────────────────────────────────────────────────
          await this.runStep(
            state,
            'ResultFusion',
            'Fusing results with Reciprocal Rank Fusion (RRF)',
            async () => {
              const lists: RetrievedDocument[][] = [];
              if (state.denseResults.length) lists.push(state.denseResults);
              if (state.fulltextResults.length)
                lists.push(state.fulltextResults);
              state.fusedResults = reciprocalRankFusion(lists);
              return { fusedDocCount: state.fusedResults.length };
            }
          );
        }

        // ── 6. Relevance & Coverage Check ────────────────────────────────────
        await this.runStep(
          state,
          'RelevanceCoverage',
          `Checking context sufficiency (iter ${state.retrievalIteration})`,
          async () => {
            const result = await this.relevanceCoverageChecker(state);
            state.isContextSufficient = result.isSufficient;
            state.coverageIssues = result.coverageIssues;
            state.gapQueries = result.gapQueries;
            return result;
          }
        );
      } while (
        !state.isContextSufficient &&
        state.retrievalIteration < MAX_RETRIEVAL_ITERATIONS
      );

      // ── Build chunk maps ─────────────────────────────────────────────────────
      // Number every chunk across all fused documents sequentially (1-based).
      // Done once here so both the citation agent and the frontend sentinel
      // share the same numbering.
      {
        let n = 0;
        for (const doc of state.fusedResults) {
          for (const chunk of doc.chunks) {
            n++;
            state.chunkMap[chunk.id] = chunk.text;
            state.chunkIndexMap[chunk.id] = n;
          }
        }
      }

      // ── 7. Context Compression ───────────────────────────────────────────────
      await this.runStep(
        state,
        'ContextCompressor',
        'Compressing and extracting relevant context',
        async () => {
          state.compressedContext = await this.contextCompressor(state);
          return { contextLength: state.compressedContext.length };
        }
      );

      // ── 8-9. Answer Generation → Evaluation (loop) ──────────────────────────
      do {
        state.answerIteration++;

        await this.runStep(
          state,
          'AnswerGenerator',
          `Generating answer (iter ${state.answerIteration})`,
          async () => {
            state.draftAnswer = await this.answerGenerator(state);
            return { answerLength: state.draftAnswer.length };
          }
        );

        if (state.answerIteration < MAX_ANSWER_ITERATIONS) {
          await this.runStep(
            state,
            'AnswerEvaluator',
            `Evaluating answer quality (iter ${state.answerIteration})`,
            async () => {
              const result = await this.answerEvaluator(state);
              state.answerFeedback = result.isGood
                ? ''
                : result.additionalInstructions;
              return result;
            }
          );
          if (!state.answerFeedback) break; // evaluator approved – exit loop
        } else {
          break; // max iterations reached
        }
      } while (state.answerIteration < MAX_ANSWER_ITERATIONS);

      state.finalAnswer = state.draftAnswer;

      // ── 10. Citation Agent ───────────────────────────────────────────────────
      await this.runStep(
        state,
        'CitationAgent',
        'Annotating answer with inline chunk citations',
        async () => {
          state.citedAnswer = await this.citationAgent(state);
          return { citedLength: state.citedAnswer.length };
        }
      );

      // ── Stream the cited answer ──────────────────────────────────────────────
      const answerToStream = state.citedAnswer || state.finalAnswer;
      if (onChunk && answerToStream) {
        const CHUNK_SIZE = 40;
        for (let i = 0; i < answerToStream.length; i += CHUNK_SIZE) {
          onChunk(answerToStream.slice(i, i + CHUNK_SIZE));
        }
      }

      // ── Send retrieved context + chunk maps back to the frontend ─────────────
      // Encoded as a single sentinel chunk AFTER the answer text so the text
      // streams cleanly. use-chat.ts strips this before display and uses it to:
      //  • populate the context panel (docs) shown under the user message
      //  • render [n] citation tooltips on the assistant message
      if (onChunk && state.fusedResults.length > 0) {
        const contextPayload = JSON.stringify({
          docs: state.fusedResults.map((doc) => ({
            id:
              typeof doc.id === 'string'
                ? parseInt(doc.id, 10) || doc.id
                : doc.id,
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
          chunkMap: state.chunkMap,
          chunkIndexMap: state.chunkIndexMap,
        });
        onChunk(`\x02DAVE_CTX\x1E${contextPayload}\x03`);
      }

      // ── Print trace ──────────────────────────────────────────────────────────
      this.logTrace(state);

      return state.finalAnswer;
    } catch (err: unknown) {
      // If a mid-pipeline error occurs and we haven't streamed anything yet,
      // send a graceful error message to the frontend so the user isn't left
      // staring at a blank or frozen response.
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MultiAgentSystem] Pipeline error:', err);
      if (onChunk) {
        onChunk(
          `\n\n> ⚠️ The multi-agent pipeline encountered an error and could not complete.\n> _${msg}_`
        );
      }
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Step runner — wraps every agent call with timing, tracing and live events
  // ─────────────────────────────────────────────────────────────────

  /** Emit a sentinel step-progress event to the frontend stream. */
  private emitStep(
    agent: string,
    step: string,
    status: 'start' | 'done',
    durationMs?: number
  ) {
    const payload = JSON.stringify({
      agent,
      step,
      status,
      ...(durationMs !== undefined ? { durationMs } : {}),
    });
    this.streamChunk?.(`\x02DAVE_STEP\x1E${payload}\x03`);
  }

  private async runStep<T>(
    state: AgentState,
    agent: string,
    step: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    this.emitStep(agent, step, 'start');
    console.log(`[MultiAgent][${agent}] ${step}`);
    const output = await fn();
    const durationMs = Date.now() - start;
    state.trace.push({
      agent,
      step,
      timestamp: new Date(start).toISOString(),
      durationMs,
      output,
    });
    this.emitStep(agent, step, 'done', durationMs);
    console.log(`[MultiAgent][${agent}] ✓ ${durationMs}ms`);
    return output;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 1 — Query Analyzer
  // ─────────────────────────────────────────────────────────────────────────

  private async queryAnalyzer(state: AgentState): Promise<QueryAnalysis> {
    const system = `You are a Query Analysis Agent.
Analyse the user query and return ONLY a JSON object with this exact schema:
{
  "intent": "<one-sentence description of what the user wants>",
  "keyTopics": ["<topic1>", "<topic2>"],
  "queryType": "factual|analytical|comparative|summary|procedural",
  "language": "<ISO 639-1 code, e.g. 'it' or 'en'>",
  "requiresFullDocument": <true if the user needs an overview/summary of an entire document, false otherwise>
}
RESPOND ONLY WITH THE JSON OBJECT. No other text.`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Query: ${state.originalQuery}` },
        ],
        temperature: 0.1,
        max_tokens: 350,
        stream: false,
      })
    );

    const text = resp.choices[0]?.message?.content ?? '';
    return (
      extractJSON<QueryAnalysis>(text) ?? {
        intent: state.originalQuery,
        keyTopics: [state.originalQuery],
        queryType: 'factual',
        language: 'it',
        requiresFullDocument: false,
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 2 — Query Rewriter & Expander
  // ─────────────────────────────────────────────────────────────────────────

  private async queryRewriter(state: AgentState): Promise<string[]> {
    const analysis = state.queryAnalysis!;
    const system = `You are a Query Rewriting and Expansion Agent.
Generate 3–5 diverse search queries from the original query to maximise retrieval coverage.
Rules:
- Use the SAME language as the original query
- Vary vocabulary: include synonyms, related technical terms, broader/narrower formulations
- Always include the original query as one entry
- Do NOT add queries that are completely unrelated to the original intent
RESPOND ONLY WITH A JSON ARRAY OF STRINGS: ["q1", "q2", "q3"]`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Original query: ${
              state.originalQuery
            }\nKey topics: ${analysis.keyTopics.join(', ')}\nQuery type: ${
              analysis.queryType
            }`,
          },
        ],
        temperature: 0.4,
        max_tokens: 350,
        stream: false,
      })
    );

    const text = resp.choices[0]?.message?.content ?? '';
    return extractJSONArray(text) ?? [state.originalQuery];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 3 — Orchestrator
  // ─────────────────────────────────────────────────────────────────────────

  private async orchestrator(state: AgentState): Promise<OrchestratorDecision> {
    const analysis = state.queryAnalysis!;

    // Fast path: full-document requests go straight to summary
    if (analysis.requiresFullDocument) {
      return {
        strategy: 'summary',
        reasoning:
          'Query requires full document content (overview / summary requested)',
      };
    }

    const system = `You are an Orchestrator Agent. Choose the best retrieval strategy for the query.

Strategies:
- "dense"    : Vector/semantic search. Best for conceptual, paraphrased, or natural-language queries.
- "fulltext" : BM25 keyword search. Best for specific entity names, codes, IDs, or exact phrases.
- "hybrid"   : Both dense and fulltext, results fused with RRF. Best when both semantic and keyword matching matter.
- "summary"  : Fetch full document text. Best when the user wants a document overview or needs broad coverage.

RESPOND ONLY WITH JSON: {"strategy": "...", "reasoning": "..."}`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `User query: ${state.originalQuery}\nIntent: ${
              analysis.intent
            }\nKey topics: ${analysis.keyTopics.join(', ')}\nQuery type: ${
              analysis.queryType
            }`,
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
        stream: false,
      })
    );

    const text = resp.choices[0]?.message?.content ?? '';
    return (
      extractJSON<OrchestratorDecision>(text) ?? {
        strategy: 'hybrid',
        reasoning: 'Defaulting to hybrid strategy',
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Retriever — Dense (vector)
  // ─────────────────────────────────────────────────────────────────────────

  private async denseRetriever(
    queries: string[]
  ): Promise<RetrievedDocument[]> {
    return this.callIndexer(queries, 'dense', false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Retriever — Full-text (BM25)
  // ─────────────────────────────────────────────────────────────────────────

  private async fulltextRetriever(
    queries: string[]
  ): Promise<RetrievedDocument[]> {
    return this.callIndexer(queries, 'full-text', false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Retriever — Full document / summary
  // ─────────────────────────────────────────────────────────────────────────

  private async summaryRetriever(
    queries: string[]
  ): Promise<RetrievedDocument[]> {
    return this.callIndexer(queries.slice(0, 2), 'dense', true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: call chroma indexer endpoint
  // ─────────────────────────────────────────────────────────────────────────

  private async callIndexer(
    queries: string[],
    retrievalMethod: string,
    forceRag: boolean
  ): Promise<RetrievedDocument[]> {
    if (!this.indexName) {
      console.warn('[MultiAgent] indexName not set – skipping retrieval');
      return [];
    }

    const seenIds = new Set<string>();
    const docs: RetrievedDocument[] = [];

    // Fire all queries concurrently (each with its own timeout) and merge
    // results after. This reduces retrieval latency from O(n) sequential
    // round-trips to O(1) — the slowest single request sets the pace.
    const batchResults = await Promise.all(
      queries.slice(0, MAX_QUERIES_PER_RETRIEVER).map(async (query) => {
        const timeout = new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 15_000)
        );
        try {
          const result = await Promise.race([
            runVectorSearch({
              collectionName: this.indexName,
              query,
              filterIds: this.filterIds,
              retrievalMethod,
              forceRag,
              collectionId: this.collectionId,
            }),
            timeout,
          ]);

          if (result === 'timeout') {
            console.warn(
              `[MultiAgent][callIndexer] Timeout for query "${query}"`
            );
            return [] as RawIndexerDoc[];
          }

          return result as unknown as RawIndexerDoc[];
        } catch (err) {
          console.error(
            `[MultiAgent][callIndexer] Error for query "${query}":`,
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

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 6 — Relevance & Coverage Checker
  // ─────────────────────────────────────────────────────────────────────────

  private async relevanceCoverageChecker(
    state: AgentState
  ): Promise<CoverageResult> {
    if (!state.fusedResults.length) {
      return {
        isSufficient: false,
        coverageIssues: ['No documents were retrieved'],
        gapQueries: [state.originalQuery],
      };
    }

    // Give the LLM a representative excerpt (first ~3 000 chars)
    const contextExcerpt = buildContextString(state.fusedResults).slice(
      0,
      3000
    );

    const system = `You are a Relevance and Coverage Analysis Agent.
Determine whether the retrieved context is sufficient to answer the user's query completely.

Return ONLY a JSON object:
{
  "isSufficient": <true|false>,
  "coverageIssues": ["<issue1>", "<issue2>"],
  "gapQueries": ["<search query to fill gap 1>", "<search query to fill gap 2>"]
}
If sufficient, coverageIssues and gapQueries may be empty arrays.
RESPOND ONLY WITH THE JSON OBJECT.`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `User query: ${state.originalQuery}\n\nRetrieved context (excerpt):\n${contextExcerpt}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 400,
        stream: false,
      })
    );

    const text = resp.choices[0]?.message?.content ?? '';
    return (
      extractJSON<CoverageResult>(text) ?? {
        isSufficient: true,
        coverageIssues: [],
        gapQueries: [],
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 7 — Context Compressor
  // ─────────────────────────────────────────────────────────────────────────

  private async contextCompressor(state: AgentState): Promise<string> {
    const rawContext = buildContextString(state.fusedResults);
    if (!rawContext) return '';
    // Short enough already → skip LLM call
    if (rawContext.length < 1200) return rawContext;

    const system = `You are a Context Compression Agent.
Your task: extract and restructure ONLY the information from the provided context that is necessary to answer the user's query.

Rules:
- Keep ALL factual content relevant to the query; remove nothing important
- Remove passages that are clearly unrelated or duplicate
- Preserve document attribution (document titles / IDs)
- Write in the same language as the source documents
- Do NOT add information that is not present in the source
- Output should be plain text, structured and easy to read`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `User query: ${
              state.originalQuery
            }\n\nFull context:\n${rawContext.slice(0, 8000)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: Math.min(this.max_tokens, 2000),
        stream: false,
      })
    );

    return resp.choices[0]?.message?.content ?? rawContext;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 8 — Answer Generator
  // ─────────────────────────────────────────────────────────────────────────

  private async answerGenerator(state: AgentState): Promise<string> {
    const lang = state.queryAnalysis?.language ?? 'it';
    const langInstruction =
      lang === 'en' ? 'Respond in ENGLISH.' : 'Rispondi in ITALIANO.';

    const correctionNote = state.answerFeedback
      ? `\n\n⚠ CORRECTION INSTRUCTIONS (from the evaluator – apply these):\n${state.answerFeedback}`
      : '';

    const system = `You are an expert knowledge-base assistant. ${langInstruction}

Use ONLY the provided context to answer the question.
Be accurate, comprehensive, and well-structured (use bullet points or numbered lists when appropriate).
If the context does not contain enough information to fully answer, say so explicitly rather than guessing.
Do NOT hallucinate facts that are not present in the context.${correctionNote}`;

    const context =
      state.compressedContext ||
      buildContextString(state.fusedResults).slice(0, 6000);

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${state.originalQuery}`,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.max_tokens,
        stream: false,
      })
    );

    return resp.choices[0]?.message?.content ?? '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 9 — Answer Evaluator
  // ─────────────────────────────────────────────────────────────────────────

  private async answerEvaluator(state: AgentState): Promise<EvaluationResult> {
    const contextExcerpt = (
      state.compressedContext || buildContextString(state.fusedResults)
    ).slice(0, 3000);

    const system = `You are an Answer Quality Evaluation Agent.
Critically evaluate the generated answer against the context and the user's query.

Criteria:
1. Factual accuracy – every claim must be traceable to the context
2. Completeness – the answer must address all aspects of the query
3. Hallucinations – flag any information NOT present in the context
4. Clarity and coherence

Return ONLY a JSON object:
{
  "isGood": <true|false>,
  "score": <0–10>,
  "issues": ["<issue1>"],
  "additionalInstructions": "<specific instructions for the answer generator to improve the answer, or empty string if good>"
}
RESPOND ONLY WITH THE JSON OBJECT.`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `User query: ${state.originalQuery}\n\nContext (excerpt):\n${contextExcerpt}\n\nGenerated answer:\n${state.draftAnswer}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 400,
        stream: false,
      })
    );

    const text = resp.choices[0]?.message?.content ?? '';
    return (
      extractJSON<EvaluationResult>(text) ?? {
        isGood: true,
        score: 7,
        issues: [],
        additionalInstructions: '',
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  // Agent 10 — Citation Agent
  // ─────────────────────────────────────────────────────────────────

  private async citationAgent(state: AgentState): Promise<string> {
    if (!state.finalAnswer || Object.keys(state.chunkIndexMap).length === 0) {
      return state.finalAnswer;
    }

    // Build a numbered chunk list for the prompt (sorted by display number).
    // Cap at 6000 chars to stay within context limits of small models.
    const chunkLines = Object.entries(state.chunkIndexMap)
      .sort(([, a], [, b]) => a - b)
      .map(([id, n]) => `[${n}] ${(state.chunkMap[id] ?? '').slice(0, 300)}`)
      .join('\n');

    const system = `You are a Citation Agent. Your ONLY job is to add inline citation markers to an answer.

RULES — read carefully:
1. You receive an ANSWER and a list of numbered CONTEXT CHUNKS.
2. After each sentence or clause that is supported by a specific chunk, insert [n] immediately after the statement (before any trailing punctuation or at the end of the sentence).
3. Use [n] for one source, [n][m] for multiple sources.
4. Only cite chunks that GENUINELY and DIRECTLY support the statement. Do NOT cite speculatively.
5. Do NOT change, rewrite, add, or remove any word from the answer. ONLY insert [n] markers.
6. Leave sentences uncited if no chunk directly supports them (e.g. introductory or transitional phrases).
7. RETURN ONLY THE ANNOTATED ANSWER TEXT. No preamble, no explanation.`;

    const resp = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `ANSWER:\n${
              state.finalAnswer
            }\n\nCONTEXT CHUNKS:\n${chunkLines.slice(0, 5000)}`,
          },
        ],
        temperature: 0.1,
        // Give the model enough room for the original answer plus citation markers
        max_tokens: Math.min(
          Math.ceil(state.finalAnswer.length / 3) + 400,
          this.max_tokens
        ),
        stream: false,
      })
    );

    const cited = resp.choices[0]?.message?.content?.trim() ?? '';

    // Sanity guard: if the model returned something radically longer than the
    // original (hallucinated text), fall back to the uncited answer.
    if (!cited || cited.length > state.finalAnswer.length * 2.5) {
      console.warn(
        '[CitationAgent] Output suspicious – falling back to uncited answer'
      );
      return state.finalAnswer;
    }

    return cited;
  }

  // ─────────────────────────────────────────────────────────────────
  private extractUserQuery(messages: Message[]): string {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return lastUser?.content ?? '';
  }

  private logTrace(state: AgentState): void {
    const totalMs = state.trace.reduce((sum, e) => sum + e.durationMs, 0);

    const traceObj: AgentTrace = {
      query: state.originalQuery,
      strategy: state.strategy,
      retrievalIterations: state.retrievalIteration,
      answerIterations: state.answerIteration,
      totalMs,
      steps: state.trace,
    };

    console.log('\n' + '═'.repeat(64));
    console.log('[MultiAgent] EXECUTION TRACE');
    console.log('═'.repeat(64));
    console.log(`  Query               : ${state.originalQuery}`);
    console.log(`  Strategy            : ${state.strategy}`);
    console.log(`  Retrieval iterations: ${state.retrievalIteration}`);
    console.log(`  Answer iterations   : ${state.answerIteration}`);
    console.log(`  Total time          : ${totalMs} ms`);
    console.log('─'.repeat(64));

    state.trace.forEach((entry, i) => {
      console.log(
        `\n  [${String(i + 1).padStart(2, '0')}] ${entry.agent}  —  ${
          entry.step
        }`
      );
      console.log(`       at ${entry.timestamp}  (${entry.durationMs} ms)`);
      if (entry.output !== undefined) {
        const s =
          typeof entry.output === 'object'
            ? JSON.stringify(entry.output)
            : String(entry.output);
        console.log(
          `       out: ${s.length > 280 ? s.slice(0, 280) + '…' : s}`
        );
      }
      if (entry.notes) console.log(`       note: ${entry.notes}`);
    });

    console.log('\n' + '─'.repeat(64));
    console.log('[MultiAgent] FULL TRACE OBJECT (JSON):');
    console.log(JSON.stringify(traceObj, null, 2));
    console.log('═'.repeat(64) + '\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public factory
// ─────────────────────────────────────────────────────────────────────────────

export async function executeMultiAgent(
  messages: Message[],
  options: MultiAgentOptions,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const system = new MultiAgentSystem(options);
  return system.execute(messages, onChunk);
}
