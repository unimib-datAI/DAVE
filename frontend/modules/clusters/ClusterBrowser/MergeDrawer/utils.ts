import { ClusterWithDocId } from '../types';

export const getClusterKey = (c: ClusterWithDocId | null) => {
  if (!c) return null;
  return `${c.docId}-${c.id}`;
};

export const getInfoFromClusterKey = (key: string | null) => {
  if (!key) return null;
  const split = key.split('-');
  return {
    docId: split[0],
    clusterId: Number(split[1]),
  };
};
