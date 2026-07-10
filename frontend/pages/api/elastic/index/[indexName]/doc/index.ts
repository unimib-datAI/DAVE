import { NextApiRequest, NextApiResponse } from 'next';
import { indexElasticDocumentRaw } from '@/lib/elasticAdmin';

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

  const { doc } = req.body || {};
  if (!doc || typeof doc !== 'object') {
    res.status(400).json({ message: 'Missing "doc"' });
    return;
  }

  try {
    const result = await indexElasticDocumentRaw(indexName, doc);
    res.status(200).json(result);
  } catch (error) {
    console.error('index-elastic-document error:', error);
    res.status(500).json({ message: 'Failed to index document' });
  }
};

export default handler;
