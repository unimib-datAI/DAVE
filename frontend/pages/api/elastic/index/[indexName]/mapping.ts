import { NextApiRequest, NextApiResponse } from 'next';
import { getElasticMapping } from '@/lib/elasticAdmin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { indexName } = req.query;
  if (typeof indexName !== 'string') {
    res.status(400).json({ message: 'Missing indexName' });
    return;
  }

  const result = await getElasticMapping(indexName);
  res.status(200).json(result);
};

export default handler;
