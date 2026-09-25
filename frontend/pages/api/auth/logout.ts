// Ported from backend/documents/src/api/auth.js's POST /auth/logout.
// See login.ts for why this route has no caller in the Next.js UI.
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthController } from '@/lib/documentsBackend/localAuth';
import { sendHTTPErrorResponse } from '@/lib/documentsBackend/httpError';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const { refreshToken } = req.body || {};
    await AuthController.logout(refreshToken);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
