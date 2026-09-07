import { App as AntdApp } from 'antd';
import {
  setupPermissionInterceptor,
  setShowMessageFn,
} from '@/lib/permissionInterceptor';
import { Global } from '@emotion/react';
import styled from '@emotion/styled';
import type { AppProps } from 'next/app';
import GlobalStyles from '../styles/globalStyles';
import NextNProgress from 'nextjs-progressbar';
import { trpc, setAuthToken } from '@/utils/trpc';
import { HeroUIProvider } from '@heroui/react';
import { NextPage } from 'next';
import { ReactElement, ReactNode, useEffect, useState, useRef } from 'react';
import {
  SessionProvider,
  useSession,
  signOut,
  getSession,
} from 'next-auth/react';
import { useRouter } from 'next/router';
import { useAtom } from 'jotai';
import { loadLLMSettingsAtom } from '@/atoms/llmSettings';

import { TranslationProvider } from '@/components';
import TaxonomyProvider from '@/modules/taxonomy/TaxonomyProvider';
import { UploadProgressIndicator } from '@/components/UploadProgressIndicator';
import { UploadNotificationCenter } from '@/components/UploadNotificationCenter';
import { UploadJobsWatcher } from '@/components/UploadJobsWatcher';
import { isAuthEnabled, getSignInUrl } from '@/utils/auth';
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

/**
 * Wires the antd App.useApp() message API to the permission interceptor.
 * Must be rendered inside <AntdApp> so that useApp() has context.
 * This is the correct antd v5 / React 19 pattern — the static message()
 * API is unreliable outside React's rendering pipeline.
 */
function PermissionMessageWirer() {
  const { message } = AntdApp.useApp();
  const wired = useRef(false);
  useEffect(() => {
    if (!wired.current) {
      setShowMessageFn((msg) => message.error(msg));
      wired.current = true;
    }
  }, [message]);
  return null;
}

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

  // Install the global permission-denied interceptor once on mount.
  // It patches window.fetch to catch 401/403 errors from tRPC calls and
  // shows an Ant Design notification. See lib/permissionInterceptor.ts for details.
  useEffect(() => setupPermissionInterceptor(), []);

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
    const authEnabled = isAuthEnabled();

    // useSession is safe to call here because AuthWatcher will be rendered inside SessionProvider
    const { data: currentSession, update } = useSession();
    const router = useRouter();
    const [, loadLLMSettings] = useAtom(loadLLMSettingsAtom);

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

    // The access token now rides as an Authorization header (see utils/trpc.ts).
    // Publish it to the module-level holder whenever the session changes so the
    // tRPC link picks it up on the next request.
    const token = (currentSession as any)?.accessToken;
    useEffect(() => {
      setAuthToken(token);
    }, [token]);

    // Background-fetch collections (populates the react-query cache that the
    // collection selector reads). Enabled once a token is present, or always
    // when auth is disabled.
    const collectionsQuery = trpc.collection.getAll.useQuery(undefined, {
      enabled: authEnabled ? Boolean(token) : true,
      refetchOnWindowFocus: false,
      retry: false,
    });

    // When we detect a refresh failure, sign the user out and redirect to the sign-in page.
    useEffect(() => {
      if (!authEnabled) return;

      try {
        if ((currentSession as any)?.error === 'RefreshAccessTokenError') {
          // sign out and redirect to sign-in page
          signOut({
            callbackUrl: getSignInUrl(),
          });
        }
      } catch (e) {
        // Silent error handling
      }
    }, [currentSession, authEnabled]);

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

    // Proactively refresh the session before token expires
    useEffect(() => {
      if (!authEnabled || !token) return;

      let timeoutId: NodeJS.Timeout;
      let intervalId: NodeJS.Timeout;

      const scheduleRefresh = () => {
        try {
          const parts = token.split('.');
          if (parts.length < 2) {
            console.warn('AuthWatcher: Invalid token format');
            return;
          }

          const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            Array.prototype.map
              .call(atob(payload), (c: string) => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
              })
              .join('')
          );
          const parsed = JSON.parse(jsonPayload);

          if (parsed?.exp) {
            const expiresAt = parsed.exp * 1000;
            const now = Date.now();
            const timeUntilExpiry = expiresAt - now;

            // If already expired, refresh immediately
            if (timeUntilExpiry <= 0) {
              console.log(
                'AuthWatcher: token already expired, refreshing immediately'
              );
              update().catch((err) => {
                console.error('AuthWatcher: immediate refresh failed', err);
                signOut({
                  callbackUrl: getSignInUrl(),
                });
              });
              return;
            }

            // Refresh 60 seconds before expiry (or halfway through if token is very short-lived)
            const refreshBuffer = Math.min(60 * 1000, timeUntilExpiry / 2);
            const refreshIn = timeUntilExpiry - refreshBuffer;

            console.log(
              `AuthWatcher: scheduling refresh in ${Math.round(
                refreshIn / 1000
              )}s (token expires in ${Math.round(timeUntilExpiry / 1000)}s)`
            );

            timeoutId = setTimeout(async () => {
              try {
                console.log(
                  'AuthWatcher: performing scheduled session refresh'
                );
                await update();
                console.log('AuthWatcher: scheduled refresh finished');
              } catch (err) {
                console.error('AuthWatcher: scheduled refresh failed', err);
                signOut({
                  callbackUrl: getSignInUrl(),
                });
              }
            }, refreshIn);
          } else {
            // Fallback: if we can't read expiry, refresh every 2 minutes
            console.warn(
              'AuthWatcher: no expiry in token, using fallback interval'
            );
            intervalId = setInterval(async () => {
              try {
                console.log(
                  'AuthWatcher: performing fallback periodic refresh'
                );
                await update();
                console.log('AuthWatcher: fallback refresh finished');
              } catch (err) {
                console.error('AuthWatcher: fallback refresh failed', err);
                signOut({
                  callbackUrl: getSignInUrl(),
                });
              }
            }, 120 * 1000);
          }
        } catch (err) {
          console.error(
            'AuthWatcher: error parsing token, using fallback interval',
            err
          );
          // Fallback interval if token parsing fails
          intervalId = setInterval(async () => {
            try {
              await update();
            } catch (err) {
              console.error('AuthWatcher: fallback refresh failed', err);
              signOut({
                callbackUrl: getSignInUrl(),
              });
            }
          }, 120 * 1000);
        }
      };

      scheduleRefresh();

      return () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
      };
    }, [token, update, authEnabled]);

    // Also refetch collections on every route change (background only if token is defined or auth is disabled)
    useEffect(() => {
      const handleRouteChange = () => {
        if (authEnabled && !token) return;
        collectionsQuery.refetch().catch(() => {
          // Silent error handling
        });
      };

      router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }, [router.events, token, collectionsQuery.refetch, authEnabled]);

    // Load LLM settings on mount
    useEffect(() => {
      loadLLMSettings().catch(() => {
        // Silent error handling - will use defaults
      });
    }, [loadLLMSettings]);

    return null;
  };

  const authEnabled = isAuthEnabled();

  return (
    <SessionProvider
      session={session}
      basePath={`${process.env.NEXT_PUBLIC_BASE_PATH}/api/auth`}
    >
      {/* AuthWatcher runs always: handles LLM settings, collection prefetch, and route-change refetch.
          Auth-specific operations (token refresh, sign-out on error) are guarded internally. */}
      <AuthWatcher />

      <Global styles={GlobalStyles} />
      <TranslationProvider key={localeVersion} locale={locale}>
        <TaxonomyProvider>
          <AntdApp>
            <PermissionMessageWirer />
            <HeroUIProvider>
              <Layout>
                <NextNProgress color="rgb(75 85 99)" showOnShallow={false} />
                {getLayout(<Component {...pageProps} />)}
                <UploadJobsWatcher />
                <UploadProgressIndicator />
                <UploadNotificationCenter />
              </Layout>
            </HeroUIProvider>
          </AntdApp>
        </TaxonomyProvider>
      </TranslationProvider>
    </SessionProvider>
  );
}

// tRPC client config (links, url, headers, fetch) lives in utils/trpc.ts.
export default trpc.withTRPC(MyApp);
