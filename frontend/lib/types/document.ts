// Document domain model — shapes for the `document.*` and related API
// payloads. Moved out of server/routers/document.ts (which now imports these)
// so client code stops importing from server route modules.
//
// The generic annotation primitive `Annotation<T>` lives in the NER core
// (lib/ner/core/types.ts); this file layers DAVE's concrete entity model on
// top of it. The dependency is one-directional: lib/ner/core stays generic.

import type { Annotation } from '@/lib/ner/core/types';

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

/**
 * An entity-linking candidate (BLINK / bi-encoder output).
 *
 * Renamed from `Candidate` during the type extraction — `taxonomy.ts` had an
 * unrelated type by the same name (now `SpecializationCandidate`).
 */
export type LinkingCandidate = {
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
  additional_candidates: LinkingCandidate[];
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
    top_candidate: LinkingCandidate;
    candidates: LinkingCandidate[];
  };
  types?: string[];
};

export type EntityAnnotation = Annotation<AdditionalAnnotationProps>;
export type SectionAnnotation = Annotation;

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
