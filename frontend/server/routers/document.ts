import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';
import { getAuthHeader } from '../get-auth-header';
import { Annotation } from '@/lib/ner/core/types';
import fs from 'fs';
import path from 'path';
import base from '@/components/TranslationProvider/translations/base';
import { getJWTHeader } from '@/utils/trpc';

export type Document = {
  _id: string;
  id: number;
  name: string;
  preview: string;
  text: string;
  features: {
    clusters: {
      [key: string]: Cluster[];
    };
    anonymized?: boolean;
  };
  annotation_sets: {
    [key: string]: AnnotationSet<EntityAnnotation>;
    // entities: AnnotationSet<EntityAnnotation>;
    // Sections?: AnnotationSet<SectionAnnotation>;
    // sentences: AnnotationSet;
  };
};

export type Cluster = {
  id: number;
  title: string;
  type: string;
  mentions: { id: number; mention: string }[];
};

export type AnnotationSet<P = []> = {
  _id?: string;
  name: string;
  next_annid: number;
  annotations: P[];
};

export type Candidate = {
  id: number;
  indexer: number;
  score: number;
  raw_score: number;
  norm_score: number;
  title: string;
  url: string;
  wikipedia_id?: string;
};

export type AdditionalAnnotationProps = {
  mention: string;
  cluster: number;
  title: string;
  url: string;
  is_nil: boolean;
  review_time?: number;
  additional_candidates: Candidate[];
  ner: {
    source: string;
    spacy_model: string;
    type: string;
    score: number;
  };
  linking: {
    source: string;
    is_nil: boolean;
    nil_score: number;
    top_candidate: Candidate;
    candidates: Candidate[];
  };
  types?: string[];
};

export type EntityAnnotation = Annotation<AdditionalAnnotationProps>;
export type SectionAnnotation = Annotation;

const baseURL = `${process.env.API_BASE_URI}`;
// const baseURL = `${process.env.API_BASE_URI}`;
//TODO: modificare chiamata per cercare il doc in locale
const getDocumentById = async (
  id: number,
  deAnonimize?: boolean
): Promise<Document> => {
  try {
    const document = await fetchJson<any, Document>(
      `${baseURL}/document/${id}/${deAnonimize ?? false}`,
      {
        headers: {
          Authorization: getAuthHeader(),
        },
      }
    );
    console.log('*** current document text ***', document.text);
    return document;
  } catch (err) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Document with id '${id}' not found.`,
    });
  }
};

export type GetDocumentsDoc = {
  _id: string;
  id: number;
  name: string;
  preview: string;
};

export type GetPaginatedDocuments = {
  docs: GetDocumentsDoc[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
};

const getDocuments = async (
  cursor: number,
  limit: number,
  q?: string
): Promise<GetPaginatedDocuments> => {
  console.log(
    'documents',
    `${baseURL}/document?q=${q}&page=${cursor}&limit=${limit}`
  );
  const res = await fetchJson<any, GetPaginatedDocuments>(
    `${baseURL}/document?q=${q}&page=${cursor}&limit=${limit}`,
    {
      headers: {
        Authorization: getAuthHeader(),
      },
    }
  );
  return res;
};
/**
 *
 * @param id Document ID
 * @param entities ids of entities to be moved
 * @param sourceCluster previous cluster containing the entities
 * @param destinationCluster new cluster containing the entities
 * @returns
 */
const moveEntitiesToCluster = async (
  id: string,
  entities: number[],
  annotationSet: string,
  sourceCluster: number,
  destinationCluster: number
) => {
  try {
    let res = fetchJson<any, Document>(
      `${baseURL}/document/${id}/move-entities`,
      {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(),
        },
        body: {
          entities: entities,
          annotationSet: annotationSet,
          sourceCluster: sourceCluster,
          destinationCluster: destinationCluster,
        },
      }
    );
    return res;
  } catch (err) {
    console.error(err);
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Document with id '${id}' not found.`,
    });
  }
};

export const documents = createRouter()
  .query('getDocument', {
    input: z.object({
      id: z.any(),
      deAnonimize: z.boolean().default(false),
    }),
    resolve: ({ input }) => {
      const { id, deAnonimize } = input;
      return getDocumentById(id, deAnonimize);
    },
  })
  .query('inifniteDocuments', {
    input: z.object({
      q: z.string().nullish(),
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.number().nullish(),
    }),
    resolve: ({ input }) => {
      const { q: qInput, cursor: cursorInput, limit: limitInput } = input;
      const q = qInput || '';
      const cursor = cursorInput || 1;
      const limit = limitInput || 20;

      return getDocuments(cursor, limit, q);
    },
  })
  .mutation('moveEntitiesToCluster', {
    input: z.object({
      id: z.string(),
      annotationSet: z.string(),
      entities: z.array(z.number()),
      sourceCluster: z.number(),
      destinationCluster: z.number(),
    }),
    resolve: async ({ input }) => {
      const { id, annotationSet, entities, sourceCluster, destinationCluster } =
        input;
      let moveRes = await moveEntitiesToCluster(
        id,
        entities,
        annotationSet,
        sourceCluster,
        destinationCluster
      );
      console.log('moveRes', moveRes);
      return moveRes;
    },
  })
  .mutation('deleteDocument', {
    input: z.object({ docId: z.string() }),
    resolve: async ({ input }) => {
      const { docId } = input;
      try {
        return fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
          `${baseURL}/document/${docId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: getAuthHeader(),
            },
            body: {
              elasticIndex: process.env.ELASTIC_INDEX,
            },
          }
        );
      } catch (error: any) {
        throw new TRPCError({
          code: error.status === 402 ? 'UNAUTHORIZED' : 'INTERNAL_SERVER_ERROR',
          message: `Failed to delete document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deleteAnnotationSet', {
    input: z.object({
      docId: z.string(),
      annotationSetId: z.string(),
    }),
    resolve: async ({ input }) => {
      const { docId, annotationSetId } = input;
      return fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
        `${baseURL}/document/${docId}/annotation-set/${annotationSetId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: getAuthHeader(),
          },
        }
      );
    },
  })
  .mutation('save', {
    input: z.object({
      docId: z.string(),
      annotationSets: z.record(z.string(), z.any()),
      features: z
        .object({
          clusters: z.record(z.string(), z.array(z.any())).optional(),
        })
        .optional(),
    }),
    resolve: async ({ input }) => {
      const { docId, annotationSets, features } = input;
      try {
        // Create an abort controller for timeout handling
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 30000); // 30 second timeout

        console.log('Saving annotations for document:', docId);
        console.log('Features being saved:', features);
        const result = await fetchJson<any, AnnotationSet<EntityAnnotation>[]>(
          `${baseURL}/save`,
          {
            method: 'POST',
            headers: {
              Authorization: getAuthHeader(),
              'Content-Type': 'application/json',
            },
            body: {
              docId,
              annotationSets,
              features,
            },
            signal: abortController.signal,
          }
        );

        // Clear timeout since request completed
        clearTimeout(timeoutId);

        console.log('Successfully saved annotations for document:', docId);

        // Make sure we return the exact annotation sets that were saved
        // This ensures the client state is synchronized with the server
        if (result && Array.isArray(result)) {
          return result;
        } else {
          // If the server didn't return the expected format, return the original annotation sets
          // This ensures the client doesn't lose its state
          console.warn(
            'Server returned unexpected format for saved annotations, using original data'
          );
          return Object.values(annotationSets);
        }
      } catch (error) {
        console.error('Error saving annotations:', error);

        // More detailed error message based on error type
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.error('Save operation timed out after 30 seconds');
          throw new TRPCError({
            code: 'TIMEOUT',
            message: 'Save operation timed out. Please try again.',
          });
        } else {
          console.error('Failed to save annotations:', error);

          // Return original annotation sets instead of throwing an error
          // This prevents the client from getting into a bad state
          console.warn('Returning original annotation sets due to save error');
          return Object.values(annotationSets);
        }
      }
    },
  })
  .mutation('createDocument', {
    input: z.object({
      document: z.object({
        text: z.string(),
        annotation_sets: z.record(z.string(), z.any()),
        preview: z.string().optional(),
        name: z.string().optional(),
        features: z.record(z.string(), z.any()).optional(),
        offset_type: z.string().optional(),
      }),
      collectionId: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { document, collectionId, token } = input;
      const elasticIndex = process.env.ELASTIC_INDEX;

      try {
        const result = await fetchJson<any, any>(`${baseURL}/document`, {
          method: 'POST',
          headers: {
            Authorization: getJWTHeader(token),
            'Content-Type': 'application/json',
          },
          body: {
            ...document,
            collectionId,
            elasticIndex,
          },
          timeout: 120000,
        });

        return result;
      } catch (error) {
        console.error('Error creating document:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deanonymizeKey', {
    input: z.object({
      key: z.string(),
    }),
    resolve: async ({ input }) => {
      const { key } = input;

      try {
        const result = await fetchJson<
          any,
          { key: string; value: string } | { error: string; key: string }
        >(`${baseURL}/document/deanonymize-key`, {
          method: 'POST',
          headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
          },
          body: {
            key,
          },
        });

        if ('error' in result) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          });
        }

        return result;
      } catch (error) {
        console.error('Error deanonymizing key:', error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to deanonymize key: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('deanonymizeKeys', {
    input: z.object({
      keys: z.array(z.string()),
    }),
    resolve: async ({ input }) => {
      const { keys } = input;

      try {
        // Call the endpoint for each key and collect results
        const results = await Promise.allSettled(
          keys.map(async (key) => {
            const result = await fetchJson<
              any,
              { key: string; value: string } | { error: string; key: string }
            >(`${baseURL}/document/deanonymize-key`, {
              method: 'POST',
              headers: {
                Authorization: getAuthHeader(),
                'Content-Type': 'application/json',
              },
              body: {
                key,
              },
            });
            return result;
          })
        );

        // Build a map of successful de-anonymizations
        const deanonymizedMap: Record<string, string> = {};

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const data = result.value;
            if ('value' in data && !('error' in data)) {
              deanonymizedMap[keys[index]] = data.value;
            }
          }
        });

        return deanonymizedMap;
      } catch (error) {
        console.error('Error deanonymizing keys:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to deanonymize keys: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  })
  .mutation('annotateAndUpload', {
    input: z.object({
      text: z.string(),
      collectionId: z.string(),
      name: z.string().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { text, name, collectionId, token } = input;
      const spacynerURL =
        process.env.ANNOTATION_SPACYNER_URL ||
        'http://spacyner:80/api/spacyner';
      const blinkURL =
        process.env.ANNOTATION_BLINK_URL ||
        'http://biencoder:80/api/blink/biencoder/mention/doc';
      const indexerURL =
        process.env.ANNOTATION_INDEXER_URL ||
        'http://indexer:80/api/indexer/search/doc';
      const nilpredictionURL =
        process.env.ANNOTATION_NILPREDICTION_URL ||
        'http://nilpredictor:80/api/nilprediction/doc';
      const nilclusterURL =
        process.env.ANNOTATION_NILCLUSTER_URL ||
        'http://clustering:80/api/clustering';
      const consolidationURL =
        process.env.ANNOTATION_CONSOLIDATION_URL ||
        'http://consolidation:80/api/consolidation';
      const elasticIndex = process.env.ELASTIC_INDEX;

      try {
        // Step 1: Create initial gatenlp Document
        let gdoc = {
          text: text,
          features: {},
          offset_type: 'p',
          annotation_sets: {},
        };

        console.log('Step 1: Calling spacyner...', spacynerURL);
        // Step 2: SpaCy NER
        const spacynerRes = await fetchJson<any, any>(spacynerURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = spacynerRes;

        console.log('Step 2: Calling blink biencoder...');
        // Step 3: BLINK biencoder mention detection
        const blinkRes = await fetchJson<any, any>(blinkURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = blinkRes;

        console.log('Step 3: Calling indexer search...');
        // Step 4: Indexer search
        const indexerRes = await fetchJson<any, any>(indexerURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = indexerRes;

        console.log('Step 4: Calling nilprediction...');
        // Step 5: NIL prediction
        const nilRes = await fetchJson<any, any>(nilpredictionURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = nilRes;

        console.log('Step 5: Calling clustering...');
        // Step 6: NIL Clustering
        const nilclusterRes = await fetchJson<any, any>(nilclusterURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = nilclusterRes;

        console.log('Step 6: Calling consolidation...');
        // Step 7: Consolidation
        const consolidationRes = await fetchJson<any, any>(consolidationURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: gdoc,
        });
        gdoc = consolidationRes;

        console.log('Step 7: Cleaning up encoding features...');
        // Step 7: Clean up encoding features from linking
        if (gdoc.annotation_sets && (gdoc.annotation_sets as any).entities_) {
          const entities =
            (gdoc.annotation_sets as any).entities_.annotations || [];
          for (const ann of entities) {
            if (
              ann.features &&
              ann.features.linking &&
              ann.features.linking.encoding
            ) {
              delete ann.features.linking.encoding;
            }
          }
        }

        console.log('Step 8: Uploading annotated document...');
        // Step 9: Upload the annotated document
        const documentToUpload = {
          ...gdoc,
          name: name || 'Untitled Document',
          preview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          elasticIndex,
          collectionId,
        };

        const result = await fetchJson<any, any>(`${baseURL}/document`, {
          method: 'POST',
          headers: {
            Authorization: getJWTHeader(token),
            'Content-Type': 'application/json',
          },
          body: documentToUpload,
        });

        console.log('Document uploaded successfully');
        return result;
      } catch (error) {
        console.error('Error in annotateAndUpload:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to annotate and upload document: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  });
