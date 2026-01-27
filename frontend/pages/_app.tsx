import { Global } from '@emotion/react';
import styled from '@emotion/styled';
import type { AppProps } from 'next/app';
import GlobalStyles from '../styles/globalStyles';
import NextNProgress from 'nextjs-progressbar';
import { withTRPC } from '@trpc/next';
import { AppRouter } from '@/server/routers/_app';
import { NextUIProvider } from '@nextui-org/react';
import { NextPage } from 'next';
import { ReactElement, ReactNode, useEffect, useState } from 'react';
import {
  SessionProvider,
  useSession,
  signOut,
  getSession,
} from 'next-auth/react';
import { useQuery } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { useAtom } from 'jotai';
import { loadLLMSettingsAtom } from '@/atoms/llmSettings';

import { TranslationProvider } from '@/components';
import TaxonomyProvider from '@/modules/taxonomy/TaxonomyProvider';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import '@/styles/globals.css';

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const Layout = styled.div`
  min-height: 100vh;
  background: #ffffff;
`;

const getTRPCUrl = () => {
  // return process.env.NEXT_PUBLIC_VERCEL_URL
  //   ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}/api/trpc`
  //   : 'http://localhost:3000/api/trpc';
  if (typeof window !== 'undefined') {
    return `${process.env.NEXT_PUBLIC_BASE_PATH}/api/trpc`;
  }

  const url = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/trpc`
    : `${process.env.NEXT_PUBLIC_FULL_PATH}/api/trpc`;

  return url;
};

function MyApp({
  Component,
  pageProps: { session, locale, ...pageProps },
  router,
}: AppPropsWithLayout) {
  // Use the layout defined at the page level, if available
  const getLayout = Component.getLayout ?? ((page) => page);

  // A simple version counter used to force a remount of the TranslationProvider subtree
  // whenever the selected locale changes. This provides a straightforward way to ensure
  // all components re-render with the newly loaded translations.
  const [localeVersion, setLocaleVersion] = useState<number>(0);

  // Listen for locale changes (both storage events from other tabs and a custom event)
  // and bump the version to force remount.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bump = () => setLocaleVersion((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'locale') bump();
    };
    const onLocaleChange = (_e: Event) => bump();

    window.addEventListener('storage', onStorage);
    window.addEventListener('localeChange', onLocaleChange as EventListener);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(
        'localeChange',
        onLocaleChange as EventListener
      );
    };
  }, []);

  // An internal component that watches the NextAuth session and:
  // - signs the user out if a refresh failure occurred
  // - fetches collections in the background once logged in and on route changes
  // - proactively refreshes the NextAuth session shortly before the access token expires
  // It must be rendered as a descendant of SessionProvider so that useSession() has access to the session context.
  const AuthWatcher = () => {
    // useSession is safe to call here because AuthWatcher will be rendered inside SessionProvider
    const { data: currentSession, update } = useSession();
    const router = useRouter();
    const [, loadLLMSettings] = useAtom(loadLLMSettingsAtom);

    // Helper: check if token is expired
    const isTokenExpired = (token?: string): boolean => {
      if (!token) return true;
      try {
        const parts = token.split('.');
        if (parts.length < 2) return true;
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          Array.prototype.map
            .call(atob(payload), (c: string) => {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
        const parsed = JSON.parse(jsonPayload);
        if (parsed && parsed.exp) {
          return Date.now() >= parsed.exp * 1000;
        }
        return true;
      } catch (e) {
        return true;
      }
    };

    // Log user ID whenever session changes
    useEffect(() => {
      if (currentSession?.user) {
        console.log(
          'User ID:',
          (currentSession.user as any).userId || 'No ID available'
        );
      } else {
        console.log('User ID: Not logged in');
      }
    }, [currentSession]);

    // Setup a tRPC query to fetch collections. The query is enabled only when a valid token is present.
    // We use the token stored in the session (session.accessToken). The query runs in background when enabled.
    const token = (currentSession as any)?.accessToken;
    const collectionsQuery = useQuery(['collection.getAll', { token }], {
      enabled: Boolean(token),
      // run in background, avoid refetch on window focus automatically unless desired
      refetchOnWindowFocus: false,
      retry: false,
    });

    // When we detect a refresh failure, sign the user out and redirect to the sign-in page.
    useEffect(() => {
      try {
        if ((currentSession as any)?.error === 'RefreshAccessTokenError') {
          // sign out and redirect to sign-in page
          signOut({
            callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/sign-in`,
          });
        }
      } catch (e) {
        // Silent error handling
      }
    }, [currentSession]);

    // When session token becomes available, trigger background fetch of collections.
    useEffect(() => {
      try {
        if (token) {
          // trigger a background refetch
          collectionsQuery.refetch().catch(() => {
            // Silent error handling
          });
        }
      } catch (e) {
        // Silent error handling
      }
      // We intentionally depend on token and the refetch function
    }, [token, collectionsQuery.refetch]);

    // Refresh session every 120 seconds to keep tokens valid
    useEffect(() => {
      if (!token) return;

      const interval = window.setInterval(async () => {
        try {
          console.log('AuthWatcher: performing periodic session refresh');
          await update();
          console.log('AuthWatcher: periodic refresh finished');
        } catch (err) {
          console.error('AuthWatcher: periodic refresh failed', err);
          // If refresh fails, sign out
          signOut({
            callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/sign-in`,
          });
        }
      }, 120 * 1000); // 120 seconds

      return () => {
        window.clearInterval(interval);
      };
    }, [token, update]);

    // Refresh immediately if token is expired
    useEffect(() => {
      if (!token || !isTokenExpired(token)) return;

      console.log('AuthWatcher: token expired, refreshing immediately');
      update().catch((err) => {
        console.error('AuthWatcher: immediate refresh failed', err);
        signOut({
          callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/sign-in`,
        });
      });
    }, [token, update]);

    // Also refetch collections on every route change (background only if token is defined)
    useEffect(() => {
      const handleRouteChange = () => {
        if (!token) return;
        collectionsQuery.refetch().catch(() => {
          // Silent error handling
        });
      };

      router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }, [router.events, token, collectionsQuery.refetch]);

    // Load LLM settings on mount
    useEffect(() => {
      loadLLMSettings().catch(() => {
        // Silent error handling - will use defaults
      });
    }, [loadLLMSettings]);

    return null;
  };

  return (
    <SessionProvider
      session={session}
      basePath={`${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth`}
    >
      {/* AuthWatcher must be inside SessionProvider so useSession() works */}
      <AuthWatcher />

      <Global styles={GlobalStyles} />
      <TranslationProvider key={localeVersion} locale={locale}>
        <TaxonomyProvider>
          <NextUIProvider>
            <Layout>
              <NextNProgress color="rgb(75 85 99)" showOnShallow={false} />
              {getLayout(<Component {...pageProps} />)}
              <UploadProgressIndicator />
            </Layout>
          </NextUIProvider>
        </TaxonomyProvider>
      </TranslationProvider>
    </SessionProvider>
  );
}

export default withTRPC<AppRouter>({
  config({ ctx }) {
    /**
     * If you want to use SSR, you need to use the server's full URL
     * @link https://trpc.io/docs/ssr
     */
    const url = getTRPCUrl();

    return {
      url,
      /**
       * @link https://react-query.tanstack.com/reference/QueryClient
       */
      // queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  /**
   * @link https://trpc.io/docs/ssr
   */
  ssr: false,
})(MyApp);
