import { NextApiRequest, NextApiResponse } from 'next';
import { deleteElasticIndex } from '@/lib/elasticAdmin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { indexName } = req.query;
  if (typeof indexName !== 'string') {
    res.status(400).json({ message: 'Missing indexName' });
    return;
  }

  try {
    const result = await deleteElasticIndex(indexName);
    res.status(200).json(result);
  } catch (error) {
    console.error('delete-elastic-index error:', error);
    res.status(500).json({ message: 'Error while deleting index' });
  }
};

export default handler;
