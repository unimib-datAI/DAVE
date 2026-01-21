import NextAuth, { NextAuthOptions } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';

// Keycloak configuration
const KEYCLOAK_ID = process.env.KEYCLOAK_ID || '';
const KEYCLOAK_SECRET = process.env.KEYCLOAK_SECRET || '';
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || '';

async function refreshAccessToken(token: any) {
  try {
    // Minimal masking helper for logs
    const mask = (t: any) =>
      t && typeof t === 'string'
        ? `${t.slice(0, 6)}...${t.slice(-4)}`
        : '<missing>';

    console.log(
      'refreshAccessToken: attempting refresh for refreshToken=',
      mask(token?.refreshToken)
    );

    // Keycloak token endpoint
    const url = `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      client_id: KEYCLOAK_ID,
      client_secret: KEYCLOAK_SECRET,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    console.log(
      'refreshAccessToken: refresh endpoint responded with',
      res.status
    );

    if (!res.ok) {
      console.error(
        'refreshAccessToken: refresh request failed with status',
        res.status
      );
      throw new Error('Failed to refresh token');
    }

    const refreshed = await res.json();

    console.log('refreshAccessToken: refreshed payload received', {
      accessToken: refreshed?.access_token
        ? mask(refreshed.access_token)
        : null,
      refreshToken: refreshed?.refresh_token
        ? mask(refreshed.refresh_token)
        : null,
      expiresIn: refreshed?.expires_in,
    });

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      idToken: refreshed.id_token,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: `${process.env.NEXT_PUBLIC_BASE_PATH}/sign-in`,
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 900,
      },
    },
    state: {
      name: `next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 900,
      },
    },
    nonce: {
      name: `next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    },
  },
  providers: [
    KeycloakProvider({
      clientId: KEYCLOAK_ID,
      clientSecret: KEYCLOAK_SECRET,
      issuer: KEYCLOAK_ISSUER,
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      console.log(
        'NextAuth.jwt: invoked; userPresent=',
        !!user,
        'accountPresent=',
        !!account,
        'token.accessTokenExpires=',
        token?.accessTokenExpires
      );

      // First sign in with Keycloak
      if (account && user) {
        console.log(
          'NextAuth.jwt: initial sign-in with provider=',
          account.provider
        );

        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
          user: {
            userId: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          },
        };
      }

      // Return previous token if not expired
      if (Date.now() < (token.accessTokenExpires as number)) {
        console.log(
          'NextAuth.jwt: existing access token still valid for user=',
          token?.user?.email ?? token?.user?.userId
        );
        return token;
      }

      // Access token has expired, try to refresh it
      console.log(
        'NextAuth.jwt: access token expired; attempting refresh for user=',
        token?.user?.email ?? token?.user?.userId
      );
      const refreshed = await refreshAccessToken(token);
      if (refreshed?.error) {
        console.warn(
          'NextAuth.jwt: refresh failed with error=',
          refreshed.error
        );
      } else {
        console.log(
          'NextAuth.jwt: refresh succeeded; new accessExpires=',
          refreshed.accessTokenExpires
        );
      }
      return refreshed;
    },

    async session({ session, token }) {
      console.log(
        'NextAuth.session: building session for user=',
        token?.user?.email ?? token?.user?.userId,
        'accessTokenExpires=',
        token?.accessTokenExpires
      );
      // Make tokens and user available on the client
      session.user = token.user as any;
      session.accessToken = token.accessToken as string;
      session.idToken = token.idToken as string;
      session.error = token.error as string;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      // Optionally call Keycloak logout endpoint
      if (token?.idToken) {
        try {
          const logoutUrl = `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout`;
          const params = new URLSearchParams({
            id_token_hint: token.idToken as string,
          });
          await fetch(`${logoutUrl}?${params.toString()}`);
          console.log('NextAuth.signOut: Keycloak logout successful');
        } catch (error) {
          console.error('NextAuth.signOut: Keycloak logout failed', error);
        }
      }
    },
  },
};

export default NextAuth(authOptions);
