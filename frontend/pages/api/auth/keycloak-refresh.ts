// Ported from backend/documents/src/api/auth.js's POST /auth/keycloak-refresh.
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
    const tokens = await keycloakService.refreshToken(refreshToken);
    return res.status(200).json(tokens);
  } catch (error: any) {
    return sendHTTPErrorResponse(res, error);
  }
}
