// Fallback document retrieval when a document isn't found directly in
// Elasticsearch, ported from qavectorizer's retriever.py + the `retrievers`
// dict in app.py.

async function retrieve(baseUrl: string, id: string): Promise<any | null> {
  try {
    const res = await fetch(`${baseUrl}/${id}`);
    if (!res.ok) return null;
    const doc = await res.json();
    delete doc.annotation_sets;
    return doc;
  } catch {
    return null;
  }
}

const retrieverUrls: Record<string, string> = {
  batini: (process.env.PIPELINE_ADDRESS || 'http://10.0.0.108:3001') + '/api/document',
  bologna_renzo_matched_1:
    (process.env.DEMO_PIPELINE_ADDRESS || 'http://10.0.0.108:3002') + '/api/document',
  sperimentazione:
    (process.env.SPERIMENTAZIONE_PIPELINE_ADDRESS || 'http://10.0.0.108:3003') +
    '/api/document',
  indagini:
    (process.env.INDAGINI_PIPELINE_ADDRESS || 'http://10.0.0.108:3004') + '/api/document',
  mirko: (process.env.MIRKO_PIPELINE_ADDRESS || 'http://10.0.0.108:3005') + '/api/document',
  doc_eng_1:
    (process.env.RENZO_PIPELINE_ADDRESS || 'http://10.0.0.108:3006') + '/api/document',
  messages:
    (process.env.MESSAGES_PIPELINE_ADDRESS || 'http://10.0.0.108:3007') + '/api/document',
  eu: (process.env.EU_PIPELINE_ADDRESS || 'http://10.0.0.108:3008') + '/api/document',
  eu_v2: (process.env.EU_V2_PIPELINE_ADDRESS || 'http://10.0.0.108:3009') + '/api/document',
  anonymization:
    (process.env.ANONYMIZATION_PIPELINE_ADDRESS || 'http://documents:3001') +
    '/api/document',
  anonymized:
    (process.env.ANONYMIZATION_PIPELINE_ADDRESS || 'http://documents:3001') +
    '/api/document',
  eu_anonymized: 'http://10.0.0.108:3011/api/document',
};

const DEFAULT_RETRIEVER = 'batini';

// Retrieves a full document by id, using the retriever configured for
// `collectionName` (falling back to the default retriever), mirroring
// qavectorizer's `retrievers.get(collection_name, default_retriever)`.
export async function retrieveDocument(
  collectionName: string,
  id: string
): Promise<any | null> {
  const baseUrl = retrieverUrls[collectionName] || retrieverUrls[DEFAULT_RETRIEVER];
  return retrieve(baseUrl, id);
}
