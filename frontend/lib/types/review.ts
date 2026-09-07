// Review-workflow payload shapes. Moved out of server/routers/review.ts.

import type { Document } from './document';

export type GetDocumentProps = {
  docId: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  currentDocument: Document;
};

export type SourceDoc = {
  id: string;
  name: string;
  done: boolean;
  nAnnotations: number;
};

export type GetSourceProps = {
  id: string;
  name: string;
  total: number;
  doneIds: string[];
  docs: SourceDoc[];
};

export type Source = {
  id: string;
  name: string;
  total: number;
  done: number;
};
