import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { runFacetedSearch } from '@/lib/facetedSearch';
import { search as runVectorSearch } from '@/lib/vectorSearch';
import { addAnnotationsToDocumentEs } from '@/lib/elasticAdmin';
import { ChatController } from '@/lib/documentsBackend/chatController';
import { serverConfig } from '@/lib/config/server';
import type { Document } from '@/lib/types/document';
import type { DocumentWithChunk, FacetedQueryOutput } from '@/lib/types/search';

export type MostSimilarDocument = {
  id: number;
  title: string;
  preview: string;
  chunks: GetSimilarDocument['chunks'];
};

type GetSimilarDocument = {
  doc: Document;
  full_docs: boolean;
  chunks: {
    id: string;
    distance: number;
    metadata: { doc_id: string; chunk_size: number };
    text: string;
    text_anonymized?: string;
  }[];
};

export type GetSimilarDocumentResponse = GetSimilarDocument[];

export type AddAnnotationsResponse = {
  result: string;
  document_id: string;
  annotations_added: number;
};

const processResponseMostSImilartDocuments = (
  docs: GetSimilarDocumentResponse
): DocumentWithChunk[] => {
  return docs.map((d) => {
    return {
      full_docs: d.full_docs,
      id: d.doc.id,
      title: d.doc.name,
      preview: d.doc.preview
        ? `${d.doc.preview.split(' ').slice(0, 20).join(' ')}...`
        : '',
      chunks: d.chunks,
    };
  });
};

async function rateTheConversation(conversation: any, rating: number) {
  try {
    return await ChatController.saveRating(rating, conversation);
  } catch (error) {
    const typedError = error as Error;
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error rating the conversation ' + typedError.message,
    });
  }
}

async function addAnnotationsToDocument(
  indexName: string,
  documentId: string,
  mentions: any[]
): Promise<AddAnnotationsResponse> {
  try {
    const index = serverConfig.elastic.index;

    console.log('========== SERVER: ANNOTATION SAVE REQUEST ==========');
    console.log('Index name:', indexName);
    console.log('Document ID:', documentId);
    console.log('Number of annotations:', mentions.length);
    console.log('Annotations:', JSON.stringify(mentions, null, 2));
    console.log('====================================================');

    const result = await addAnnotationsToDocumentEs(
      index,
      documentId,
      mentions
    );

    console.log('========== SERVER: ANNOTATION SAVE RESPONSE ==========');
    console.log('Response:', JSON.stringify(result, null, 2));
    console.log('======================================================');

    return result as unknown as AddAnnotationsResponse;
  } catch (error) {
    console.error('========== SERVER: ANNOTATION SAVE ERROR ==========');
    console.error('Error adding annotations to document:', error);
    console.error('Index:', indexName);
    console.error('Document ID:', documentId);
    console.error('===================================================');

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to add annotations to document: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

export const searchRouter = router({
  mostSimilarDocuments: publicProcedure
    .input(
      z.object({
        query: z.string(),
        filter_ids: z.array(z.string()).optional(),
        retrievalMethod: z.string().optional(),
        force_rag: z.boolean().optional(),
        collectionId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const index = serverConfig.elastic.index;
      console.log('*** most similar collection id ***', input.collectionId);
      const documents = (await runVectorSearch({
        collectionName: index,
        query: input.query,
        filterIds: input.filter_ids,
        retrievalMethod: input.retrievalMethod || 'full',
        forceRag: input.force_rag,
        collectionId: input.collectionId,
      })) as unknown as GetSimilarDocumentResponse;

      return processResponseMostSImilartDocuments(documents);
    }),

  facetedSearch: publicProcedure
    .input(
      z.object({
        text: z.string(),
        metadata: z.array(
          z.object({
            value: z.string(),
            type: z.string(),
          })
        ),
        annotations: z.array(
          z.object({
            value: z.string(),
            type: z.string(),
          })
        ),
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
        collectionId: z.string().optional(),
        isAnonymized: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const index = serverConfig.elastic.index;

      return runFacetedSearch({
        indexName: index,
        text: input.text,
        metadata: input.metadata,
        annotations: input.annotations,
        page: input.cursor || 1,
        documentsPerPage: input.limit || 20,
        collectionId: input.collectionId,
        isAnonymized: input.isAnonymized,
      }) as Promise<FacetedQueryOutput>;
    }),

  rateTheConversation: publicProcedure
    .input(
      z.object({
        conversation: z.unknown(),
        rating: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      return rateTheConversation(input.conversation, input.rating);
    }),

  addAnnotations: publicProcedure
    .input(
      z.object({
        indexName: z.string(),
        documentId: z.string(),
        annotations: z.array(
          z.object({
            id: z.number(),
            id_ER: z.string().optional(),
            start: z.number(),
            end: z.number(),
            type: z.string(),
            mention: z.string(),
            is_linked: z.boolean().optional(),
            display_name: z.string().optional(),
            to_delete: z.boolean().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const { indexName, documentId, annotations } = input;
      return addAnnotationsToDocument(indexName, documentId, annotations);
    }),
});
