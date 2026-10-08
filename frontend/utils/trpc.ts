import { AppRouter } from '@/server/routers/_app';
import { createReactQueryHooks } from '@trpc/react';

export const getJWTHeader = (token?: string) => {
  if (!token) {
    if (process.env.USE_AUTH === 'false') {
      return ''; // No Authorization header when auth is disabled
    }
    throw new Error('No authentication token provided');
  }
  return `Bearer ${token}`;
};
const PERMANENT_TRPC_ERROR_CODES = [
  'FORBIDDEN',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'BAD_REQUEST',
];

export const getTrpcErrorCode = (error: any): string | undefined =>
  error?.data?.code ?? error?.shape?.data?.code;

/**
 * Errors that will never resolve by repeating the identical request (wrong
 * owner, missing resource, expired session, invalid input).
 */
export const isPermanentTrpcError = (error: any) => {
  const code = getTrpcErrorCode(error);
  return !!code && PERMANENT_TRPC_ERROR_CODES.includes(code);
};

export const {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useSubscription,
  useContext,
} = createReactQueryHooks<AppRouter>();
