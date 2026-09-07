// Fallback document retrieval when a document isn't found directly in
// Elasticsearch, ported from qavectorizer's retriever.py + the `retrievers`
// dict in app.py.

import { serverConfig } from '@/lib/config/server';

const r = serverConfig.sourceRetrievers;
const apiDoc = (base: string) => `${base}/api/document`;

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
  batini: apiDoc(r.batini),
  bologna_renzo_matched_1: apiDoc(r.demo),
  sperimentazione: apiDoc(r.sperimentazione),
  indagini: apiDoc(r.indagini),
  mirko: apiDoc(r.mirko),
  doc_eng_1: apiDoc(r.renzo),
  messages: apiDoc(r.messages),
  eu: apiDoc(r.eu),
  eu_v2: apiDoc(r.euV2),
  anonymization: apiDoc(r.anonymization),
  anonymized: apiDoc(r.anonymization),
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
