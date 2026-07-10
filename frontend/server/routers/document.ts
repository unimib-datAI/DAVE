import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import fetchJson from '@/lib/fetchJson';
import { Annotation } from '@/lib/ner/core/types';
import fs from 'fs';
import path from 'path';
import base from '@/components/TranslationProvider/translations/base';
import { indexDocument } from '@/lib/documentIndexer';
import { ServiceModel, serviceDTO } from '@/lib/db/models/Service';
import { ConfigurationModel, configurationDTO } from '@/lib/db/models/Configuration';
import { DocumentController } from '@/lib/documentsBackend/documentController';
import { dbConnect } from '@/lib/db/connection';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requirePermission, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { DocumentModel } from '@/lib/db/models/Document';
import { AnnotationSetModel } from '@/lib/db/models/AnnotationSet';
import { AnnotationModel } from '@/lib/db/models/Annotation';
import { CollectionController } from '@/lib/documentsBackend/collectionController';
import { deleteElasticDocument, addAnnotationsToDocumentEs } from '@/lib/elasticAdmin';
import {
  encode,
  makeDecryptionRequest,
  makeBatchDecryptionRequest,
} from '@/lib/documentsBackend/anonymization';
import { UploadJobController } from '@/lib/documentsBackend/uploadJobController';

export type Document = {
  _id: string;
  id: number;
  name: string;
  preview: string;
  text: string;
  collectionId: string;
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

/**
 * Indexes a just-created document into Elasticsearch (chunking + embedding +
 * write - see lib/documentIndexer.ts). This used to be a side effect of the
 * `documents` backend's own POST /document route (which called qavectorizer
 * directly); it's now driven from here so qavectorizer only needs to serve
 * embeddings.
 *
 * `doc` is the record returned by `documents` backend's create endpoint -
 * its `text` field already reflects anonymization, matching what the old
 * qavectorizer payload used. The de-anonymized text is fetched separately
 * via the existing deanonymized-read endpoint rather than reimplemented
 * here, since that's an existing, already-relied-upon capability.
 */
async function indexCreatedDocument(doc: any, token: string) {
  const elasticIndex = process.env.ELASTIC_INDEX;
  if (!elasticIndex || !doc?.id) return;

  let textDeanonymized: string | undefined;
  try {
    const deanonymized = await DocumentController.getFullDocById(
      String(doc.id),
      true,
      false,
      true,
      true
    );
    textDeanonymized = deanonymized?.text;
  } catch (error) {
    console.warn(
      'Failed to fetch de-anonymized text, indexing with original text',
      error
    );
  }

  await indexDocument(elasticIndex, {
    id: String(doc.id),
    text: doc.text,
    collectionId: doc.collectionId,
    annotationSets: doc.annotation_sets,
    preview: doc.preview,
    name: doc.name,
    features: doc.features,
    offsetType: doc.offset_type,
    textDeanonymized,
  });
}

/**
 * Faithful port of the old `documents` backend's `POST /document` route:
 * optionally anonymizes the payload, inserts the document (plus its
 * annotation sets/annotations), then recomputes the collection's facets
 * cache from the freshly-inserted document's `entities_` annotation set.
 * Shared by `runCreateDocument` and `runAnnotateAndUpload` - both used to
 * call this same Express route over HTTP.
 */
async function insertDocumentAndUpdateFacetsCache(
  rawBody: Record<string, any>,
  token: string
) {
  const user = await getRequestUser(token);
  await requirePermission(user, 'collections', 'update');

  const { toAnonymize, anonymizeTypes, collectionId } = rawBody;
  const body = toAnonymize ? await encode(rawBody, anonymizeTypes) : rawBody;

  const doc = await DocumentController.insertFullDocument(body);

  const fullDocument = await DocumentController.getFullDocById(
    String(doc.id),
    true,
    false,
    false
  );

  // Always update facets cache for the collection when a document is
  // created. This ensures batch uploads update the cache for every document.
  const cachePayload: Record<string, any[]> = {};
  try {
    const entities = fullDocument.annotation_sets?.['entities_']?.annotations;
    if (entities) {
      for (const entity of entities) {
        const mention = fullDocument.text.substring(entity.start, entity.end);
        const annObject: Record<string, any> = {
          mention,
          start: entity['start'],
          end: entity['end'],
          id: entity['id'],
          type: entity['type'],
          doc_id: fullDocument.id,
        };
        const linking = entity.features?.linking;
        if (linking && linking.is_nil === false) {
          annObject['display_name'] = entity.features?.title || mention;
          annObject['is_linked'] = true;
          annObject['id_ER'] = linking?.top_candidate?.url || '';
        } else {
          annObject['display_name'] = entity.originalKey || mention;
          annObject['is_linked'] = false;
          annObject['id_ER'] = `${fullDocument.id}_${mention}`;
        }
        if (entity['type'] in cachePayload) {
          cachePayload[entity['type']].push(annObject);
        } else {
          cachePayload[entity['type']] = [annObject];
        }
      }
    }
  } catch (e) {
    console.error('Error in computing caching facets', e);
  }

  try {
    await CollectionController.updateCache({ toAdd: cachePayload }, collectionId);
  } catch (e) {
    console.error('Error updating facets cache for collection', collectionId, e);
  }

  return doc;
}

/**
 * Uploads a single pre-annotated JSON document. Extracted from the
 * `createDocument` mutation so it can also be called from the background
 * upload-job processing loop (see `createUploadJob` below).
 */
export async function runCreateDocument(input: {
  document: {
    text: string;
    annotation_sets: Record<string, any>;
    preview?: string;
    name?: string;
    features?: Record<string, any>;
    offset_type?: string;
  };
  collectionId: string;
  token?: string;
  toAnonymize: boolean;
  anonymizeTypes?: string[];
}) {
  const { document, collectionId, token, toAnonymize, anonymizeTypes } = input;
  const tokenForApi = token ?? '';

  try {
    const result = await insertDocumentAndUpdateFacetsCache(
      { ...document, collectionId, toAnonymize, anonymizeTypes },
      tokenForApi
    );

    await indexCreatedDocument(result, tokenForApi);

    return result;
  } catch (error) {
    console.error('Error creating document:', error);
    if (error instanceof PermissionDeniedError) {
      throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to create document: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

/**
 * Runs the full annotation pipeline (NER/NEL/indexer/etc, as configured) over
 * raw text and uploads the resulting document. Extracted from the
 * `annotateAndUpload` mutation so it can also be called from the background
 * upload-job processing loop (see `createUploadJob` below).
 */
export async function runAnnotateAndUpload(input: {
  text: string;
  collectionId: string;
  name?: string;
  token?: string;
  configurationId?: string;
  toAnonymize: boolean;
  anonymizeTypes?: string[];
}) {
  const {
    text,
    name,
    collectionId,
    token,
    configurationId,
    toAnonymize,
    anonymizeTypes,
  } = input;

  const tokenForApi = token ?? '';

  // Fetch configuration from database - either specified or active
  let selectedServices: Record<string, any> | undefined;
  try {
    let configToUse: any;
    const user = await getRequestUser(tokenForApi);
    await dbConnect();

    if (configurationId) {
      const allConfigs = await ConfigurationModel.find({ userId: user.sub }).lean();
      configToUse = allConfigs.find((c: any) => String(c._id) === configurationId);
    } else {
      configToUse = await ConfigurationModel.findOne({
        userId: user.sub,
        isActive: true,
      }).lean();
    }

    if (configToUse) {
      // New format: steps array takes priority over legacy services map
      if (
        Array.isArray(configToUse.steps) &&
        configToUse.steps.length > 0
      ) {
        selectedServices = configToUse.steps;
      } else if (configToUse.services) {
        // Legacy: convert MongoDB Map to plain object
        if (configToUse.services instanceof Map) {
          const legacyObj: Record<string, any> = {};
          configToUse.services.forEach((value: any, key: string) => {
            legacyObj[key] = value;
          });
          selectedServices = legacyObj;
        } else {
          selectedServices = configToUse.services;
        }
      }
    }
  } catch (error: any) {
    console.log('No active configuration found, using defaults');
    selectedServices = undefined;
  }

  // Resolve the ordered list of pipeline steps to execute.
  // New format: configToUse.steps  (array of { name, uri, serviceType? })
  // Legacy fallback: configToUse.services  (slot-name -> service map)
  let pipelineSteps: Array<{
    name: string;
    uri: string;
    serviceType?: string;
  }> = [];

  if (selectedServices) {
    const raw = selectedServices as any;
    if (Array.isArray(raw)) {
      // New format: already an array of steps
      pipelineSteps = (raw as any[]).filter(
        (s: any) => s && typeof s.uri === 'string' && s.uri.trim()
      );
    } else if (typeof raw === 'object') {
      // Legacy slot-map format: convert to ordered steps using canonical slot order
      const LEGACY_SLOTS = [
        'NER',
        'NEL',
        'INDEXER',
        'NILPREDICTION',
        'CLUSTERING',
        'CONSOLIDATION',
      ];
      const defaultUriForSlot: Record<string, string> = {
        NER:
          process.env.ANNOTATION_SPACYNER_URL ||
          'http://spacyner:80/api/spacyner',
        NEL:
          process.env.ANNOTATION_BLINK_URL ||
          'http://biencoder:80/api/blink/biencoder/mention/doc',
        INDEXER:
          process.env.ANNOTATION_INDEXER_URL ||
          'http://indexer:80/api/indexer/search/doc',
        NILPREDICTION:
          process.env.ANNOTATION_NILPREDICTION_URL ||
          'http://nilpredictor:80/api/nilprediction/doc',
        CLUSTERING:
          process.env.ANNOTATION_NILCLUSTER_URL ||
          'http://clustering:80/api/clustering',
        CONSOLIDATION:
          process.env.ANNOTATION_CONSOLIDATION_URL ||
          'http://consolidation:80/api/consolidation',
      };
      for (const slot of LEGACY_SLOTS) {
        const entry = raw[slot];
        if (!entry) continue;
        const uri = (entry.uri || '').trim() || defaultUriForSlot[slot];
        if (uri) {
          pipelineSteps.push({
            name: entry.name || slot,
            uri,
            serviceType: slot,
          });
        }
      }
    }
  }

  // If no steps configured, fall through to upload without annotation
  console.log(
    `Pipeline has ${pipelineSteps.length} steps:`,
    pipelineSteps.map((s) => `${s.name} -> ${s.uri}`)
  );

  try {
    // Create initial gatenlp Document
    let gdoc: any = {
      text: text,
      features: {},
      offset_type: 'p',
      annotation_sets: {},
    };

    // Execute each pipeline step sequentially
    for (let i = 0; i < pipelineSteps.length; i++) {
      const step = pipelineSteps[i];
      console.log(
        `Pipeline step ${i + 1}/${pipelineSteps.length}: ${step.name} -> ${
          step.uri
        }`
      );
      gdoc = await fetchJson<any, any>(step.uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: gdoc,
        timeout: 300000, // 5 minutes per step
      });
    }

    // Clean up encoding features from linking (artifact of some pipeline steps)
    if (gdoc.annotation_sets && gdoc.annotation_sets.entities_) {
      const entities = gdoc.annotation_sets.entities_.annotations || [];
      for (const ann of entities) {
        if (ann.features?.linking?.encoding) {
          delete ann.features.linking.encoding;
        }
      }
    }

    console.log('Uploading annotated document...');
    // Upload the annotated document
    const documentToUpload = {
      ...gdoc,
      name: name || 'Untitled Document',
      preview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      collectionId,
    };

    const result = await insertDocumentAndUpdateFacetsCache(
      { ...documentToUpload, toAnonymize, anonymizeTypes },
      tokenForApi
    );

    await indexCreatedDocument(result, tokenForApi);

    console.log('Document uploaded successfully');
    return result;
  } catch (error) {
    console.error('Error in annotateAndUpload:', error);
    if (error instanceof PermissionDeniedError) {
      throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to annotate and upload document: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}

/**
 * jobIds requested for cancellation. The upload-job processing loop (see
 * `createUploadJob` below) is a fire-and-forget async task running inside
 * this same Next.js server process — there's no separate worker to signal,
 * so cancellation is a simple in-memory flag the loop checks between files.
 * A cancelled job stops before starting its next file; the file already in
 * flight is allowed to finish since none of the processing helpers support
 * mid-flight abort.
 */
const cancelledUploadJobIds = new Set<string>();

/**
 * Best-effort progress updates sent to the durable UploadJob record in the
 * backend. Failures here are logged but never thrown: a missed progress
 * update should not abort the underlying document processing.
 */
async function patchUploadJobStatus(
  jobId: string,
  token: string,
  body: { status?: string; error?: string }
) {
  try {
    if (body.error) {
      await UploadJobController.setError(jobId, body.error);
    } else if (body.status) {
      await UploadJobController.updateStatus(jobId, body.status);
    }
  } catch (error) {
    console.error('Failed to patch upload job status', jobId, error);
  }
}

async function patchUploadJobFile(
  jobId: string,
  fileId: string,
  token: string,
  body: {
    status?: string;
    progress?: number;
    error?: string;
    documentId?: string;
  }
) {
  try {
    await UploadJobController.updateFile(jobId, fileId, body);
  } catch (error) {
    console.error('Failed to patch upload job file', jobId, fileId, error);
  }
}

//TODO: modificare chiamata per cercare il doc in locale
const getDocumentById = async (
  id: number,
  deAnonimize?: boolean,
  collectionId?: string
): Promise<Document> => {
  try {
    const document = await DocumentController.getFullDocById(
      String(id),
      true,
      false,
      deAnonimize ?? false,
      true, // lightFeatures: only return fields needed by the frontend
      collectionId
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
  return DocumentController.findAll(q, limit, cursor);
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
  destinationCluster: number,
  token?: string
) => {
  const user = await getRequestUser(token);
  await requirePermission(user, 'document', 'update');

  const document: any = await DocumentController.getFullDocById(id, false, false, false, true);

  // find and remove source and destination clusters
  const source = document.features.clusters[annotationSet].find(
    (cluster: any) => cluster.id === sourceCluster
  );
  document.features.clusters[annotationSet] = document.features.clusters[annotationSet].filter(
    (cluster: any) => cluster.id !== sourceCluster
  );
  const dest = document.features.clusters[annotationSet].find(
    (cluster: any) => cluster.id === destinationCluster
  );
  document.features.clusters[annotationSet] = document.features.clusters[annotationSet].filter(
    (cluster: any) => cluster.id !== destinationCluster
  );
  // move entities
  const entObjects = source.mentions.filter((mention: any) => entities.includes(mention.id));
  source.mentions = source.mentions.filter((mention: any) => !entities.includes(mention.id));
  dest.mentions = dest.mentions.concat(entObjects);
  const clusters = [...document.features.clusters[annotationSet], source, dest];

  await DocumentController.updateClusters(id, annotationSet, clusters);

  return DocumentController.getFullDocById(id, false, false, false, true);
};

// Ported from save.js's anonymizeMention() helper
const anonymizeMentionForEs = (mention: string) => {
  if (!mention) return '';
  return mention
    .split(' ')
    .map((word) => (word.length > 0 ? word[0] + '*'.repeat(word.length - 1) : ''))
    .join(' ');
};

/**
 * Ported from the documents backend's POST /save route: saves annotation
 * sets (+ optional features), diffs old vs. new annotations to keep the
 * collection's facets cache in sync, and - if an elasticIndex is given -
 * pushes the updated entity mentions into Elasticsearch.
 */
async function runSave({
  docId,
  annotationSets,
  features,
  collectionId,
  elasticIndex,
  token,
}: {
  docId: string;
  annotationSets: Record<string, any>;
  features?: { clusters?: Record<string, any[]> };
  collectionId: string;
  elasticIndex?: string;
  token: string;
}) {
  const user = await getRequestUser(token);
  await requirePermission(user, 'document', 'update');

  // Fetch existing document/annotations (best-effort) before we overwrite them.
  // Scoped by collectionId since `docId` (a content hash) is not guaranteed
  // unique across collections - the same source file uploaded into two
  // collections produces two Document records sharing the same id.
  let existingDoc: any = null;
  try {
    existingDoc = await DocumentController.findOne(docId, null, collectionId);
  } catch (e) {
    existingDoc = null;
  }

  // Update annotation sets in MongoDB
  const resUpdate = await DocumentController.updateEntitiesAnnotationSet(docId, annotationSets);

  // Update facets cache entries for the collection based on saved annotations
  try {
    const fullDoc: any = await DocumentController.findOne(docId, null, collectionId);
    if (collectionId) {
      const toAdd: Record<string, any[]> = {};
      const toDelete: Record<string, any[]> = {};

      const buildEntry = (ann: any, docIdForEntry: string) => {
        const mention = ann.features?.mention || '';
        const display_name = ann.features?.title || ann.originalKey || mention;
        const linking = ann.features?.linking;
        const is_linked = !!(linking && linking.is_nil === false);
        const id_ER = is_linked
          ? linking?.top_candidate?.url || ''
          : `${docIdForEntry}_${mention}`;
        return {
          start: ann.start,
          end: ann.end,
          id: ann.id,
          type: ann.type,
          doc_id: docIdForEntry,
          display_name,
          is_linked,
          id_ER,
        };
      };

      // Build old map
      const oldMaps: Record<string, Map<string, any>> = {};
      if (existingDoc && existingDoc.annotation_sets) {
        for (const oldSet of existingDoc.annotation_sets) {
          for (const ann of oldSet.annotations || []) {
            const entry = buildEntry(ann, existingDoc.id);
            const facetType = entry.type || 'unknown';
            oldMaps[facetType] = oldMaps[facetType] || new Map();
            const key = `${entry.id_ER}||${String(entry.display_name || '').toLowerCase()}`;
            oldMaps[facetType].set(key, entry);
          }
        }
      }

      // Build new map and toAdd (deduplicating by key)
      const newMaps: Record<string, Map<string, any>> = {};
      for (const annSet of resUpdate || []) {
        for (const ann of (annSet as any).annotations || []) {
          const entry = buildEntry(ann, fullDoc.id);
          const facetType = entry.type || 'unknown';
          newMaps[facetType] = newMaps[facetType] || new Map();
          const key = `${entry.id_ER}||${String(entry.display_name || '').toLowerCase()}`;
          if (!newMaps[facetType].has(key)) {
            newMaps[facetType].set(key, entry);
            toAdd[facetType] = toAdd[facetType] || [];
            toAdd[facetType].push({
              id_ER: entry.id_ER,
              doc_id: entry.doc_id,
              display_name: entry.display_name,
              is_linked: entry.is_linked,
              metadata: {},
            });
          }
        }
      }

      // Compute toDelete: items in oldMaps not present in newMaps
      for (const [facetType, map] of Object.entries(oldMaps)) {
        for (const [key, oldEntry] of Array.from(map.entries())) {
          const existsInNew = newMaps[facetType]?.has(key);
          if (!existsInNew) {
            toDelete[facetType] = toDelete[facetType] || [];
            toDelete[facetType].push({
              id_ER: oldEntry.id_ER,
              doc_id: oldEntry.doc_id,
              displayName: oldEntry.display_name,
            });
          }
        }
      }

      const cachePayload: Record<string, any> = {};
      if (Object.keys(toAdd).length) cachePayload.toAdd = toAdd;
      if (Object.keys(toDelete).length) cachePayload.toDelete = toDelete;

      if (Object.keys(cachePayload).length > 0) {
        try {
          await CollectionController.updateCache(cachePayload, collectionId);
        } catch (e) {
          console.error('Failed to update facets cache for collection', collectionId, e);
        }
      }
    }
  } catch (e) {
    console.error('Error computing/updating facets cache after save:', e);
  }

  // Update features if provided
  let featuresUpdateResult: any = null;
  if (features !== undefined) {
    featuresUpdateResult = await DocumentController.updateDocumentFeatures(docId, features);
  }

  // Update Elasticsearch index if elasticIndex is provided
  if (elasticIndex) {
    try {
      // Get the updated document with clusters from features
      // Use the features that were just saved, or fetch from DB if not provided
      let clustersToUse = features?.clusters;

      if (!clustersToUse) {
        const doc: any = await DocumentController.findOne(docId, null, collectionId);
        clustersToUse = doc.features?.clusters;
      } else {
        console.log('Using clusters from provided features');
      }

      if (clustersToUse) {
        // Find the entities annotation set name - use "entities_"
        const entitiesAnnotationSetName = Object.keys(annotationSets).find(
          (name) => name === 'entities_'
        );

        if (entitiesAnnotationSetName && (clustersToUse as any)[entitiesAnnotationSetName]) {
          const clusters = (clustersToUse as any)[entitiesAnnotationSetName];

          // Get the annotations from the annotation set
          const annotations = annotationSets[entitiesAnnotationSetName]?.annotations || [];

          // Transform individual annotations to Elasticsearch format. `id_ER`
          // must use the same scheme as the facets cache (buildEntry() above
          // and every bulk-imported document already in Elasticsearch):
          // the cluster's real URL when linked, otherwise a
          // `${docId}_${mention}` synthetic id - NOT the local cluster id
          // number. Facet clicks filter search results by id_ER, so using a
          // different scheme here silently made saved/edited annotations
          // unfindable via their own facet even though the facet itself
          // displayed correctly (the facet-cache write and this ES write are
          // separate code paths that must agree on id_ER).
          const mentions = annotations
            .map((annotation: any) => {
              const clusterId = annotation.features?.cluster;
              if (!clusterId) return null;

              const cluster = clusters.find((c: any) => c.id === clusterId);
              const type = annotation.type || 'unknown';
              const mention = annotation.features?.mention || '';
              const shouldAnonymize = ['persona', 'parte', 'controparte'].includes(type);
              const isLinked = cluster ? Boolean(cluster.url) : false;
              const id_ER = isLinked ? cluster.url : `${docId}_${mention}`;
              return {
                id: annotation.id,
                id_ER,
                start: annotation.start || 0,
                end: annotation.end || 0,
                type,
                mention,
                is_linked: isLinked,
                display_name: cluster?.title
                  ? shouldAnonymize
                    ? anonymizeMentionForEs(cluster.title)
                    : cluster.title
                  : shouldAnonymize
                    ? anonymizeMentionForEs(mention)
                    : mention,
              };
            })
            .filter((m: any) => m !== null);

          // Update Elasticsearch directly (in-process, no HTTP hop needed)
          await addAnnotationsToDocumentEs(elasticIndex, String(docId), mentions, collectionId);
        } else {
          console.log('No entities annotation set found or no clusters in that set');
        }
      } else {
        console.log('No clusters found in features');
      }
    } catch (error: any) {
      console.error('Error updating Elasticsearch annotations:', error.message);
      // Don't fail the entire request if Elasticsearch update fails
    }
  }

  return {
    annotationSets: resUpdate,
    features: featuresUpdateResult ? featuresUpdateResult.features : undefined,
    success: true,
  };
}

/**
 * Ported from the documents backend's POST /document/by-ids route: fetches
 * each doc via getFullDocById and flattens its annotation sets into a single
 * annotations array, enriching each with display_name/is_linked/id_ER.
 */
async function fetchDocumentsByIdsEnriched(ids: string[], deAnonimize: boolean) {
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const doc: any = await DocumentController.getFullDocById(
        id,
        true,
        false,
        deAnonimize === true,
        true // lightFeatures: only return fields needed by the frontend
      );

      // Collect annotations from all annotation sets and ensure id_ER/display_name are present
      const annotations: any[] = [];
      if (doc && doc.annotation_sets) {
        Object.values(doc.annotation_sets).forEach((set: any) => {
          if (Array.isArray(set.annotations)) {
            set.annotations.forEach((entity: any) => {
              const ann = { ...entity };
              try {
                const mention = (doc.text || '').substring(entity.start, entity.end);
                const linking = entity.features?.linking;
                if (linking && linking.is_nil === false) {
                  ann.display_name = entity.features?.title || mention;
                  ann.is_linked = true;
                  ann.id_ER = linking?.top_candidate?.url || '';
                } else {
                  ann.display_name = mention;
                  ann.is_linked = false;
                  ann.id_ER = `${doc.id}_${mention}`;
                }
              } catch (e) {
                // fallback: leave ann as-is
              }
              annotations.push(ann);
            });
          }
        });
      }

      return {
        _id: doc._id || String(doc.id),
        id: doc.id,
        // always provide a canonical mongo_id so frontend can dedupe reliably
        mongo_id: doc._id || String(doc.id),
        text: doc.preview || doc.text || '',
        name: doc.name || '',
        annotations,
      };
    })
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r: any) => r.value);
}

export const documents = createRouter()
  .query('getDocument', {
    input: z.object({
      id: z.any(),
      deAnonimize: z.boolean().default(false),
      // Disambiguates between duplicate documents that share the same
      // content-hash id across different collections - pass the collection
      // the document is being opened from whenever it's known.
      collectionId: z.string().optional(),
    }),
    resolve: ({ input }) => {
      const { id, deAnonimize, collectionId } = input;
      return getDocumentById(id, deAnonimize, collectionId);
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
  // Services CRUD - ported from documents backend's Service model + routes
  .query('getServices', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async () => {
      try {
        await dbConnect();
        return await ServiceModel.find({}).lean();
      } catch (error: any) {
        console.error('Failed to fetch services', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch services',
        });
      }
    },
  })
  .mutation('createService', {
    input: z.object({
      name: z.string(),
      uri: z.string(),
      serviceType: z.string(),
      description: z.string().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, ...body } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();
        const svc = serviceDTO(body);
        return await svc.save();
      } catch (error: any) {
        console.error('Failed to create service', error);
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        // Mongo duplicate-key error (Service.name is unique)
        if (error.code === 11000) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Service with this name already exists',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create service',
        });
      }
    },
  })
  .mutation('updateService', {
    input: z.object({
      id: z.string(),
      name: z.string().optional(),
      uri: z.string().optional(),
      serviceType: z.string().optional(),
      description: z.string().optional(),
      disabled: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, id, ...update } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();
        const updated = await ServiceModel.findByIdAndUpdate(id, update, { new: true });
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }
        return updated;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error('Failed to update service', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update service',
        });
      }
    },
  })
  .mutation('deleteService', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();
        const deleted = await ServiceModel.findByIdAndDelete(id);
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Service not found' });
        }
        return { message: 'deleted' };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error('Failed to delete service', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete service',
        });
      }
    },
  })
  // Configuration endpoints
  .query('getConfigurations', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      try {
        const user = await getRequestUser(input.token);
        await dbConnect();
        return await ConfigurationModel.find({ userId: user.sub }).lean();
      } catch (error: any) {
        console.error('Failed to fetch configurations', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch configurations',
        });
      }
    },
  })
  .query('getActiveConfiguration', {
    input: z.object({
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      try {
        const user = await getRequestUser(input.token);
        await dbConnect();
        const activeConfig = await ConfigurationModel.findOne({
          userId: user.sub,
          isActive: true,
        }).lean();
        // If no active configuration, return null instead of throwing
        // (mirrors the old backend's 404-means-null behavior on this query)
        return activeConfig || null;
      } catch (error: any) {
        console.error('Failed to fetch active configuration', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch active configuration',
        });
      }
    },
  })
  .mutation('createConfiguration', {
    input: z.object({
      name: z.string(),
      // steps: ordered array of pipeline steps (new format)
      steps: z.array(z.any()).optional(),
      // services: legacy slot-map kept for backward compat
      services: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, name, steps, services, isActive } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();

        // If this is set as active, deactivate all other configurations for this user
        if (isActive) {
          await ConfigurationModel.updateMany(
            { userId: user.sub, isActive: true },
            { $set: { isActive: false } }
          );
        }

        const config = configurationDTO({
          userId: user.sub,
          name,
          steps,
          services,
          isActive,
        });
        return await config.save();
      } catch (error: any) {
        console.error('Failed to create configuration', error);
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        // Mongo duplicate-key error (userId+name is unique)
        if (error.code === 11000) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Configuration with this name already exists',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to create configuration',
        });
      }
    },
  })
  .mutation('updateConfiguration', {
    input: z.object({
      id: z.string(),
      name: z.string().optional(),
      // steps: ordered array of pipeline steps (new format)
      steps: z.array(z.any()).optional(),
      // services: legacy slot-map kept for backward compat
      services: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { token, id, ...update } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();

        // Verify the configuration belongs to the user
        const existingConfig = await ConfigurationModel.findOne({ _id: id, userId: user.sub });
        if (!existingConfig) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
        }

        // If setting this as active, deactivate all other configurations
        if (update.isActive) {
          await ConfigurationModel.updateMany(
            { userId: user.sub, _id: { $ne: id }, isActive: true },
            { $set: { isActive: false } }
          );
        }

        return await ConfigurationModel.findByIdAndUpdate(id, update, { new: true });
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error('Failed to update configuration', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to update configuration',
        });
      }
    },
  })
  .mutation('deleteConfiguration', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();

        const deleted = await ConfigurationModel.findOneAndDelete({ _id: id, userId: user.sub });
        if (!deleted) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
        }
        return { message: 'deleted' };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error('Failed to delete configuration', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to delete configuration',
        });
      }
    },
  })
  .mutation('activateConfiguration', {
    input: z.object({
      id: z.string(),
      token: z.string(),
    }),
    resolve: async ({ input }) => {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'settings', 'pipeline');
        await dbConnect();

        // Verify the configuration belongs to the user
        const existingConfig = await ConfigurationModel.findOne({ _id: id, userId: user.sub });
        if (!existingConfig) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Configuration not found' });
        }

        // Deactivate all other configurations for this user
        await ConfigurationModel.updateMany(
          { userId: user.sub, _id: { $ne: id } },
          { $set: { isActive: false } }
        );

        // Activate this configuration
        return await ConfigurationModel.findByIdAndUpdate(
          id,
          { $set: { isActive: true } },
          { new: true }
        );
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error('Failed to activate configuration', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to activate configuration',
        });
      }
    },
  })
  .mutation('moveEntitiesToCluster', {
    input: z.object({
      id: z.string(),
      annotationSet: z.string(),
      entities: z.array(z.number()),
      sourceCluster: z.number(),
      destinationCluster: z.number(),
      token: z.string().optional(),
    }),
    resolve: async ({ input }) => {
      const {
        id,
        annotationSet,
        entities,
        sourceCluster,
        destinationCluster,
        token,
      } = input;
      try {
        const moveRes = await moveEntitiesToCluster(
          id,
          entities,
          annotationSet,
          sourceCluster,
          destinationCluster,
          token
        );
        console.log('moveRes', moveRes);
        return moveRes;
      } catch (error: any) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        console.error(error);
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Document with id '${id}' not found.`,
        });
      }
    },
  })
  .mutation('deleteDocument', {
    input: z.object({ docId: z.string() }),
    resolve: async ({ input }) => {
      const { docId } = input;
      try {
        await dbConnect();
        const elasticIndex = process.env.ELASTIC_INDEX;

        const deletedDoc: any = await DocumentModel.findOneAndDelete({ id: docId });
        const annotationSets = await AnnotationSetModel.find({ docId });
        await Promise.all(
          annotationSets.map(async (annSet) => {
            await AnnotationModel.deleteMany({ annotationSetId: annSet._id });
          })
        );
        await AnnotationSetModel.deleteMany({ docId });
        if (deletedDoc?.collectionId && deletedDoc?.id) {
          await CollectionController.deleteCacheForDoc(deletedDoc.id, deletedDoc.collectionId);
        }
        if (elasticIndex) {
          try {
            await deleteElasticDocument(elasticIndex, docId);
          } catch (error: any) {
            console.error(`Error deleting document from Elasticsearch: ${error.message}`);
          }
        }
        return deletedDoc;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
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
      const { annotationSetId } = input;
      await dbConnect();
      const result = await AnnotationSetModel.deleteOne({ _id: annotationSetId } as any);
      await AnnotationModel.deleteMany({ annotationSetId } as any);
      return result;
    },
  })
  .mutation('save', {
    input: z.object({
      collectionId: z.string(),
      docId: z.string(),
      token: z.string(),
      annotationSets: z.record(z.string(), z.any()),
      features: z
        .object({
          clusters: z.record(z.string(), z.array(z.any())).optional(),
        })
        .optional(),
    }),
    resolve: async ({ input }) => {
      const { docId, annotationSets, features, token, collectionId } = input;
      const elasticIndex = process.env.ELASTIC_INDEX;
      try {
        console.log('Saving annotations for document:', docId);
        console.log('Features being saved:', features);

        const result = await runSave({
          docId,
          annotationSets,
          features,
          collectionId,
          elasticIndex,
          token,
        });

        console.log('Successfully saved annotations for document:', docId);

        // runSave() returns { annotationSets, features, success } - the real
        // array of DB-persisted annotation sets (with server-assigned _ids
        // etc.) lives at result.annotationSets. This used to be checked with
        // `Array.isArray(result)`, which is never true (result is always an
        // object), so every save silently discarded the real server result
        // and echoed the client's own submitted data back instead.
        if (result && Array.isArray(result.annotationSets)) {
          return result.annotationSets;
        } else {
          console.warn(
            'runSave returned no annotationSets array, falling back to originally submitted data'
          );
          return Object.values(annotationSets);
        }
      } catch (error: any) {
        console.error('Error saving annotations:', error);

        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }

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
      token: z.string().optional(),
      toAnonymize: z.boolean(),
      anonymizeTypes: z.array(z.string()).optional(),
    }),
    resolve: async ({ input }) => runCreateDocument(input),
  })
  .mutation('deanonymizeKey', {
    input: z.object({
      key: z.string(),
    }),
    resolve: async ({ input }) => {
      const { key } = input;

      try {
        const result = await makeDecryptionRequest(key);

        if (result.error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
          });
        }

        return { key: result.fieldToDecrypt, value: result.decryptedData };
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
        const batchResults = await makeBatchDecryptionRequest(keys);

        const deanonymized: Record<string, string> = {};
        for (const item of batchResults) {
          if (item && item.fieldToDecrypt) {
            deanonymized[item.fieldToDecrypt] = item.decryptedData ?? null;
          }
        }

        return deanonymized;
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
  .query('getDocumentsByIds', {
    input: z.object({
      ids: z.array(z.string()),
      deAnonimize: z.boolean().optional(),
    }),
    resolve: async ({ input }) => {
      const { ids, deAnonimize } = input;
      try {
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            // Fetch full document and transform into a search-like hit
            const doc: any = await DocumentController.getFullDocById(
              id,
              true,
              false,
              deAnonimize ?? false,
              true // lightFeatures: only return fields needed by the frontend
            );

            // Collect annotations from all annotation sets
            const annotations: EntityAnnotation[] = [];
            if (doc && doc.annotation_sets) {
              Object.values(doc.annotation_sets).forEach((set: any) => {
                if (Array.isArray(set.annotations)) {
                  annotations.push(...set.annotations);
                }
              });
            }

            // Map to FacetedQueryHit-like shape used in the frontend
            return {
              _id: doc._id || String(doc.id),
              id: doc.id,
              mongo_id: doc._id,
              text: doc.preview || doc.text || '',
              name: doc.name || '',
              annotations,
            };
          })
        );

        // Return only fulfilled results
        const hits = results
          .filter((r) => r.status === 'fulfilled')
          .map((r: any) => r.value);

        return hits;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch documents by ids',
        });
      }
    },
  })
  .mutation('fetchFacetDocuments', {
    input: z.object({
      ids: z.array(z.string()),
      deAnonimize: z.boolean().optional(),
      token: z.string().optional(),
    }),
    resolve: async ({ input }) => {
      const { ids, deAnonimize, token } = input;
      // If auth is enabled but no token supplied, avoid calling backend and return empty
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return [];
      }
      try {
        const result = await fetchDocumentsByIdsEnriched(ids, deAnonimize ?? false);
        console.log(
          '[trpc.document.fetchFacetDocuments] fetched',
          Array.isArray(result) ? result.length : 'non-array'
        );
        return result || [];
      } catch (error: any) {
        // Log detailed error for debugging (including possible FetchError.data)
        try {
          console.error('[trpc.document.fetchFacetDocuments] error', error);
          if (error && typeof error === 'object') {
            // If fetchJson threw a FetchError with .data, log it
            // @ts-ignore
            if (error.data) {
              // @ts-ignore
              console.error(
                '[trpc.document.fetchFacetDocuments] response data:',
                error.data
              );
            }
            // log stack if available
            if (error.stack) console.error(error.stack);
          }
        } catch (e) {
          console.error('Failed to log fetchFacetDocuments error', e);
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message:
            (error && error.message) ||
            (error && typeof error === 'object' && JSON.stringify(error)) ||
            'Failed to fetch facet documents',
        });
      }
    },
  })
  .mutation('annotateAndUpload', {
    input: z.object({
      text: z.string(),
      collectionId: z.string(),
      name: z.string().optional(),
      token: z.string().optional(),
      configurationId: z.string().optional(),
      toAnonymize: z.boolean(),
      anonymizeTypes: z.array(z.string()).optional(),
    }),
    resolve: async ({ input }) => runAnnotateAndUpload(input),
  })
  .mutation('createUploadJob', {
    input: z.object({
      collectionId: z.string(),
      uploadType: z.enum(['json', 'txt']),
      files: z
        .array(z.object({ fileName: z.string(), content: z.string() }))
        .min(1),
      token: z.string().optional(),
      configurationId: z.string().optional(),
      toAnonymize: z.boolean().optional(),
      anonymizeTypes: z.array(z.string()).optional(),
    }),
    resolve: async ({ input }) => {
      const {
        collectionId,
        uploadType,
        files,
        token,
        configurationId,
        toAnonymize,
        anonymizeTypes,
      } = input;
      const tokenForApi = token ?? '';

      let job: any;
      try {
        const user = await getRequestUser(tokenForApi);
        await requirePermission(user, 'collections', 'update');
        job = await UploadJobController.create({
          userId: user.sub,
          collectionId,
          uploadType,
          fileNames: files.map((f) => f.fileName),
          configuration: {
            configurationId,
            toAnonymize: toAnonymize ?? false,
            anonymizeTypes,
          },
        });
      } catch (error) {
        console.error('Failed to create upload job:', error);
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create upload job: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }

      const jobId: string = job.jobId;
      const fileIdByName = new Map<string, string>(
        (job.files || []).map((f: any) => [f.fileName, f.fileId])
      );

      // Fire-and-forget: this loop keeps running on the Next.js server after
      // this resolver returns. The server process (`next start`) is
      // persistent, so it is fully decoupled from the client connection —
      // closing the browser tab does not stop it. Every state change is
      // persisted to MongoDB via the upload-jobs API so any tab (or a fresh
      // one after a refresh) can pick up the current progress at any time.
      (async () => {
        try {
          // Cancelled before processing even started (e.g. the user clicked
          // cancel while the job was still "pending") - leave the
          // already-set 'cancelled' status alone.
          if (cancelledUploadJobIds.has(jobId)) {
            return;
          }

          await patchUploadJobStatus(jobId, tokenForApi, {
            status: 'processing',
          });

          let anyFailed = false;
          let wasCancelled = false;
          for (const file of files) {
            if (cancelledUploadJobIds.has(jobId)) {
              wasCancelled = true;
              break;
            }

            const fileId = fileIdByName.get(file.fileName);
            if (!fileId) continue;

            await patchUploadJobFile(jobId, fileId, tokenForApi, {
              status: 'processing',
            });

            try {
              let doc: any;
              if (uploadType === 'json') {
                doc = await runCreateDocument({
                  document: JSON.parse(file.content),
                  collectionId,
                  token: tokenForApi,
                  toAnonymize: toAnonymize ?? false,
                  anonymizeTypes,
                });
              } else {
                doc = await runAnnotateAndUpload({
                  text: file.content,
                  collectionId,
                  name: file.fileName.replace(/\.txt$/i, ''),
                  token: tokenForApi,
                  configurationId,
                  toAnonymize: toAnonymize ?? false,
                  anonymizeTypes,
                });
              }

              await patchUploadJobFile(jobId, fileId, tokenForApi, {
                status: 'completed',
                progress: 100,
                documentId: String(doc?.id ?? doc?._id ?? ''),
              });
            } catch (error) {
              anyFailed = true;
              await patchUploadJobFile(jobId, fileId, tokenForApi, {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }

          // If cancelled, the 'cancelled' status was already set by
          // `cancelUploadJob` - don't overwrite it with completed/failed.
          if (!wasCancelled) {
            await patchUploadJobStatus(jobId, tokenForApi, {
              status: anyFailed ? 'completed_with_errors' : 'completed',
            });
          }
        } catch (error) {
          console.error('Upload job processing failed:', jobId, error);
          await patchUploadJobStatus(jobId, tokenForApi, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          cancelledUploadJobIds.delete(jobId);
        }
      })();

      return { jobId };
    },
  })
  .query('getUploadJob', {
    input: z.object({ jobId: z.string(), token: z.string().optional() }),
    resolve: async ({ input }) => {
      const user = await getRequestUser(input.token);
      const job: any = await UploadJobController.getByJobId(input.jobId);
      if (!job) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      }
      if (job.userId !== user.sub) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }
      return job;
    },
  })
  .query('getRecentUploadJobs', {
    input: z.object({
      collectionId: z.string().optional(),
      token: z.string().optional(),
      limit: z.number().optional(),
    }),
    resolve: async ({ input }) => {
      const user = await getRequestUser(input.token);
      return UploadJobController.listRecent({
        userId: user.sub,
        collectionId: input.collectionId,
        limit: input.limit,
      });
    },
  })
  .mutation('dismissUploadJob', {
    input: z.object({ jobId: z.string(), token: z.string().optional() }),
    resolve: async ({ input }) => {
      const user = await getRequestUser(input.token);
      const deleted = await UploadJobController.remove(input.jobId, user.sub);
      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
      }
      return { message: 'deleted' };
    },
  })
  .mutation('cancelUploadJob', {
    input: z.object({ jobId: z.string(), token: z.string().optional() }),
    resolve: async ({ input }) => {
      // Signal the background processing loop (see `createUploadJob`) to
      // stop before its next file, and mark the job cancelled right away so
      // the UI reflects it immediately.
      cancelledUploadJobIds.add(input.jobId);
      try {
        const user = await getRequestUser(input.token);
        const existing: any = await UploadJobController.getByJobId(input.jobId);
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Job not found' });
        }
        if (existing.userId !== user.sub) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        return await UploadJobController.updateStatus(input.jobId, 'cancelled');
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to cancel upload job: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
  });

