// Refreshes a Keycloak access token using its refresh token. Used by
// long-running server-side jobs (see `createUploadJob` in
// server/routers/document.ts) that outlive the short-lived access token
// handed to them at request time and can't rely on NextAuth's own
// jwt-callback refresh, since that only runs when a browser re-fetches the
// session.

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || '';
const KEYCLOAK_ID = process.env.KEYCLOAK_ID || '';
const KEYCLOAK_SECRET = process.env.KEYCLOAK_SECRET || '';

export type RefreshedKeycloakToken = {
  accessToken: string;
  refreshToken: string;
};

export async function refreshKeycloakToken(
  refreshToken: string
): Promise<RefreshedKeycloakToken> {
  const url = `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    client_id: KEYCLOAK_ID,
    client_secret: KEYCLOAK_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh Keycloak token: ${res.status}`);
  }

  const refreshed = await res.json();
  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? refreshToken,
  };
}

/** Seconds of headroom before expiry at which a token is considered stale. */
const EXPIRY_HEADROOM_SECONDS = 30;

/**
 * True when `accessToken`'s `exp` claim is missing, unparsable, or within
 * `EXPIRY_HEADROOM_SECONDS` of now - i.e. it should be refreshed before use.
 */
export function isAccessTokenStale(accessToken: string): boolean {
  const payloadSegment = accessToken.split('.')[1];
  if (!payloadSegment) return true;
  try {
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8')
    );
    if (typeof payload.exp !== 'number') return true;
    return Date.now() / 1000 > payload.exp - EXPIRY_HEADROOM_SECONDS;
  } catch {
    return true;
  }
}
