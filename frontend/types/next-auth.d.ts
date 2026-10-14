import 'next-auth';
import { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

// For more info: https://next-auth.js.org/getting-started/typescript

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    idToken?: string;
    error?: string;
    user?: {
      userId?: string;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    idToken?: string;
    error?: string;
    user: {
      userId?: string;
      email?: string;
    };
  }
}
