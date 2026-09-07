import fetchJson from '@/lib/fetchJson';
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
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

export const reviewRouter = router({
  getAllSources: publicProcedure.query(() => {
    return fetchJson<void, GetSourcesProps>(`${baseURL}/review/source`);
  }),
  getSource: publicProcedure
    .input(
      z.object({
        sourceId: z.string(),
        docId: z.string().optional(),
      })
    )
    .query(({ input }) => {
      return fetchJson<void, GetSourceProps>(
        `${baseURL}/review/source/${input.sourceId}`
      );
    }),
  getDocument: publicProcedure
    .input(
      z.object({
        sourceId: z.string(),
        docId: z.string(),
      })
    )
    .query(({ input }) => {
      const { sourceId, docId } = input;
      return fetchJson<void, GetDocumentProps>(
        `${baseURL}/review/source/${sourceId}/doc/${docId}`
      );
    }),
  saveDocument: publicProcedure
    .input(
      z.object({
        sourceId: z.string(),
        docId: z.string(),
        document: z.any(),
      })
    )
    .mutation(({ input }) => {
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
    }),
});
