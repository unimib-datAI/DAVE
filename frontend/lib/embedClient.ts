// Embedding generation still lives in qavectorizer (Python), since it needs
// the loaded sentence-transformer models. Everything else that used to
// depend on it (indexing, faceted search, RAG retrieval) has moved here and
// calls this client whenever it needs a vector.

export type EmbedModel = 'main' | 'chunk';

async function embed(texts: string[], model: EmbedModel): Promise<number[][]> {
  if (texts.length === 0) return [];

  const baseUrl = process.env.API_INDEXER;
  if (!baseUrl) {
    throw new Error('API_INDEXER is not configured');
  }

  const res = await fetch(`${baseUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, model }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { embeddings: number[][] };
  return data.embeddings;
}

// Embeds text(s) with the primary retrieval/indexing model.
export async function embedMain(texts: string[]): Promise<number[][]> {
  return embed(texts, 'main');
}

// Embeds text(s) with the lightweight chunk-attribution model
// (all-MiniLM-L6-v2), used to attach `text_emb` to RAG result chunks.
export async function embedChunks(texts: string[]): Promise<number[][]> {
  return embed(texts, 'chunk');
}

// How long a missing/disabled reranker is remembered before asking again.
const RERANK_RETRY_MS = 5 * 60 * 1000;
const RERANK_TIMEOUT_MS = 20_000;
let rerankUnavailableUntil = 0;

// Scores each text against the query with qavectorizer's cross-encoder
// (higher = more relevant, same order as `texts`). Returns null when the
// reranker is disabled, not deployed, or the call fails - callers keep
// their own ordering.
export async function rerank(query: string, texts: string[]): Promise<number[] | null> {
  if (texts.length === 0) return [];

  const baseUrl = process.env.API_INDEXER;
  if (!baseUrl || Date.now() < rerankUnavailableUntil) return null;

  try {
    const res = await fetch(`${baseUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, texts }),
      signal: AbortSignal.timeout(RERANK_TIMEOUT_MS),
    });

    if (!res.ok) {
      // 404/405: a qavectorizer without the endpoint; 503: RERANKER_MODEL is empty.
      if ([404, 405, 503].includes(res.status)) {
        rerankUnavailableUntil = Date.now() + RERANK_RETRY_MS;
      }
      console.warn(`Rerank request failed (${res.status}), keeping the fused order`);
      return null;
    }

    const data = (await res.json()) as { scores: number[] };
    return data.scores?.length === texts.length ? data.scores : null;
  } catch (error) {
    console.warn('Rerank request failed, keeping the fused order', error);
    return null;
  }
}
