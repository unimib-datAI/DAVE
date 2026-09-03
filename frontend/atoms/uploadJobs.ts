/**
 * Upload job state.
 *
 * The durable job record lives in MongoDB — these atoms only cache what the
 * browser needs to render UI:
 *  - `uploadJobIdsAtom` persists to localStorage so that after a refresh or
 *    reopening the tab we know which jobs to reconnect to.
 *  - `uploadJobsMapAtom` is the live, in-memory cache populated by SSE/poll
 *    updates (see hooks/upload/useUploadJobStream).
 */

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { UploadJob } from '@/lib/upload/types';

const MAX_TRACKED_JOBS = 20;

export const uploadJobIdsAtom = atomWithStorage<string[]>(
  'dave_upload_job_ids',
  []
);

/**
 * Job ids whose terminal ("upload complete" / "failed") notification has
 * already been shown. Persisted so that reconnecting to an already-finished
 * job after a navigation or page reload doesn't pop the same toast again.
 */
export const notifiedUploadJobIdsAtom = atomWithStorage<string[]>(
  'dave_notified_upload_job_ids',
  []
);

export const uploadJobsMapAtom = atom<Record<string, UploadJob>>({});

/**
 * Adds a job id to the front of the tracked list (most recent first),
 * de-duplicating and capping the list length.
 */
export const trackUploadJobAtom = atom(null, (get, set, jobId: string) => {
  const current = get(uploadJobIdsAtom);
  const next = [jobId, ...current.filter((id) => id !== jobId)].slice(
    0,
    MAX_TRACKED_JOBS
  );
  set(uploadJobIdsAtom, next);
});

export const untrackUploadJobAtom = atom(null, (get, set, jobId: string) => {
  set(
    uploadJobIdsAtom,
    get(uploadJobIdsAtom).filter((id) => id !== jobId)
  );
  set(
    notifiedUploadJobIdsAtom,
    get(notifiedUploadJobIdsAtom).filter((id) => id !== jobId)
  );
  const map = { ...get(uploadJobsMapAtom) };
  delete map[jobId];
  set(uploadJobsMapAtom, map);
});

export interface UploadNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  duration?: number;
}

export const uploadNotificationsAtom = atom<UploadNotification[]>([]);

// `uploadModalOpenAtom` lives in `@/atoms/upload` — re-exported here for
// convenience so upload-related components only need one import path.
export { uploadModalOpenAtom } from './upload';
