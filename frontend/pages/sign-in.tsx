import type { GetServerSideProps, NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';
import { signIn, useSession, getSession } from 'next-auth/react';
// Use a local styled card to reproduce previous visual layout
import { Button } from '@/components';
import { useText } from '@/components/TranslationProvider';
import { isAuthDisabled, getAuthRedirectUrl } from '@/utils/auth';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  max-width: 1200px;
  margin: 0px auto;
  padding: 40px 20px;
`;

const Box = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
`;

const SignCard = styled.div`
  max-width: 500px;
  margin: 0 auto;
  padding: 32px 24px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  width: 100%;
`;

/**
 * Keycloak login page component
 * Automatically redirects to Keycloak for authentication
 */
const Login: NextPage<{}> = () => {
  const { status } = useSession();
  const router = useRouter();
  const { error, callbackUrl } = router.query;
  const t = useText('signIn');

  // If auth is disabled, redirect immediately to home
  useEffect(() => {
    if (isAuthDisabled()) {
      const redirectUrl = getAuthRedirectUrl(callbackUrl as string);
      router.push(redirectUrl);
    }
  }, [router, callbackUrl]);

  // If user is already authenticated, redirect to home
  useEffect(() => {
    if (status === 'authenticated') {
      // Use callbackUrl if provided, otherwise default to root
      const redirectUrl = getAuthRedirectUrl(callbackUrl as string);
      router.push(redirectUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSignIn = () => {
    // Don't allow sign in if auth is disabled
    if (isAuthDisabled()) {
      return;
    }
    // Use callbackUrl if provided, otherwise default to root
    const redirect = getAuthRedirectUrl(callbackUrl as string);
    signIn('keycloak', { callbackUrl: redirect });
  };

  return (
    <Container>
      <SignCard>
        <Box>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>{t('title')}</h2>
          <p style={{ textAlign: 'center', color: '#6b7280' }}>
            {t('subtitle')}
          </p>
          <div style={{ height: 8 }} />

          {error && (
            <>
              <p style={{ textAlign: 'center', color: 'red' }}>
                {error === 'OAuthCallback'
                  ? t('errors.authFailed')
                  : error === 'AccessDenied'
                  ? t('errors.accessDenied')
                  : t('errors.genericError')}
              </p>
              <div style={{ height: 4 }} />
            </>
          )}

          <Button
            onClick={handleSignIn}
            disabled={status === 'loading' || status === 'authenticated'}
            loading={status === 'loading'}
            style={{ width: '100%' }}
          >
            {status === 'loading' ? t('button.signingIn') : t('button.signIn')}
          </Button>

          <p
            style={{
              textAlign: 'center',
              color: '#9ca3af',
              marginTop: 8,
              fontSize: '0.875rem',
            }}
          >
            {t('redirectMessage')}
          </p>
        </Box>
      </SignCard>
    </Container>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Login;
