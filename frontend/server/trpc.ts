// tRPC v11 initialisation. The router/procedure builders live here so router
// files don't each re-init tRPC.

import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const middleware = t.middleware;

/** No auth requirement. `ctx.user` may be null. */
export const publicProcedure = t.procedure;

/**
 * Requires a resolved caller. Under USE_AUTH=false `ctx.user` is the synthetic
 * anon user, so this still passes; it only rejects a genuinely missing/invalid
 * token when auth is on. Permission checks (requirePermission) stay explicit in
 * the resolvers that need them.
 */
export const authedProcedure = t.procedure.use(function isAuthed(opts) {
  const { ctx } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing Bearer token.',
    });
  }
  return opts.next({ ctx: { ...ctx, user: ctx.user } });
});

export { TRPCError };
