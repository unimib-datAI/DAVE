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
    if (process.env.USE_AUTH === 'false') {
      return ''; // No Authorization header when auth is disabled
    }
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

      // If no token supplied and auth is enabled, avoid calling backend and return empty collection list early
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
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
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            headers,
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
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, collectionDocInfo[]>(
          `${baseURL}/collection/collectioninfo/${id}`,
          {
            headers,
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
  // Get facets cache for a collection (proxied to backend /collection/facetsCache/:id)
  .query('facetsCache', {
    input: z.object({ id: z.string(), token: z.string().optional() }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, any>(
          `${baseURL}/collection/facetsCache/${encodeURIComponent(id)}`,
          {
            method: 'GET',
            headers,
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
          message: error?.message || 'Failed to fetch facets cache',
        });
      }
    },
  })
  // Get paginated facets cache for a collection
  .query('facetsCachePaginated', {
    input: z.object({
      id: z.string(),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, page, limit, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, any>(
          `${baseURL}/collection/facetsCachePaginated/${encodeURIComponent(id)}?page=${page}&limit=${limit}`,
          {
            method: 'GET',
            headers,
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
          message: error?.message || 'Failed to fetch paginated facets',
        });
      }
    },
  })
  // Search facets by display_name within a specific facet type
  .query('facetsCacheSearch', {
    input: z.object({
      id: z.string(),
      key: z.string(), // facet type (e.g., 'PERSON', 'ORGANIZATION')
      query: z.string(), // search string
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, key, query, page, limit, token } = input;
      try {
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }

        const result = await fetchJson<any, any>(
          `${baseURL}/collection/facetsCacheSearch/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
          {
            method: 'GET',
            headers,
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
          message: error?.message || 'Failed to search facets',
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
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection`,
          {
            method: 'POST',
            headers,
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
      config: z
        .object({
          typesToHide: z.array(z.string()).optional(),
          typesOrder: z.array(z.string()).optional(),
        })
        .optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, name, allowedUserIds, config, token } = input;
      try {
        const headers: any = {
          'Content-Type': 'application/json',
        };
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, Collection>(
          `${baseURL}/collection/${id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              name,
              allowedUserIds,
              config,
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

        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<
          any,
          { message: string; collection: Collection }
        >(`${baseURL}/collection/${id}`, {
          method: 'DELETE',
          headers,
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

      // If no token supplied and auth is enabled, do not call backend and return empty users list early
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
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
        const headers: any = {};
        const authHeader = getJWTHeader(token);
        if (authHeader) {
          headers.Authorization = authHeader;
        }
        const result = await fetchJson<any, User[]>(
          `${baseURL}/collection/users/all`,
          {
            headers,
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

  // Download collection as zip (direct stream from /collection/:id/download)
  .query('download', {
    input: z.object({ id: z.string(), token: z.string().optional() }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const authHeader = getJWTHeader(token);
        // Return a proxy URL that streams the backend zip directly to the browser.
        // If we have an auth header, append it as `auth` so the proxy can forward it.
        const proxyPath = `/api/collection/${encodeURIComponent(id)}/download`;
        const url = authHeader
          ? `${proxyPath}?auth=${encodeURIComponent(authHeader)}`
          : proxyPath;
        return { url };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to prepare download',
        });
      }
    },
  });
