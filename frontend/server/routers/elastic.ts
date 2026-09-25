import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import { addAnnotationsToDocumentEs } from '@/lib/elasticAdmin';

type AddAnnotationsResponse = {
  result: string;
  document_id: string;
  annotations_added: number;
};

const addAnnotationsToDocument = async (
  indexName: string,
  documentId: string,
  mentions: any[]
): Promise<AddAnnotationsResponse> => {
  try {
    return (await addAnnotationsToDocumentEs(
      indexName,
      documentId,
      mentions
    )) as unknown as AddAnnotationsResponse;
  } catch (error) {
    console.error('Error adding annotations to document:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to add annotations to document: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

export const elastic = createRouter()
  .mutation('addAnnotations', {
    input: z.object({
      indexName: z.string(),
      documentId: z.string(),
      annotations: z.array(
        z.object({
          id: z.string().optional(),
          id_ER: z.string().optional(),
          start: z.number(),
          end: z.number(),
          type: z.string(),
          mention: z.string(),
          is_linked: z.boolean().optional(),
          display_name: z.string().optional(),
        })
      ),
    }),
    resolve: async ({ input }) => {
      const { indexName, documentId, annotations } = input;
      return addAnnotationsToDocument(indexName, documentId, annotations);
    },
  });
