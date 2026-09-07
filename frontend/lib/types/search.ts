// Search / faceted-search / RAG payload shapes. Moved out of
// server/routers/search.ts.

export type FacetedQueryHit = {
  _id: string;
  id: number;
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
