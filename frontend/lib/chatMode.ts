/**
 * How a chat question is answered:
 *  - standard: retrieval in the browser + one LLM call
 *  - agent:    multi-agent pipeline (lib/multiAgent.ts)
 *  - deep:     deep research report (lib/deepResearch.ts)
 */
export type ChatMode = 'standard' | 'agent' | 'deep';

export const CHAT_MODES: ChatMode[] = ['standard', 'agent', 'deep'];

/** Modes whose retrieval and answering both run server-side. */
export const isServerSideMode = (mode: ChatMode | undefined): boolean =>
  mode === 'agent' || mode === 'deep';

export function parseChatMode(
  value: unknown,
  legacyUseMultiAgent?: unknown
): ChatMode {
  if (typeof value === 'string' && (CHAT_MODES as string[]).includes(value)) {
    return value as ChatMode;
  }
  return legacyUseMultiAgent ? 'agent' : 'standard';
}
