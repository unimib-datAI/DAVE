import { atomWithStorage } from 'jotai/utils';

export type Annotation = {
  id: number;
  id_ER?: string;
  start: number;
  end: number;
  type: string;
  mention: string;
  is_linked?: boolean;
  display_name?: string;
  anonymize?: boolean;
  to_delete?: boolean;
};

// Store annotations with localStorage persistence, keyed by document ID
export const annotationsAtom = atomWithStorage<Record<string, Annotation[]>>(
  'document-annotations',
  {}
);
