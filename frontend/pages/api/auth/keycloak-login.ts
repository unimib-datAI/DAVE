// Ported from backend/documents/src/api/auth.js's POST /auth/keycloak-login
// (Resource Owner Password Credentials grant against Keycloak directly).
//
// Not called anywhere in the Next.js UI (sign-in uses NextAuth's Keycloak
// OAuth code flow via [...nextauth].ts instead) - ported for parity in case
// external API consumers use it directly. Per prior instruction, this hits a
// real Keycloak instance and was NOT live-tested during the port.
import type { NextApiRequest, NextApiResponse } from 'next';
import { keycloakService } from '@/lib/documentsBackend/keycloakService';
import { sendHTTPErrorResponse } from '@/lib/documentsBackend/httpError';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username and password are required' });
  }

  try {
    const tokens = await keycloakService.loginUser(username, password);
    return res.status(200).json(tokens);
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
