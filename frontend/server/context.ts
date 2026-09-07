// Request context for every tRPC procedure.
//
// The v9 setup had no context: each protected procedure declared
// `token: z.string().optional()` in its own input and called
// `getRequestUser(input.token)` by hand. This resolves the caller once, here,
// from the request headers:
//   - `Authorization: Bearer <keycloak access token>`  (normal auth)
//   - `x-browser-id: <id>`                              (USE_AUTH=false)
//
// `ctx.user` is `RequestUser | null`. `publicProcedure` tolerates null;
// `authedProcedure` (see ./trpc) rejects it.

import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getRequestUser, type RequestUser } from '@/lib/documentsBackend/keycloakAuth';

export async function createContext({ req }: CreateNextContextOptions) {
  const authHeader = req.headers.authorization;
  const bearer =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim() || undefined
      : undefined;
  const browserId =
    (req.headers['x-browser-id'] as string | undefined)?.trim() || undefined;

  let user: RequestUser | null = null;
  try {
    // getRequestUser: verifies the token, OR (USE_AUTH=false) synthesises an
    // anon user from browserId, OR throws — which we swallow to null so public
    // procedures still run.
    user = await getRequestUser(bearer, browserId ?? 'anon-user');
  } catch {
    user = null;
  }

  return { req, user, token: bearer, browserId };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
