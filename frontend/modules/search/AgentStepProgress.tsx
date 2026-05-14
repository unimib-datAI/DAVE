import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Zap } from 'lucide-react';
import type { AgentStep } from '@/hooks/use-chat';

type Props = {
  steps: AgentStep[];
  /** True while the pipeline is still running / streaming. */
  isStreaming?: boolean;
};

// Map agent names to friendlier display labels
const AGENT_LABELS: Record<string, string> = {
  QueryAnalyzer: 'Query Analysis',
  QueryRewriter: 'Query Expansion',
  Orchestrator: 'Retrieval Planning',
  DenseRetriever: 'Dense Retrieval',
  FulltextRetriever: 'Full-text Retrieval',
  HybridRetriever: 'Hybrid Retrieval',
  SummaryRetriever: 'Document Fetch',
  ResultFusion: 'Result Fusion (RRF)',
  RelevanceCoverage: 'Coverage Check',
  ContextCompressor: 'Context Compression',
  AnswerGenerator: 'Answer Generation',
  AnswerEvaluator: 'Answer Evaluation',
  CitationAgent: 'Citation Annotation',
};

function formatMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function AgentStepProgress({ steps, isStreaming = false }: Props) {
  if (steps.length === 0) return null;

  // Compute total elapsed time from all completed steps
  const totalMs = steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const allDone = steps.every((s) => s.status === 'done');
  const showSummary = allDone && !isStreaming && totalMs > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-0.5 mt-1 pl-10"
    >
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Agent pipeline
        </p>
        {showSummary && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"
          >
            <Zap size={9} strokeWidth={2.5} />
            Done in {formatMs(totalMs)}
          </motion.span>
        )}
      </div>

      <AnimatePresence initial={false}>
        {steps.map((step, i) => {
          const label = AGENT_LABELS[step.agent] ?? step.agent;
          const isDone = step.status === 'done';

          return (
            <motion.div
              key={`${step.agent}-${i}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-start gap-2 text-xs"
            >
              {/* Status icon */}
              <span className="mt-0.5 flex-shrink-0 w-3.5">
                {isDone ? (
                  <CheckCircle2
                    size={13}
                    className="text-emerald-500"
                    strokeWidth={2.2}
                  />
                ) : (
                  <Loader2
                    size={13}
                    className="animate-spin text-blue-500"
                    strokeWidth={2.2}
                  />
                )}
              </span>

              {/* Agent label + step description */}
              <span
                className={
                  isDone ? 'text-slate-400' : 'text-slate-700 font-medium'
                }
              >
                <span
                  className={
                    isDone ? 'text-slate-400' : 'text-blue-600 font-semibold'
                  }
                >
                  {label}
                </span>
                <span className="text-slate-400 mx-1">—</span>
                <span className="text-slate-500">{step.step}</span>
              </span>

              {/* Duration badge (completed steps only) */}
              {isDone && step.durationMs !== undefined && (
                <span className="ml-auto flex-shrink-0 text-[10px] text-slate-300 tabular-nums">
                  {formatMs(step.durationMs)}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
