import { NextApiRequest, NextApiResponse } from 'next';
import { runFacetedSearch } from '@/lib/facetedSearch';

// Mirrors qavectorizer's old (now-removed) `POST /elastic/index/{index_name}/query`
// faceted-search endpoint - same URL shape and request body field names, so
// external callers (e.g. backend/documents/src/api/search.js) only need to
// point at this service instead of qavectorizer.
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { indexName } = req.query;
  if (typeof indexName !== 'string') {
    res.status(400).json({ message: 'Missing indexName' });
    return;
  }

  const {
    text,
    metadata,
    annotations,
    page,
    documents_per_page,
    collection_id,
    is_anonymized,
  } = req.body || {};

  try {
    const result = await runFacetedSearch({
      indexName,
      text: text ?? '',
      metadata,
      annotations,
      page,
      documentsPerPage: documents_per_page,
      collectionId: collection_id,
      isAnonymized: is_anonymized,
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('faceted-search error:', error);
    res.status(500).json({ message: 'Error communicating with the search indexer' });
  }
};

export default handler;
