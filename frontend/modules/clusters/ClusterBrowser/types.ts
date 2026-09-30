import { Cluster } from "@/server/routers/document";

export type ClusterWithDocId = Cluster & { docId?: number };

export type Mention = {
  start: number;
  end: number;
  context: string;
  id: number;
  mention: string;
  documentId?: number;
  documentTitle?: string;
};