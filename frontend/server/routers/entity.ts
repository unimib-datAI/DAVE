import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';

const baseURL = `${process.env.API_BASE_URI}`;

export type FacetEntry = {
  _id: string;
  collectionId: string;
  facetType: string;
  display_name: string;
  displayNameLower: string;
  is_linked: boolean;
  ids_ER: string[];
  doc_ids: string[];
  doc_count: number;
  metadata?: Record<string, string>;
};

export type EntityMention = {
  doc_id: string;
  doc_name: string;
  annotation_id: number;
  start: number;
  end: number;
  text: string;
  context: string;
};

export type EntityListResponse = {
  data: FacetEntry[];
  pagination: { page: number; total: number; totalPages: number } | null;
  types: string[];
};

export type EntityDetailResponse = {
  entity: FacetEntry;
  mentions: EntityMention[];
  pagination: { page: number; total: number; totalPages: number };
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

export const entity = createRouter()
  .query('getAll', {
    input: z.object({
      collectionId: z.string(),
      token: z.string().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
      type: z.string().optional(),
      q: z.string().optional(),
      sort: z.enum(['doc_count', 'display_name']).optional(),
      is_linked: z.boolean().optional(),
    }),
    async resolve({ input }) {
      const { collectionId, token, page, limit, type, q, sort, is_linked } =
        input;
      const headers: Record<string, string> = {};
      const authHeader = getJWTHeader(token);
      if (authHeader) headers.Authorization = authHeader;

      const params: Record<string, string> = {};
      if (page !== undefined) params.page = String(page);
      if (limit !== undefined) params.limit = String(limit);
      if (type) params.type = type;
      if (q) params.q = q;
      if (sort) params.sort = sort;
      if (is_linked !== undefined) params.is_linked = String(is_linked);

      const qs = new URLSearchParams(params).toString();
      const url = `${baseURL}/entity/${encodeURIComponent(collectionId)}${qs ? `?${qs}` : ''}`;

      try {
        return await fetchJson<any, EntityListResponse>(url, { headers });
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.response?.status === 403
              ? 'FORBIDDEN'
              : error?.response?.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch entities',
        });
      }
    },
  })

  .query('getById', {
    input: z.object({
      collectionId: z.string(),
      key: z.string(),
      token: z.string().optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
    }),
    async resolve({ input }) {
      const { collectionId, key, token, page, limit } = input;
      const headers: Record<string, string> = {};
      const authHeader = getJWTHeader(token);
      if (authHeader) headers.Authorization = authHeader;

      const params: Record<string, string> = {};
      if (page !== undefined) params.page = String(page);
      if (limit !== undefined) params.limit = String(limit);

      const qs = new URLSearchParams(params).toString();
      const url = `${baseURL}/entity/${encodeURIComponent(collectionId)}/${encodeURIComponent(key)}${qs ? `?${qs}` : ''}`;

      try {
        return await fetchJson<any, EntityDetailResponse>(url, { headers });
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.response?.status === 403
              ? 'FORBIDDEN'
              : error?.response?.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch entity',
        });
      }
    },
  })

  .mutation('update', {
    input: z.object({
      collectionId: z.string(),
      key: z.string(),
      token: z.string().optional(),
      display_name: z.string().min(1).optional(),
      facetType: z.string().min(1).optional(),
      ids_ER: z.array(z.string()).optional(),
      metadata: z.record(z.string()).optional(),
      elasticIndex: z.string().optional(),
    }),
    async resolve({ input }) {
      const {
        collectionId,
        key,
        token,
        display_name,
        facetType,
        ids_ER,
        metadata,
        elasticIndex,
      } = input;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = getJWTHeader(token);
      if (authHeader) headers.Authorization = authHeader;

      const url = `${baseURL}/entity/${encodeURIComponent(collectionId)}/${encodeURIComponent(key)}`;

      try {
        return await fetchJson<any, FacetEntry>(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ display_name, facetType, ids_ER, metadata, elasticIndex }),
        });
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.response?.status === 403
              ? 'FORBIDDEN'
              : error?.response?.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to update entity',
        });
      }
    },
  })

  .mutation('merge', {
    input: z.object({
      collectionId: z.string(),
      source_key: z.string(),
      target_key: z.string(),
      token: z.string().optional(),
      elasticIndex: z.string().optional(),
    }),
    async resolve({ input }) {
      const { collectionId, source_key, target_key, token, elasticIndex } =
        input;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = getJWTHeader(token);
      if (authHeader) headers.Authorization = authHeader;

      const url = `${baseURL}/entity/${encodeURIComponent(collectionId)}/merge`;

      try {
        return await fetchJson<any, FacetEntry>(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ source_key, target_key, elasticIndex }),
        });
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.response?.status === 403
              ? 'FORBIDDEN'
              : error?.response?.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to merge entities',
        });
      }
    },
  })

  .mutation('delete', {
    input: z.object({
      collectionId: z.string(),
      key: z.string(),
      token: z.string().optional(),
      elasticIndex: z.string().optional(),
    }),
    async resolve({ input }) {
      const { collectionId, key, token, elasticIndex } = input;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const authHeader = getJWTHeader(token);
      if (authHeader) headers.Authorization = authHeader;

      const url = `${baseURL}/entity/${encodeURIComponent(collectionId)}/${encodeURIComponent(key)}`;

      try {
        return await fetchJson<any, { message: string; entity: FacetEntry }>(
          url,
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ elasticIndex }),
          }
        );
      } catch (error: any) {
        throw new TRPCError({
          code:
            error?.response?.status === 403
              ? 'FORBIDDEN'
              : error?.response?.status === 404
              ? 'NOT_FOUND'
              : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to delete entity',
        });
      }
    },
  });
