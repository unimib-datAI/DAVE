import { Cluster } from '@/server/routers/document';

export type ClusterWithDocId = Cluster & { docId?: string };

export type Mention = {
  start: number;
  end: number;
  context: string;
  id: number;
  mention: string;
  documentId?: number;
  documentTitle?: string;
};

export type Suggestion = {
  first: ClusterWithDocId;
  second: ClusterWithDocId;
  score: number;
};
