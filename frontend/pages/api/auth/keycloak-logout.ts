// Ported from backend/documents/src/api/auth.js's POST /auth/keycloak-logout.
// See keycloak-login.ts for scope/caution notes - not live-tested against a
// real Keycloak instance during this port.
import type { NextApiRequest, NextApiResponse } from 'next';
import { keycloakService } from '@/lib/documentsBackend/keycloakService';
import { sendHTTPErrorResponse } from '@/lib/documentsBackend/httpError';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  try {
    await keycloakService.logoutUser(refreshToken);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
