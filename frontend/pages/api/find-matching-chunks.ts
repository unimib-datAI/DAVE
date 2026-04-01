import { NextApiRequest, NextApiResponse } from 'next';
import { findMatchingChunks } from '@/utils/stringUtilities';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const { sentences, chunks, threshold } = req.body;

  if (!Array.isArray(sentences) || !Array.isArray(chunks)) {
    res.status(400).json({ message: 'Invalid request body' });
    return;
  }

  try {
    const result = await findMatchingChunks(sentences, chunks, threshold);
    res.status(200).json(result);
  } catch (error) {
    console.error('find-matching-chunks error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export default handler;
