import type { RetrievedDocument } from './agentCore';

/** Response of the legal-assistant REST API (`POST /query`). */
export interface LegalAssistantResponse {
  answer: string;
  sources: (string | null)[];
  contexts: string[];
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** True when the legal assistant is switched on (LEGAL_ASSISTANT_ENABLED=true). */
export function legalAssistantEnabled(): boolean {
  return (process.env.LEGAL_ASSISTANT_ENABLED ?? '').toLowerCase() === 'true';
}

/**
 * Asks the legal-assistant service (Graph-RAG over EU digital-regulation law)
 * a question. Throws on network errors, non-2xx answers and timeouts; callers
 * decide whether that is fatal.
 */
export async function queryLegalAssistant(
  question: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<LegalAssistantResponse> {
  const baseUrl = (
    process.env.API_LEGAL_ASSISTANT || 'http://legal-assistant:8080'
  ).replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (process.env.LEGAL_ASSISTANT_API_KEY) {
    headers['X-API-Key'] = process.env.LEGAL_ASSISTANT_API_KEY;
  }

  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  const res = await fetch(`${baseUrl}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`legal-assistant answered ${res.status}`);
  }
  return (await res.json()) as LegalAssistantResponse;
}

/**
 * Maps the passages of a legal-assistant answer to DAVE documents, one
 * document per passage, so they can be fused and cited like archive results.
 * A passage starts with a bracketed header, e.g. "[GDPR, Article 4]", used as
 * the title.
 */
export function legalPassagesToDocuments(
  response: LegalAssistantResponse
): RetrievedDocument[] {
  return response.contexts.map((text, i) => {
    const sourceId = response.sources[i] ?? `passage-${i}`;
    const id = `legal:${sourceId}`;
    const title = /^\s*\[([^\]]+)\]/.exec(text)?.[1] ?? String(sourceId);
    return {
      id,
      title,
      preview: text.slice(0, 200),
      chunks: [
        {
          id,
          // Rank-ordered by the legal assistant, so keep the order as distance.
          distance: i,
          text,
          metadata: { doc_id: id, chunk_size: text.length },
        },
      ],
    };
  });
}
