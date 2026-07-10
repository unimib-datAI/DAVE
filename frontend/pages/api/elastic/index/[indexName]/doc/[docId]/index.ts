import { NextApiRequest, NextApiResponse } from 'next';
import { deleteElasticDocument } from '@/lib/elasticAdmin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { indexName, docId } = req.query;
  if (typeof indexName !== 'string' || typeof docId !== 'string') {
    res.status(400).json({ message: 'Missing indexName or docId' });
    return;
  }

  try {
    const result = await deleteElasticDocument(indexName, docId);
    res.status(200).json(result);
  } catch (error) {
    console.error('delete-elastic-document error:', error);
    res
      .status(404)
      .json({ message: `Document ${docId} not found in index ${indexName}` });
  }
};

export default handler;
