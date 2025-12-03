import { Global } from '@emotion/react';
import styled from '@emotion/styled';
import type { AppProps } from 'next/app';
import GlobalStyles from '../styles/globalStyles';
import NextNProgress from 'nextjs-progressbar';
import { withTRPC } from '@trpc/next';
import { AppRouter } from '@/server/routers/_app';
import { NextUIProvider } from '@nextui-org/react';
import { NextPage } from 'next';
import { ReactElement, ReactNode, useEffect } from 'react';
import { SessionProvider, useSession, signOut } from 'next-auth/react';
import { useQuery } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { useAtom } from 'jotai';
import { activeCollectionAtom } from '@/atoms/collection';
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

  // An internal component that watches the NextAuth session and:
  // - signs the user out if a refresh failure occurred
  // - fetches collections in the background once logged in and on route changes
  // - persists the currently selected collection id to localStorage for document requests
  // It must be rendered as a descendant of SessionProvider so that useSession() has access to the session context.
  const AuthWatcher = () => {
    // useSession is safe to call here because AuthWatcher will be rendered inside SessionProvider
    const { data: currentSession } = useSession();
    const router = useRouter();

    // Persist active collection id to localStorage so fetchJson can automatically attach it
    const [activeCollection] = useAtom(activeCollectionAtom);
    useEffect(() => {
      try {
        if (typeof window !== 'undefined') {
          if (activeCollection && (activeCollection as any).id) {
            localStorage.setItem(
              'activeCollectionId',
              (activeCollection as any).id
            );
            console.log(
              'AuthWatcher: saved activeCollectionId to localStorage',
              (activeCollection as any).id
            );
          } else {
            // remove if no active collection
            localStorage.removeItem('activeCollectionId');
            console.log(
              'AuthWatcher: removed activeCollectionId from localStorage'
            );
          }
        }
      } catch (e) {
        // ignore localStorage errors
        console.warn('AuthWatcher: could not persist activeCollectionId', e);
      }
    }, [activeCollection]);

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
          // log locally and force sign out
          console.warn(
            'AuthWatcher: RefreshAccessTokenError detected — signing out user'
          );
          // sign out and redirect to sign-in page
          signOut({
            callbackUrl: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/sign-in`,
          });
        }
      } catch (e) {
        console.error(
          'AuthWatcher: error while handling session refresh error',
          e
        );
      }
    }, [currentSession]);

    // When session token becomes available, trigger background fetch of collections.
    useEffect(() => {
      try {
        if (token) {
          console.log(
            'AuthWatcher: token present — fetching collections in background'
          );
          // trigger a background refetch
          collectionsQuery.refetch().catch((err) => {
            console.warn(
              'AuthWatcher: background collections fetch failed',
              err
            );
          });
        }
      } catch (e) {
        console.error(
          'AuthWatcher: error while initiating collections fetch',
          e
        );
      }
      // We intentionally depend on token and the refetch function
    }, [token, collectionsQuery.refetch]);

    // Also refetch collections on every route change (background only if token is defined)
    useEffect(() => {
      const handleRouteChange = () => {
        if (!token) return;
        console.log(
          'AuthWatcher: route changed — refetching collections in background'
        );
        collectionsQuery.refetch().catch((err) => {
          console.warn(
            'AuthWatcher: collections refetch on route change failed',
            err
          );
        });
      };

      router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }, [router.events, token, collectionsQuery.refetch]);

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
      <TranslationProvider locale={locale}>
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
