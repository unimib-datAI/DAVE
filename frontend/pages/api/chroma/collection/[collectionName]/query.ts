import { NextApiRequest, NextApiResponse } from 'next';
import { search as runVectorSearch } from '@/lib/vectorSearch';

// Mirrors qavectorizer's old (now-removed) `POST /chroma/collection/{collection_name}/query`
// RAG endpoint - same URL shape and request body field names, so external
// callers (e.g. backend/documents/src/api/rag.js) only need to point at
// this service instead of qavectorizer.
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { collectionName } = req.query;
  if (typeof collectionName !== 'string') {
    res.status(400).json({ message: 'Missing collectionName' });
    return;
  }

  const { query, filter_ids, retrievalMethod, force_rag, collectionId } =
    req.body || {};

  try {
    const result = await runVectorSearch({
      collectionName,
      query,
      filterIds: filter_ids,
      retrievalMethod: retrievalMethod || 'full',
      forceRag: force_rag,
      collectionId,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('chroma-query error:', error);
    res.status(500).json({ message: 'Failed to retrieve context from vector store' });
  }
};

export default handler;
