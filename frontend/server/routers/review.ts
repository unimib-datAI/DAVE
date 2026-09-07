import fetchJson from '@/lib/fetchJson';
import { z } from 'zod';
import { createRouter } from '../context';
import { serverConfig } from '@/lib/config/server';
import type {
  GetDocumentProps,
  GetSourceProps,
  Source,
} from '@/lib/types/review';

const baseURL = serverConfig.externalBackend.baseUri;

export type PostSaveDocumentProps = {
  sourceId: string;
  docId: string;
};

export type GetSourcesProps = {
  sources: Source[];
};

export const review = createRouter()
  .query('getAllSources', {
    resolve: ({ input }) => {
      return fetchJson<void, GetSourcesProps>(`${baseURL}/review/source`);
    },
  })
  .query('getSource', {
    input: z.object({
      sourceId: z.string(),
      docId: z.string().optional(),
    }),
    resolve: ({ input }) => {
      const { sourceId } = input;
      return fetchJson<void, GetSourceProps>(
        `${baseURL}/review/source/${sourceId}`
      );
    },
  })
  .query('getDocument', {
    input: z.object({
      sourceId: z.string(),
      docId: z.string(),
    }),
    resolve: ({ input }) => {
      const { sourceId, docId } = input;
      return fetchJson<void, GetDocumentProps>(
        `${baseURL}/review/source/${sourceId}/doc/${docId}`
      );
    },
  })
  .mutation('saveDocument', {
    input: z.object({
      sourceId: z.string(),
      docId: z.string(),
      document: z.any(),
    }),
    resolve: ({ input }) => {
      const { sourceId, docId, document } = input;
      return fetchJson<any, PostSaveDocumentProps>(
        `${baseURL}/review/source/${sourceId}/doc/${docId}`,
        {
          method: 'POST',
          body: {
            document,
          },
        }
      );
    },
  });
