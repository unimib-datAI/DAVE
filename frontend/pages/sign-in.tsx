import type { GetServerSideProps, NextPage } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';
import { signIn, useSession, getSession } from 'next-auth/react';
import { Card, Text, Spacer } from '@nextui-org/react';
import { Button } from '@/components';

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

  // If user is already authenticated, redirect to home
  useEffect(() => {
    if (status === 'authenticated') {
      // Use callbackUrl if provided, otherwise default to root
      const redirectUrl = (callbackUrl as string) || '/';
      router.push(redirectUrl);
    }
  }, [status, router, callbackUrl]);

  const handleSignIn = () => {
    // Use callbackUrl if provided, otherwise default to root
    const redirect = (callbackUrl as string) || '/';
    signIn('keycloak', { callbackUrl: redirect });
  };

  return (
    <Container>
      <Card css={{ maxWidth: '500px', margin: '0 auto', padding: '32px 24px' }}>
        <Box>
          <Text h2 css={{ textAlign: 'center', marginBottom: '8px' }}>
            DAVE 🔨
          </Text>
          <Text css={{ textAlign: 'center', color: '$gray600' }}>
            Data Analysis and Visualization Environment
          </Text>
          <Spacer y={1} />

          {error && (
            <>
              <Text color="error" css={{ textAlign: 'center' }}>
                {error === 'OAuthCallback'
                  ? 'Authentication failed. Please try again.'
                  : error === 'AccessDenied'
                  ? 'Access denied. You do not have permission to access this application.'
                  : 'An error occurred during sign in. Please try again.'}
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
            {status === 'loading' ? 'Signing in...' : 'Sign in with Keycloak'}
          </Button>

          <Text
            size="$sm"
            css={{ textAlign: 'center', color: '$gray500', marginTop: '8px' }}
          >
            You will be redirected to Keycloak for authentication
          </Text>
        </Box>
      </Card>
    </Container>
  );
};

// No server-side redirect needed - the useEffect hook handles client-side redirect
// and the middleware handles protecting routes

export default Login;
