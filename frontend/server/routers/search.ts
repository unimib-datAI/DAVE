import { z } from 'zod';
import { createRouter } from '../context';
import { Document } from './document';
import { TRPCError } from '@trpc/server';

export type MostSimilarDocument = {
  id: number;
  title: string;
  preview: string;
  chunks: GetSimilarDocument['chunks'];
};

type GetSimilarDocument = {
  doc: Document;
  chunks: {
    id: string;
    distance: number;
    metadata: { doc_id: string; chunk_size: number };
    text: string;
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

export type DocumentChunk = {
  id: string;
  distance: number;
  metadata: {
    doc_id: string;
    chunk_size: number;
  };
  text: string;
};

export type DocumentWithChunk = {
  id: number;
  title: string;
  preview: string;
  chunks: DocumentChunk[];
};

const processResponseMostSImilartDocuments = (
  docs: GetSimilarDocumentResponse
): DocumentWithChunk[] => {
  return docs.map((d) => {
    console.log('most similar docs', d.chunks);
    return {
      id: d.doc.id,
      title: d.doc.name,
      preview: `${d.doc.preview.split(' ').slice(0, 20).join(' ')}...`,
      chunks: d.chunks,
    };
  });
};

async function rateTheConversation(conversation: any, rating: number) {
  try {
    const res = await fetch(
      `${process.env.API_BASE_URI}/save/rate-conversation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatState: conversation,
          rateValue: rating,
        }),
      }
    );
    let result = await res.json();
    return result;
  } catch (error) {
    const typedError = error as Error;
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error rating the conversation ' + typedError.message,
    });
  }
}

export const search = createRouter()
  .mutation('mostSimilarDocuments', {
    input: z.object({
      query: z.string(),
      filter_ids: z.array(z.string()).optional(),
      retrievalMethod: z.string().optional(),
    }),
    resolve: async ({ input }) => {
      let index = process.env.ELASTIC_INDEX;
      console.log(
        'calling ',
        `${process.env.API_INDEXER}/chroma/collection/${index}/query`
      );
      const documents = (await fetch(
        `${process.env.API_INDEXER}/chroma/collection/${index}/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: input.query,
            filter_ids: input.filter_ids,
            retrievalMethod: input.retrievalMethod,
          }),
        }
      ).then((r) => r.json())) as GetSimilarDocumentResponse;

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
    }),
    resolve: async ({ input }) => {
      let index = process.env.ELASTIC_INDEX;
      console.log(
        'index',
        index,
        `${process.env.API_INDEXER}/elastic/index/${index}/query`
      );
      let string = JSON.stringify({
        ...input,
        n_facets: 20,
        page: input.cursor || 1,
      });
      console.log('string', string);
      const res = await fetch(
        `${process.env.API_INDEXER}/elastic/index/${index}/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...input,
            n_facets: 20,
            page: input.cursor || 1,
          }),
        }
      ).then((r) => r.json());

      return res as FacetedQueryOutput;
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
  });
