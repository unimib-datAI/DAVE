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
