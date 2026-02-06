import type { GetServerSideProps, NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';
import { signIn, useSession, getSession } from 'next-auth/react';
import { Card, Text, Spacer } from '@nextui-org/react';
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
      <Card css={{ maxWidth: '500px', margin: '0 auto', padding: '32px 24px' }}>
        <Box>
          <Text h2 css={{ textAlign: 'center', marginBottom: '8px' }}>
            {t('title')}
          </Text>
          <Text css={{ textAlign: 'center', color: '$gray600' }}>
            {t('subtitle')}
          </Text>
          <Spacer y={1} />

          {error && (
            <>
              <Text color="error" css={{ textAlign: 'center' }}>
                {error === 'OAuthCallback'
                  ? t('errors.authFailed')
                  : error === 'AccessDenied'
                  ? t('errors.accessDenied')
                  : t('errors.genericError')}
              </Text>
              <Spacer y={0.5} />
            </>
          )}

          <Button
            onClick={handleSignIn}
            disabled={status === 'loading' || status === 'authenticated'}
            loading={status === 'loading'}
            css={{ width: '100%' }}
          >
            {status === 'loading' ? t('button.signingIn') : t('button.signIn')}
          </Button>

          <Text
            size="$sm"
            css={{ textAlign: 'center', color: '$gray500', marginTop: '8px' }}
          >
            {t('redirectMessage')}
          </Text>
        </Box>
      </Card>
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
