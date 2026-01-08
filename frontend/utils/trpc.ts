import { AppRouter } from '@/server/routers/_app';
import { createReactQueryHooks } from '@trpc/react';

export const getJWTHeader = (token?: string) => {
  if (!token) {
    throw new Error('No authentication token provided');
  }
  return `Bearer ${token}`;
};
export const {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useSubscription,
  useContext,
} = createReactQueryHooks<AppRouter>();
