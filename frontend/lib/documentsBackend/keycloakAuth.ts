// Ported from backend/documents/src/middlewares/keycloak-auth.js
//
// The Express version reads `req.user` populated by a middleware chain.
// Next.js resolvers don't have that pipeline - every resolver already
// receives an explicit `token` (the Keycloak access token) via its zod
// input schema, so `getRequestUser(token)` takes that directly instead of
// reading it off a request object.

import jwt from 'jsonwebtoken';
// @ts-ignore - no type definitions published for this package
import jwksClient from 'jwks-rsa';

const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || 'http://keycloak:8080/realms/dave';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_ID || 'dave-client';

export type RequestUser = {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  email_verified?: boolean;
  roles: string[];
  resource_access: Record<string, any>;
  client_roles: string[];
  userId: string;
};

// Create JWKS client to fetch Keycloak's public keys
const client = jwksClient({
  jwksUri: `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getKey(header: any, callback: (err: any, key?: string) => void) {
  client.getSigningKey(header.kid, (err: any, key: any) => {
    if (err) {
      console.error('Error getting signing key:', err.message);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verifies a Keycloak-issued RS256 access token against Keycloak's JWKS and
 * returns the user info extracted from its claims. Throws on invalid/expired
 * tokens.
 */
export async function verifyKeycloakToken(token: string): Promise<RequestUser> {
  const payload: any = await new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey as any,
      {
        // Don't validate issuer strictly - allow different hostnames (localhost vs keycloak)
        // We'll validate the realm path manually
        // Don't require audience - Keycloak might not include it in the token
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      }
    );
  });

  // Manually validate that the issuer ends with the correct realm path
  const expectedRealmPath = '/realms/DAVE';
  if (!payload.iss || !payload.iss.endsWith(expectedRealmPath)) {
    throw new Error(
      `Invalid issuer realm. Expected realm path: ${expectedRealmPath}, got: ${payload.iss}`
    );
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    preferred_username: payload.preferred_username,
    email_verified: payload.email_verified,
    roles: payload.realm_access?.roles || [],
    resource_access: payload.resource_access || {},
    client_roles: payload.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles || [],
    // Map Keycloak user ID to userId for compatibility with existing code
    userId: payload.sub,
  };
}

/**
 * Resolves the calling user for a resolver, mirroring
 * keycloakAuthMiddleware's behavior: verifies the Bearer token, or - when
 * USE_AUTH=false - returns an anonymous user (browserId defaults to
 * "anon-user" since resolvers don't have access to the x-browser-id header
 * the way Express middleware did).
 */
export async function getRequestUser(
  token: string | undefined | null,
  browserId = 'anon-user'
): Promise<RequestUser> {
  if (!token) {
    if (process.env.USE_AUTH === 'false') {
      return {
        sub: browserId,
        email: `${browserId}@example.com`,
        name: `Anonymous User ${browserId.slice(0, 8)}`,
        preferred_username: browserId,
        email_verified: false,
        roles: [],
        resource_access: {},
        client_roles: [],
        userId: browserId,
      };
    }
    throw new Error('Missing Bearer token.');
  }

  return verifyKeycloakToken(token);
}

export function getUserRoles(user: RequestUser): string[] {
  return [...(user.roles || []), ...(user.client_roles || [])];
}
