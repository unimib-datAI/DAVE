import { NextApiRequest, NextApiResponse } from 'next';
import { createOrGetElasticIndex } from '@/lib/elasticAdmin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { name } = req.body || {};
  if (typeof name !== 'string' || !name) {
    res.status(400).json({ message: 'Missing "name"' });
    return;
  }

  try {
    const result = await createOrGetElasticIndex(name);
    res.status(200).json(result);
  } catch (error) {
    console.error('create-elastic-index error:', error);
    res.status(500).json({ message: 'Failed to create/get index' });
  }
};

export default handler;
