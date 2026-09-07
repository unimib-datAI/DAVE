import { createTRPCNext } from '@trpc/next';
import { httpLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';
import { getBrowserId } from '@/utils/browserId';
import { publicConfig } from '@/lib/config';

/**
 * Module-level access-token holder. The token used to be passed per-call inside
 * every procedure's input; now it rides as an `Authorization` header. AuthWatcher
 * (pages/_app.tsx) keeps this current from the NextAuth session, and the link's
 * `headers()` reads it synchronously per request.
 */
let authToken: string | undefined;
export const setAuthToken = (token: string | undefined) => {
  authToken = token;
};

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return `${publicConfig.basePath}/api/trpc`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/trpc`;
  }
  return `${publicConfig.fullPath}/api/trpc`;
}

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [
        // httpLink (not httpBatchLink): POST per operation, so big JWT tokens
        // never end up in a GET query string (431), and the error envelope
        // stays non-batched for lib/permissionInterceptor.
        httpLink({
          url: getBaseUrl(),
          headers() {
            const headers: Record<string, string> = {};
            if (authToken) {
              headers.authorization = `Bearer ${authToken}`;
            }
            if (!publicConfig.useAuth && typeof window !== 'undefined') {
              headers['x-browser-id'] = getBrowserId();
            }
            return headers;
          },
          // Arrow over the free `fetch` variable so the lookup is deferred to
          // call time — that's what lets lib/permissionInterceptor's later
          // window.fetch patch be visible to tRPC requests.
          fetch: (input, init) =>
            fetch(input, { ...(init ?? {}), credentials: 'omit' }),
        }),
      ],
    };
  },
  ssr: false,
});
