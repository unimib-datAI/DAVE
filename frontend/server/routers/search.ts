import { z } from 'zod';
import { createRouter } from '../context';
import { Document } from './document';
import { TRPCError } from '@trpc/server';
import { runFacetedSearch } from '@/lib/facetedSearch';
import { search as runVectorSearch } from '@/lib/vectorSearch';
import { addAnnotationsToDocumentEs } from '@/lib/elasticAdmin';
import { ChatController } from '@/lib/documentsBackend/chatController';

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

export type FacetedQueryHit = {
  _id: string;
  id: Number;
  mongo_id: string;
  text: string;
  name: string;
  metadata: HitMetadata[];
  annotations: HitAnnotation[];
};

export type HitMetadata = {
  type: string;
  value: string;
};

export type HitAnnotation = {
  start: number;
  end: number;
  mention: string;
  type: string;
  id_ER: string;
  display_name?: string;
};

export type Facet = {
  key: string;
  n_children: number;
  doc_count: number;
  children: {
    key: string;
    ids_ER: string[];
    display_name: string;
    is_linked?: boolean;
    doc_count: number;
  }[];
};

export type FacetedQueryOutput = {
  hits: FacetedQueryHit[];
  facets: {
    metadata: Facet[];
    annotations: Facet[];
  };
  pagination: {
    current_page: number;
    total_hits: number;
    total_pages: number;
  };
};

export type AddAnnotationsResponse = {
  result: string;
  document_id: string;
  annotations_added: number;
};

export type DocumentChunk = {
  id: string;
  distance: number;
  metadata: {
    doc_id: string;
    chunk_size: number;
  };
  text: string;
  text_anonymized?: string;
};

export type DocumentWithChunk = {
  id: number;
  title: string;
  preview: string;
  chunks: DocumentChunk[];
  full_docs?: boolean;
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
    const index = process.env.ELASTIC_INDEX as string;

    console.log('========== SERVER: ANNOTATION SAVE REQUEST ==========');
    console.log('Index name:', indexName);
    console.log('Document ID:', documentId);
    console.log('Number of annotations:', mentions.length);
    console.log('Annotations:', JSON.stringify(mentions, null, 2));
    console.log('====================================================');

    const result = await addAnnotationsToDocumentEs(index, documentId, mentions);

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

export const search = createRouter()
  .mutation('mostSimilarDocuments', {
    input: z.object({
      query: z.string(),
      filter_ids: z.array(z.string()).optional(),
      retrievalMethod: z.string().optional(),
      force_rag: z.boolean().optional(),
      collectionId: z.string().optional(),
    }),
    resolve: async ({ input }) => {
      const index = process.env.ELASTIC_INDEX as string;
      console.log('*** most similar collection id ***', input.collectionId);
      // forward collectionId (if provided) to restrict the search to a single collection
      const documents = (await runVectorSearch({
        collectionName: index,
        query: input.query,
        filterIds: input.filter_ids,
        retrievalMethod: input.retrievalMethod || 'full',
        forceRag: input.force_rag,
        collectionId: input.collectionId,
      })) as unknown as GetSimilarDocumentResponse;

      return processResponseMostSImilartDocuments(documents);
    },
  })
  .query('facetedSearch', {
    input: z.object({
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
    }),
    resolve: async ({ input }) => {
      const index = process.env.ELASTIC_INDEX as string;

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
    },
  })
  .mutation('rateTheConversation', {
    input: z.object({
      conversation: z.unknown(),
      rating: z.number(),
    }),
    resolve: async ({ input }) => {
      return rateTheConversation(input.conversation, input.rating);
    },
  })
  .mutation('addAnnotations', {
    input: z.object({
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
    }),
    resolve: async ({ input }) => {
      const { indexName, documentId, annotations } = input;
      console.log('========== SERVER: ANNOTATION REQUEST RECEIVED ==========');
      console.log('Input received:', JSON.stringify(input, null, 2));
      console.log('=========================================================');
      return addAnnotationsToDocument(indexName, documentId, annotations);
    },
  });
