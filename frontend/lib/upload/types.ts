/**
 * Upload job types.
 *
 * The UploadJob record lives in MongoDB (backend/documents `upload_jobs`
 * collection) and is the single source of truth for progress. The browser
 * only ever reads it (via REST or the SSE stream) — it never reconstructs
 * job state from localStorage alone, which is what makes progress survive
 * refreshes, navigation, and closing/reopening the tab.
 */

export type UploadJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export type UploadFileStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface UploadJobFile {
  fileId: string;
  fileName: string;
  status: UploadFileStatus;
  progress: number; // 0-100
  error?: string;
  documentId?: string;
}

export interface UploadJobConfiguration {
  configurationId?: string;
  toAnonymize: boolean;
  anonymizeTypes?: string[];
}

export interface UploadJobStatistics {
  total: number;
  completed: number;
  failed: number;
  startedAt?: string;
  completedAt?: string;
}

export interface UploadJob {
  jobId: string;
  userId?: string;
  collectionId: string;
  uploadType: 'json' | 'txt';
  status: UploadJobStatus;
  files: UploadJobFile[];
  configuration?: UploadJobConfiguration;
  statistics: UploadJobStatistics;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const TERMINAL_JOB_STATUSES: UploadJobStatus[] = [
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
];

export function isTerminalStatus(status: UploadJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}
