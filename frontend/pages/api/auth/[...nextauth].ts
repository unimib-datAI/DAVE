import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

// API_BASE_URI already points to /api, so auth endpoints are at /api/auth/*
const API_BASE_URI = process.env.API_BASE_URI || 'http://localhost:8080/api';

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

    const res = await fetch(`${API_BASE_URI}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
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
      accessToken: refreshed?.accessToken ? mask(refreshed.accessToken) : null,
      refreshToken: refreshed?.refreshToken
        ? mask(refreshed.refreshToken)
        : null,
      expiresIn: refreshed?.expiresIn,
    });

    return {
      ...token,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + (refreshed.expiresIn as number) * 1000,
      user: refreshed.user ?? token.user,
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
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // Accept either email or username (use username as email if email not provided)
        const email = credentials?.email || credentials?.username;
        const password = credentials?.password;

        if (!email || !password) {
          return null;
        }

        try {
          console.log('Attempting login to:', `${API_BASE_URI}/auth/login`);
          const res = await fetch(`${API_BASE_URI}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email,
              password: password,
            }),
          });

          if (!res.ok) {
            console.error('Login failed with status:', res.status);
            return null;
          }

          const data = await res.json();
          console.log('Login successful for:', data.user?.email);

          if (!data || !data.accessToken) {
            return null;
          }

          return {
            id: data.user.userId,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresIn: data.expiresIn,
          };
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      console.log(
        'NextAuth.jwt: invoked; userPresent=',
        !!user,
        'token.accessTokenExpires=',
        token?.accessTokenExpires
      );

      // First sign in
      if (user) {
        const u: any = user as any;
        console.log(
          'NextAuth.jwt: initial sign-in for user=',
          u?.email ?? u?.id
        );
        return {
          ...token,
          accessToken: u.accessToken,
          refreshToken: u.refreshToken,
          accessTokenExpires: Date.now() + (u.expiresIn as number) * 1000,
          user: {
            userId: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
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
      session.error = token.error as string;
      return session;
    },
  },
};

export default NextAuth(authOptions);
