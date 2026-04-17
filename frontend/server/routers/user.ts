import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';

const baseURL = `${process.env.API_BASE_URI}`;

export type User = {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles: string[];
  createdAt?: string;
  updatedAt?: string;
};

const getJWTHeader = (token?: string) => {
  if (!token) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No authentication token provided',
    });
  }
  return `Bearer ${token}`;
};

export const users = createRouter()
  // Get all users (returns roles too)
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return [] as User[];
      }

      try {
        const result = await fetchJson<any, User[]>(`${baseURL}/users`, {
          headers: {
            Authorization: getJWTHeader(token),
          },
        });
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch users',
        });
      }
    },
  })

  // Create a new user
  .mutation('createUser', {
    input: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['admin', 'editor', 'viewer']).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { email, password, firstName, lastName, role, token } = input;
      try {
        const result = await fetchJson<any, User>(`${baseURL}/users`, {
          method: 'POST',
          headers: {
            Authorization: getJWTHeader(token),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password, firstName, lastName, role }),
        });
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create user',
        });
      }
    },
  })

  // Update an existing user
  .mutation('updateUser', {
    input: z.object({
      id: z.string(),
      email: z.string().email().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      password: z.string().min(8).optional(),
      role: z.enum(['admin', 'editor', 'viewer', '']).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, email, firstName, lastName, password, role, token } = input;
      try {
        const result = await fetchJson<any, { ok: boolean }>(
          `${baseURL}/users/${id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: getJWTHeader(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              firstName,
              lastName,
              password,
              role,
            }),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update user',
        });
      }
    },
  })

  // Delete a user
  .mutation('deleteUser', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const result = await fetchJson<any, { ok: boolean }>(
          `${baseURL}/users/${id}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete user',
        });
      }
    },
  });
