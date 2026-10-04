import { ClusterWithDocId } from '../types';

export const getAutocompleteKey = (c: ClusterWithDocId | null) => {
  if (!c) return null;
  return `${c.docId}-${c.id}`;
};
