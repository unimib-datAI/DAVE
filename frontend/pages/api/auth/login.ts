// Ported from backend/documents/src/api/auth.js's POST /auth/login.
//
// Not called anywhere in the Next.js UI (sign-in only uses Keycloak via
// NextAuth) - ported for parity in case external API consumers use it
// directly, same rationale as lib/documentsBackend/localAuth.ts.
import type { NextApiRequest, NextApiResponse } from 'next';
import { AuthController } from '@/lib/documentsBackend/localAuth';
import { sendHTTPErrorResponse } from '@/lib/documentsBackend/httpError';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const { email, password } = req.body || {};
    const data = await AuthController.login(email, password);
    return res.status(200).json(data);
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
