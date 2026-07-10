import { NextApiRequest, NextApiResponse } from 'next';
import { addAnnotationsToDocumentEs } from '@/lib/elasticAdmin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { indexName, docId } = req.query;
  if (typeof indexName !== 'string' || typeof docId !== 'string') {
    res.status(400).json({ message: 'Missing indexName or docId' });
    return;
  }

  const { mentions } = req.body || {};
  if (!Array.isArray(mentions)) {
    res.status(400).json({ message: 'Missing "mentions" array' });
    return;
  }

  try {
    const result = await addAnnotationsToDocumentEs(indexName, docId, mentions);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const notFound = message.includes('not found');
    console.error('add-annotations error:', error);
    res.status(notFound ? 404 : 500).json({ message });
  }
};

export default handler;
