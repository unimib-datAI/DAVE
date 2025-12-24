import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';
import { TRPCClientError } from '@trpc/react';
import { AnyCnameRecord } from 'dns';

const baseURL = `${process.env.API_BASE_URI}`;
export type collectionDocInfo = {
  name: string;
  preview?: string;
  id: string;
};
export type Collection = {
  id: string;
  name: string;
  ownerId: string;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type User = {
  userId: string;
  email: string;
  name?: string;
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

export const collections = createRouter()
  // Get all collections accessible by the current user
  .query('getAll', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied, avoid calling backend and return empty collection list early
      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return [] as Collection[];
      }

      try {
        const result = await fetchJson<any, Collection[]>(
          `${baseURL}/collection`,
          {
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collections',
        });
      }
    },
  })

  // Get a specific collection by ID
  .query('getById', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collection',
        });
      }
    },
  })
  .query('getCollectionInfo', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const result = await fetchJson<any, collectionDocInfo[]>(
          `${baseURL}/collection/collectioninfo/${id}`,
          {
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch collection info',
        });
      }
    },
  })
  // Create a new collection
  .mutation('create', {
    input: z.object({
      name: z.string().min(1),
      allowedUserIds: z.array(z.string()).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { name, allowedUserIds, token } = input;
      try {
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection`,
          {
            method: 'POST',
            headers: {
              Authorization: getJWTHeader(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              allowedUserIds: allowedUserIds || [],
            }),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create collection',
        });
      }
    },
  })

  // Update a collection
  .mutation('update', {
    input: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      allowedUserIds: z.array(z.string()).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, name, allowedUserIds, token } = input;
      try {
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: getJWTHeader(token),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name,
              allowedUserIds,
            }),
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error.status === 403
              ? 'FORBIDDEN'
              : error.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update collection',
        });
      }
    },
  })

  // Delete a collection
  .mutation('delete', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const elasticIndex = process.env.ELASTIC_INDEX;

        const result = await fetchJson<
          any,
          { message: string; collection: Collection }
        >(`${baseURL}/collection/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: getJWTHeader(token),
          },
          body: {
            elasticIndex,
          },
        });
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code:
            error.status === 403
              ? 'FORBIDDEN'
              : error.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete collection',
        });
      }
    },
  })

  // Get all users for sharing
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied, do not call backend and return empty users list early
      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        console.log(
          'collections.getAllUsers: no token supplied, returning empty array'
        );
        return [] as User[];
      }

      try {
        console.log(
          'collections.getAllUsers: received token (masked)',
          `${token.slice(0, 6)}...${token.slice(-4)}`
        );
        const result = await fetchJson<any, User[]>(
          `${baseURL}/collection/users/all`,
          {
            headers: {
              Authorization: getJWTHeader(token),
            },
          }
        );
        return result;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch users',
        });
      }
    },
  })

  // Download collection as zip
  .query('download', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const response = await fetch(`${baseURL}/collection/${id}/download`, {
          headers: {
            Authorization: getJWTHeader(token),
          },
        });
        if (!response.ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to download collection',
          });
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition
          ? contentDisposition.split('filename=')[1].replace(/"/g, '')
          : `${id}.zip`;
        return { data: base64, filename };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to download collection',
        });
      }
    },
  });
