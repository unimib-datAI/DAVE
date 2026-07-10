// Ported from backend/documents/src/api/auth.js's GET /auth/me.
// See login.ts for why this route has no caller in the Next.js UI.
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthController } from '@/lib/documentsBackend/localAuth';
import { sendHTTPErrorResponse } from '@/lib/documentsBackend/httpError';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const user = await AuthController.meFromJwt(token);
    return res.status(200).json({ user });
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
