import OpenAI from 'openai';
import { z } from 'zod';
import { findEntityDocuments } from './entityLookup';
import {
  legalAssistantEnabled,
  legalPassagesToDocuments,
  queryLegalAssistant,
} from './legalAssistant';
import {
  findCitedSentences,
  parseJSONWithSchema,
  summarizeForTrace,
} from './agentUtils';
import {
  AgentLLM,
  RESET_SENTINEL,
  buildContextSentinel,
  buildNumberedContext,
  emitStepChunk,
  reciprocalRankFusion,
  searchArchive,
  verifyCitations,
  type DocumentChunk,
  type Message,
  type RetrievedDocument,
} from './agentCore';

export type { Message } from './agentCore';

/**
 * Multi-Agent RAG System
 *
 * Pipeline:
 *  1. QueryAnalyzer        – understand intent, topics, language
 *     (also turns follow-up questions into a standalone query using the chat history)
 *  2. QueryRewriter        – expand into multiple search queries
 *  3. Orchestrator         – choose retrieval strategy (dense / fulltext / hybrid / summary)
 *  4. Retrievers           – dense, fulltext, or document-summary retrievers, plus an
 *                            EntityRetriever that finds the documents mentioning the
 *                            entities named in the question (via the stored annotations)
 *  5. ResultFusion         – RRF (Reciprocal Rank Fusion) across retriever results
 *  6. RelevanceCoverage    – check if context is sufficient; if not, loop back (max 2 iterations)
 *  7. ContextSelector      – keep only the retrieved chunks relevant to the question
 *  8. AnswerGenerator      – write the answer from the numbered chunks, STREAMING the
 *                            tokens live with inline [n] citations
 *  9. AnswerEvaluator      – score for coverage / hallucinations; if bad, loop back (max 2 iterations)
 *                            (skipped for simple factual questions with sufficient context)
 * 10. CitationAgent        – fallback only: adds [n] markers when the model wrote none
 * 11. CitationVerifier     – drop markers whose chunk does not support the sentence
 *                            (if anything changed the streamed text is replaced)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OrchestratorStrategy = 'dense' | 'fulltext' | 'hybrid' | 'summary';

interface QueryAnalysis {
  intent: string;
  /** The question rewritten to be understandable without the chat history. */
  standaloneQuery: string;
  keyTopics: string[];
  /** Named entities (people, places, organisations...) written in the question. */
  entities: string[];
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
  /** originalQuery resolved against the chat history; what the agents search for. */
  searchQuery: string;
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
  /** Chunks of the documents that mention the entities named in the question. */
  entityResults: RetrievedDocument[];
  entityLookupDone: boolean;
  /** Passages returned by the legal-assistant service (when enabled). */
  legalResults: RetrievedDocument[];
  legalLookupDone: boolean;
  // step 5
  fusedResults: RetrievedDocument[];
  // step 6
  isContextSufficient: boolean;
  coverageIssues: string[];
  gapQueries: string[];
  retrievalIteration: number;
  // step 7
  /** The numbered chunks ([n] text) the answer is written from. */
  answerContext: string;
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
// Retrieved context shorter than this goes to the answer generator whole:
// selecting chunks costs an LLM call and saves nothing.
const SELECTION_MIN_CHARS = 4000;
// Upper bound on the context the answer is written from (whole chunks only).
const ANSWER_CONTEXT_MAX_CHARS = 8000;
// Token budget of the JSON agents. Thinking models spend it on reasoning before
// the JSON: with a few hundred tokens their reply comes back empty ("length"),
// the agent silently uses its fallback and the circuit breaker trips. Models
// that do not think stop early, so a large budget costs them nothing.
const JSON_AGENT_TOKENS = (() => {
  const n = parseInt(process.env.AGENT_JSON_MAX_TOKENS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 4000;
})();
const HISTORY_MESSAGES = 6; // earlier chat messages shown to the query analyzer
const HISTORY_MESSAGE_CHARS = 400;
const MAX_VERIFIED_SENTENCES = 40;

// Shapes the agents' JSON replies must fit. Every field is lenient (`catch`):
// a missing or mistyped field takes its default instead of failing the reply.
const QUERY_TYPES = [
  'factual',
  'analytical',
  'comparative',
  'summary',
  'procedural',
] as const;

const QueryAnalysisSchema = z.object({
  intent: z.string().catch(''),
  standaloneQuery: z.string().catch(''),
  keyTopics: z.array(z.string()).catch([]),
  entities: z.array(z.string()).catch([]),
  queryType: z.enum(QUERY_TYPES).catch('factual'),
  language: z.string().catch('it'),
  requiresFullDocument: z.boolean().catch(false),
});

const QueriesSchema = z.array(z.string());

const OrchestratorSchema = z.object({
  strategy: z.enum(['dense', 'fulltext', 'hybrid', 'summary']),
  reasoning: z.string().catch(''),
});

const CoverageSchema = z.object({
  isSufficient: z.boolean().catch(true),
  coverageIssues: z.array(z.string()).catch([]),
  gapQueries: z.array(z.string()).catch([]),
});

const EvaluationSchema = z.object({
  isGood: z.boolean().catch(true),
  score: z.number().catch(7),
  issues: z.array(z.string()).catch([]),
  additionalInstructions: z.string().catch(''),
});

const ChunkSelectionSchema = z.object({
  keep: z.array(z.number()).catch([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// Pure Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  private llm: AgentLLM;
  private openai: OpenAI;
  private model: string;
  private baseURL: string;
  private temperature: number;
  private max_tokens: number;
  private indexerBaseURL: string;
  private indexName: string;
  private collectionId?: string;
  private filterIds?: string[];
  /** Callback used to stream both text chunks and progress sentinel events. */
  private streamChunk?: (chunk: string) => void;

  private get withRetry() {
    return this.llm.withRetry.bind(this.llm);
  }

  private get askJSON() {
    return this.llm.askJSON.bind(this.llm);
  }

  constructor(options: MultiAgentOptions) {
    this.llm = new AgentLLM(
      options.baseURL,
      options.apiKey,
      options.model,
      'MultiAgent'
    );
    this.openai = this.llm.openai;
    this.model = options.model;
    this.baseURL = options.baseURL;
    this.temperature = options.temperature ?? 0.7;
    this.max_tokens = options.max_tokens ?? 4096;
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
        searchQuery: this.extractUserQuery(messages),
        messages,
        queryAnalysis: null,
        rewrittenQueries: [],
        strategy: null,
        orchestratorReasoning: '',
        denseResults: [],
        fulltextResults: [],
        summaryResults: [],
        entityResults: [],
        entityLookupDone: false,
        legalResults: [],
        legalLookupDone: false,
        fusedResults: [],
        isContextSufficient: false,
        coverageIssues: [],
        gapQueries: [],
        retrievalIteration: 0,
        answerContext: '',
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
          state.searchQuery = state.queryAnalysis.standaloneQuery;
          return state.queryAnalysis;
        }
      );

      // ── 2 + 3. Query Rewriting & Orchestration — run IN PARALLEL ─────────────
      // Both agents only READ state.queryAnalysis (set in step 1) and write to
      // completely disjoint state fields, so there is no race condition.
      // The question itself is searched at the same time (see
      // startEarlyRetrieval) so the retrieval is already done when they finish.
      const earlyRetrieval = this.startEarlyRetrieval(state);
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

      const early = await earlyRetrieval;

      // ── 4-5-6. Retrieval → Fusion → Coverage ∥ Selection (loop) ──────────────
      do {
        state.retrievalIteration++;
        let queries =
          state.retrievalIteration === 1
            ? state.rewrittenQueries
            : state.gapQueries;

        // First round: the question was already searched early (unless the
        // strategy fetches whole documents); only the other queries are left.
        if (state.retrievalIteration === 1 && state.strategy !== 'summary') {
          const asked = state.searchQuery.trim().toLowerCase();
          queries = queries.filter((q) => q.trim().toLowerCase() !== asked);
          if (state.strategy !== 'fulltext') {
            state.denseResults.push(...early.dense);
          }
          if (state.strategy !== 'dense') {
            state.fulltextResults.push(...early.fulltext);
          }
        }

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
              const results = queries.length
                ? await this.denseRetriever(queries)
                : [];
              state.denseResults.push(...results);
              return { docCount: results.length };
            }
          );
          state.fusedResults = reciprocalRankFusion([state.denseResults]);
        } else if (state.strategy === 'fulltext') {
          // ── Full-text path ────────────────────────────────────────────────
          await this.runStep(
            state,
            'FulltextRetriever',
            `Full-text (BM25) retrieval (iter ${state.retrievalIteration})`,
            async () => {
              const results = queries.length
                ? await this.fulltextRetriever(queries)
                : [];
              state.fulltextResults.push(...results);
              return { docCount: results.length };
            }
          );
          state.fusedResults = reciprocalRankFusion([state.fulltextResults]);
        } else {
          // ── Hybrid path (dense + fulltext) ────────────────────────────────
          await this.runStep(
            state,
            'HybridRetriever',
            `Hybrid retrieval (dense + fulltext, iter ${state.retrievalIteration})`,
            async () => {
              const [dense, fulltext] = queries.length
                ? await Promise.all([
                    this.denseRetriever(queries),
                    this.fulltextRetriever(queries),
                  ])
                : [[], []];
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

        // ── Entity retrieval (once) and fusion into the main results ─────────
        if (state.strategy !== 'summary' && state.entityResults.length) {
          state.fusedResults = reciprocalRankFusion([
            state.fusedResults,
            state.entityResults,
          ]);
        }

        // ── Legal assistant passages (once, optional) ────────────────────────
        if (legalAssistantEnabled() && state.strategy !== 'summary') {
          if (!state.legalLookupDone) {
            state.legalLookupDone = true;
            await this.runStep(
              state,
              'LegalAssistant',
              'Querying the legal assistant',
              async () => {
                try {
                  const answer = await queryLegalAssistant(state.searchQuery);
                  state.legalResults = legalPassagesToDocuments(answer);
                } catch (err) {
                  console.warn('[MultiAgent][LegalAssistant] failed:', err);
                }
                return { documents: state.legalResults.length };
              }
            );
          }
          if (state.legalResults.length) {
            state.fusedResults = reciprocalRankFusion([
              state.fusedResults,
              state.legalResults,
            ]);
          }
        }

        // ── 6 + 7. Coverage check ∥ context selection ────────────────────────
        // Selecting the chunks does not depend on the verdict: it runs while the
        // coverage check is thinking, and is simply redone on the next round
        // when the verdict is "insufficient". The last round's selection is the
        // one used, because it is made from the final set of documents.
        this.buildChunkMaps(state);
        await Promise.all([
          this.runStep(
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
          ),
          this.runStep(
            state,
            'ContextSelector',
            'Selecting the chunks relevant to the question',
            async () => {
              state.answerContext = await this.contextSelector(state);
              return { contextLength: state.answerContext.length };
            }
          ),
        ]);
      } while (
        !state.isContextSufficient &&
        state.retrievalIteration < MAX_RETRIEVAL_ITERATIONS
      );

      // ── 8-9. Answer Generation (streamed) → Evaluation (loop) ───────────────
      // The generator streams its tokens to the browser as they are produced,
      // with [n] citations inline. When the evaluator rejects a draft the text
      // streamed so far is discarded (RESET) and the answer is rewritten.
      do {
        state.answerIteration++;
        if (state.answerIteration > 1) onChunk?.(RESET_SENTINEL);

        await this.runStep(
          state,
          'AnswerGenerator',
          `Generating answer (iter ${state.answerIteration})`,
          async () => {
            state.draftAnswer = await this.answerGenerator(state);
            return { answerLength: state.draftAnswer.length };
          }
        );

        // The citations of this draft are checked while the evaluator judges
        // it. If the evaluator asks for a rewrite, that result is thrown away.
        const verification = this.verifyDraft(state, state.draftAnswer);

        // A simple factual question answered from sufficient context on the
        // first retrieval pass does not need a second LLM judging the answer.
        const skipEvaluation =
          state.queryAnalysis?.queryType === 'factual' &&
          state.isContextSufficient &&
          state.retrievalIteration === 1;

        if (skipEvaluation) {
          state.citedAnswer = await verification;
          break;
        } else if (state.answerIteration < MAX_ANSWER_ITERATIONS) {
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
          if (!state.answerFeedback) {
            // evaluator approved – exit loop
            state.citedAnswer = await verification;
            break;
          }
        } else {
          // max iterations reached
          state.citedAnswer = await verification;
          break;
        }
      } while (state.answerIteration < MAX_ANSWER_ITERATIONS);

      state.finalAnswer = state.draftAnswer;
      if (!state.citedAnswer) state.citedAnswer = state.draftAnswer;

      // ── Replace the streamed text if verification or the fallback changed it ─
      if (onChunk && state.citedAnswer !== state.draftAnswer) {
        onChunk(RESET_SENTINEL);
        const CHUNK_SIZE = 200;
        for (let i = 0; i < state.citedAnswer.length; i += CHUNK_SIZE) {
          onChunk(state.citedAnswer.slice(i, i + CHUNK_SIZE));
        }
      }

      // ── Send retrieved context + chunk maps back to the frontend ─────────────
      // Encoded as a single sentinel chunk AFTER the answer text so the text
      // streams cleanly. use-chat.ts strips this before display and uses it to:
      //  • populate the context panel (docs) shown under the user message
      //  • render [n] citation tooltips on the assistant message
      if (onChunk && state.fusedResults.length > 0) {
        onChunk(
          buildContextSentinel(
            state.fusedResults,
            state.chunkMap,
            state.chunkIndexMap
          )
        );
      }

      // ── Print trace ──────────────────────────────────────────────────────────
      this.logTrace(state);

      return state.citedAnswer || state.finalAnswer;
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
    durationMs?: number,
    details?: string
  ) {
    emitStepChunk(this.streamChunk, agent, step, status, durationMs, details);
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
    this.emitStep(agent, step, 'done', durationMs, summarizeForTrace(output));
    console.log(`[MultiAgent][${agent}] ✓ ${durationMs}ms`);
    return output;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 1 — Query Analyzer
  // ─────────────────────────────────────────────────────────────────────────

  private async queryAnalyzer(state: AgentState): Promise<QueryAnalysis> {
    const system = `You are a Query Analysis Agent.
Analyse the user's latest message, using the earlier conversation only to understand it, and return ONLY a JSON object with this exact schema:
{
  "intent": "<one-sentence description of what the user wants>",
  "standaloneQuery": "<the latest message rewritten so it is fully understandable WITHOUT the conversation: resolve pronouns and references such as 'and in 2019?' or 'what about him?'; keep the same language; if it is already self-contained, repeat it unchanged>",
  "keyTopics": ["<topic1>", "<topic2>"],
  "entities": ["<people, places, organisations or other named entities written in the message, exactly as written; empty array if none>"],
  "queryType": "factual|analytical|comparative|summary|procedural",
  "language": "<ISO 639-1 code, e.g. 'it' or 'en'>",
  "requiresFullDocument": <true if the user needs an overview/summary of an entire document, false otherwise>
}
RESPOND ONLY WITH THE JSON OBJECT. No other text.`;

    const history = state.messages
      .slice(0, -1)
      .filter((m) => m.role !== 'system')
      .slice(-HISTORY_MESSAGES)
      .map(
        (m) =>
          `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(
            0,
            HISTORY_MESSAGE_CHARS
          )}`
      )
      .join('\n');

    const fallback: QueryAnalysis = {
      intent: state.originalQuery,
      standaloneQuery: state.originalQuery,
      keyTopics: [state.originalQuery],
      entities: [],
      queryType: 'factual',
      language: 'it',
      requiresFullDocument: false,
    };

    const analysis = await this.askJSON<QueryAnalysis>({
      agent: 'QueryAnalyzer',
      system,
      user: `${
        history ? `Earlier conversation:\n${history}\n\n` : ''
      }Latest message: ${state.originalQuery}`,
      schema: QueryAnalysisSchema,
      fallback,
      maxTokens: JSON_AGENT_TOKENS,
    });
    // The model may leave these empty: keep the original wording usable.
    return {
      ...analysis,
      standaloneQuery: analysis.standaloneQuery.trim() || state.originalQuery,
      keyTopics: analysis.keyTopics.length
        ? analysis.keyTopics
        : [state.originalQuery],
    };
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

    const queries = await this.askJSON<string[]>({
      agent: 'QueryRewriter',
      system,
      user: `Original query: ${
        state.searchQuery
      }\nKey topics: ${analysis.keyTopics.join(', ')}\nQuery type: ${
        analysis.queryType
      }`,
      schema: QueriesSchema,
      fallback: [state.searchQuery],
      maxTokens: JSON_AGENT_TOKENS,
      temperature: 0.4,
      expectArray: true,
    });
    const clean = queries.map((q) => q.trim()).filter(Boolean);
    return clean.length ? clean : [state.searchQuery];
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

    return this.askJSON<OrchestratorDecision>({
      agent: 'Orchestrator',
      system,
      user: `User query: ${state.searchQuery}\nIntent: ${
        analysis.intent
      }\nKey topics: ${analysis.keyTopics.join(', ')}\nQuery type: ${
        analysis.queryType
      }`,
      schema: OrchestratorSchema,
      fallback: {
        strategy: 'hybrid',
        reasoning: 'Defaulting to hybrid strategy',
      },
      maxTokens: JSON_AGENT_TOKENS,
    });
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
    forceRag: boolean,
    filterIdsOverride?: string[]
  ): Promise<RetrievedDocument[]> {
    return searchArchive({
      indexName: this.indexName,
      collectionId: this.collectionId,
      filterIds: filterIdsOverride ?? this.filterIds,
      queries,
      retrievalMethod,
      forceRag,
      maxQueries: MAX_QUERIES_PER_RETRIEVER,
      label: 'MultiAgent',
    });
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
        gapQueries: [state.searchQuery],
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

    return this.askJSON<CoverageResult>({
      agent: 'RelevanceCoverage',
      system,
      user: `User query: ${state.searchQuery}\n\nRetrieved context (excerpt):\n${contextExcerpt}`,
      schema: CoverageSchema,
      fallback: { isSufficient: true, coverageIssues: [], gapQueries: [] },
      maxTokens: JSON_AGENT_TOKENS,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parallel helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Numbers every chunk across the fused documents (1-based) so the answer
   * generator, the citation checks and the frontend's tooltips all use the same
   * [n]. Rebuilt for every retrieval round: the last one matches the final set.
   */
  private buildChunkMaps(state: AgentState) {
    state.chunkMap = {};
    state.chunkIndexMap = {};
    let n = 0;
    for (const doc of state.fusedResults) {
      for (const chunk of doc.chunks) {
        n++;
        state.chunkMap[chunk.id] = chunk.text;
        state.chunkIndexMap[chunk.id] = n;
      }
    }
  }

  /**
   * Retrieval that does not need the rewritten queries or the strategy: the
   * question itself, dense and full-text, plus the entity lookup. It runs while
   * the rewriter and the orchestrator (LLM calls) are still working, so the
   * search time hides behind theirs. Never rejects.
   */
  private startEarlyRetrieval(state: AgentState) {
    state.entityLookupDone = true;
    const empty = { dense: [], fulltext: [] } as {
      dense: RetrievedDocument[];
      fulltext: RetrievedDocument[];
    };
    const question = [state.searchQuery];

    const main = this.runStep(
      state,
      'EarlyRetrieval',
      'Searching with the question while the queries are planned',
      async () => {
        const [dense, fulltext] = await Promise.all([
          this.denseRetriever(question),
          this.fulltextRetriever(question),
        ]);
        return { dense, fulltext };
      }
    ).catch(() => empty);

    const entities = this.runStep(
      state,
      'EntityRetriever',
      'Finding documents that mention the entities in the question',
      async () => this.entityRetriever(state)
    ).catch(() => undefined);

    return Promise.all([main, entities]).then(([early]) => early);
  }

  /**
   * Makes a draft answer citable: annotates it when the model wrote no [n]
   * markers, then checks each marker. Returns the draft unchanged on any
   * failure. Runs while the evaluator judges the same draft, so its result is
   * simply dropped when the evaluator asks for a rewrite.
   */
  private async verifyDraft(state: AgentState, draft: string): Promise<string> {
    try {
      if (!draft || Object.keys(state.chunkIndexMap).length === 0) return draft;
      let text = draft;

      // The generator cites inline. A model that ignored that gets its answer
      // annotated afterwards.
      if (findCitedSentences(text).length === 0) {
        text = await this.runStep(
          state,
          'CitationAgent',
          'Annotating answer with inline chunk citations',
          async () => this.citationAgent(state, draft)
        );
      }

      if (findCitedSentences(text).length) {
        const current = text;
        text = await this.runStep(
          state,
          'CitationVerifier',
          'Checking that each citation supports its sentence',
          async () => {
            const { answer, removed } = await this.citationVerifier(
              state,
              current
            );
            return { answer, removed };
          }
        ).then((r) => r.answer);
      }
      return text;
    } catch (err) {
      console.error(
        '[MultiAgent] citation step failed, keeping the draft',
        err
      );
      return draft;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 7 — Context Selector
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Picks which retrieved chunks the answer is written from. It selects whole
   * chunks instead of rewriting them, so the text stays exactly as indexed and
   * the generator can cite the chunk numbers inline.
   */
  private async contextSelector(state: AgentState): Promise<string> {
    const all = buildNumberedContext(
      state.fusedResults,
      state.chunkIndexMap,
      null,
      Number.POSITIVE_INFINITY
    );
    if (!all) return '';
    // Short enough already → keep everything, no LLM call
    if (all.length < SELECTION_MIN_CHARS) return all;

    const numbers = Object.values(state.chunkIndexMap);
    const listing = Object.entries(state.chunkIndexMap)
      .sort(([, a], [, b]) => a - b)
      .map(([id, n]) => `[${n}] ${(state.chunkMap[id] ?? '').slice(0, 300)}`)
      .join('\n')
      .slice(0, 12000);

    const system = `You are a Context Selection Agent.
Given the user's question and numbered text chunks, choose the chunks needed to answer it.
Rules:
- Keep every chunk that contains information relevant to the question
- Drop chunks that are unrelated or only repeat another kept chunk
- Prefer keeping a borderline chunk over losing relevant information
Return ONLY a JSON object: {"keep": [<chunk numbers>]}
RESPOND ONLY WITH THE JSON OBJECT.`;

    const selection = await this.askJSON({
      agent: 'ContextSelector',
      system,
      user: `Question: ${state.searchQuery}\n\nChunks:\n${listing}`,
      schema: ChunkSelectionSchema,
      fallback: { keep: [] },
      maxTokens: JSON_AGENT_TOKENS,
    });

    // Only numbers that exist; an empty or unusable choice keeps everything.
    const valid = new Set(numbers);
    const keep = new Set(selection.keep.filter((n) => valid.has(n)));
    return buildNumberedContext(
      state.fusedResults,
      state.chunkIndexMap,
      keep.size ? keep : null,
      ANSWER_CONTEXT_MAX_CHARS
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 8 — Answer Generator (streams its tokens)
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
Do NOT hallucinate facts that are not present in the context.

Cite your sources: the context is split into numbered chunks like "[3] text". After each statement that a chunk supports, add that chunk's number in square brackets, e.g. "... was approved [3]." or "[2][5]" for several chunks. Cite only numbers that appear in the context, never invent one, and do not add a list of sources at the end.${correctionNote}`;

    const context =
      state.answerContext ||
      buildNumberedContext(
        state.fusedResults,
        state.chunkIndexMap,
        null,
        ANSWER_CONTEXT_MAX_CHARS
      );

    const stream = await this.withRetry(() =>
      this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${state.searchQuery}`,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.max_tokens,
        stream: true,
      })
    );

    // Forward each token as it arrives. Reasoning deltas (a separate field on
    // thinking models) are not part of the answer and are not forwarded.
    let text = '';
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        text += delta;
        this.streamChunk?.(delta);
      }
    }
    return text;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 9 — Answer Evaluator
  // ─────────────────────────────────────────────────────────────────────────

  private async answerEvaluator(state: AgentState): Promise<EvaluationResult> {
    const contextExcerpt = (
      state.answerContext || buildContextString(state.fusedResults)
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

    return this.askJSON<EvaluationResult>({
      agent: 'AnswerEvaluator',
      system,
      user: `User query: ${state.searchQuery}\n\nContext (excerpt):\n${contextExcerpt}\n\nGenerated answer:\n${state.draftAnswer}`,
      schema: EvaluationSchema,
      fallback: {
        isGood: true,
        score: 7,
        issues: [],
        additionalInstructions: '',
      },
      maxTokens: JSON_AGENT_TOKENS,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────
  // Agent 10 — Citation Agent
  // ─────────────────────────────────────────────────────────────────

  private async citationAgent(
    state: AgentState,
    answer: string
  ): Promise<string> {
    if (!answer || Object.keys(state.chunkIndexMap).length === 0) {
      return answer;
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
            content: `ANSWER:\n${answer}\n\nCONTEXT CHUNKS:\n${chunkLines.slice(
              0,
              5000
            )}`,
          },
        ],
        temperature: 0.1,
        // Give the model enough room for the original answer plus citation markers
        max_tokens: Math.min(
          Math.ceil(answer.length / 3) + 400 + JSON_AGENT_TOKENS,
          this.max_tokens
        ),
        stream: false,
      })
    );

    const cited = resp.choices[0]?.message?.content?.trim() ?? '';

    // Sanity guard: if the model returned something radically longer than the
    // original (hallucinated text), fall back to the uncited answer.
    if (!cited || cited.length > answer.length * 2.5) {
      console.warn(
        '[CitationAgent] Output suspicious – falling back to uncited answer'
      );
      return answer;
    }

    return cited;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Retriever — Entities (documents that mention the named entities)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The annotations stored with every document say where people, places and
   * organisations are mentioned. This finds the documents mentioning the
   * entities written in the question (and, for linked entities, under any
   * other spelling), then pulls their best chunks with the regular vector
   * search restricted to those documents. Vector similarity alone often
   * misses them for short, name-only questions.
   */
  private async entityRetriever(state: AgentState) {
    const names = state.queryAnalysis?.entities ?? [];
    if (!names.length || !this.indexName) {
      return { entities: names, documents: 0 };
    }

    const lookup = await findEntityDocuments({
      indexName: this.indexName,
      names,
      collectionId: this.collectionId,
      filterIds: this.filterIds,
    });
    if (!lookup.docIds.length) {
      return { entities: names, documents: 0 };
    }

    state.entityResults = await this.callIndexer(
      state.rewrittenQueries.length
        ? state.rewrittenQueries
        : [state.searchQuery],
      'dense',
      false,
      lookup.docIds
    );
    return {
      entities: names,
      linked: lookup.entities.map((e) => `${e.name} (${e.type})`),
      documents: lookup.docIds.length,
      chunkDocuments: state.entityResults.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Agent 11 — Citation Verifier
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The CitationAgent only inserts [n] markers and may cite loosely. This
   * removes markers that point at no chunk, then asks the model whether each
   * remaining cited chunk really supports its sentence and drops the ones that
   * do not. Any failure keeps the citations as they were.
   */
  private async citationVerifier(
    state: AgentState,
    draft: string
  ): Promise<{ answer: string; removed: number }> {
    return verifyCitations({
      llm: this.llm,
      draft,
      chunkIndexMap: state.chunkIndexMap,
      chunkMap: state.chunkMap,
      maxSentences: MAX_VERIFIED_SENTENCES,
    });
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
