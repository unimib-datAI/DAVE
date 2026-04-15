import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';

const baseURL = `${process.env.API_BASE_URI}`;

export type DAVEPermissions = {
  _id: string;
  collections: {
    create: string[];
    update: string[];
    delete: string[];
    view: string[];
    deAnonimize: string[];
  };
  document: {
    update: string[];
  };
  chat: {
    canUse: string[];
    canDevMode: string[];
  };
  settings: {
    llm: string[];
    pipeline: string[];
  };
};

const getJWTHeader = (token?: string) => {
  if (!token) {
    if (process.env.USE_AUTH === 'false') {
      return '';
    }
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'No authentication token provided',
    });
  }
  return `Bearer ${token}`;
};

const rolesArray = z.array(z.string());

const PermissionsInput = z.object({
  collections: z.object({
    create: rolesArray,
    update: rolesArray,
    delete: rolesArray,
    view: rolesArray,
    deAnonimize: rolesArray,
  }),
  document: z.object({
    update: rolesArray,
  }),
  chat: z.object({
    canUse: rolesArray,
    canDevMode: rolesArray,
  }),
  settings: z.object({
    llm: rolesArray,
    pipeline: rolesArray,
  }),
});

export const permissions = createRouter()
  .query('getCurrent', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return null;
      }

      try {
        const headers: Record<string, string> = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, DAVEPermissions>(
          `${baseURL}/permissions`,
          { headers }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.status === 401
              ? 'UNAUTHORIZED'
              : error?.status === 403
              ? 'FORBIDDEN'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch permissions',
        });
      }
    },
  })
  .mutation('update', {
    input: z.object({
      token: z.string().optional(),
      permissions: PermissionsInput,
    }),
    async resolve({ input }) {
      const { token, permissions } = input;

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, DAVEPermissions>(
          `${baseURL}/permissions`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify(permissions),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.status === 401
              ? 'UNAUTHORIZED'
              : error?.status === 403
              ? 'FORBIDDEN'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to update permissions',
        });
      }
    },
  });
