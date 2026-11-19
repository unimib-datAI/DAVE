/**
 * Subscribes to live progress for a single upload job via Server-Sent
 * Events, falling back to polling if EventSource repeatedly fails (older
 * browsers, restrictive proxies, etc). Writes results into the shared
 * `uploadJobsMapAtom` cache so any component can read current progress.
 */

import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import {
  notifiedUploadJobIdsAtom,
  uploadJobsMapAtom,
  uploadNotificationsAtom,
  untrackUploadJobAtom,
} from '@/atoms/uploadJobs';
import { isTerminalStatus, UploadJob } from '@/lib/upload/types';
import {
  getTrpcErrorCode,
  isPermanentTrpcError,
  useQuery,
  useContext as useTrpcContext,
} from '@/utils/trpc';

const MAX_SSE_FAILURES = 3;
const FALLBACK_POLL_MS = 4000;

// The job is gone or belongs to another account: it can never be watched from
// this session, so it should be dropped from the tracked list altogether.
const isDeadJobCode = (code: unknown) =>
  code === 'NOT_FOUND' || code === 'FORBIDDEN';

export function useUploadJobStream(jobId: string | null | undefined) {
  const { data: session } = useSession();
  const token = ((session as any)?.accessToken as string | undefined) ?? '';
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const setJobsMap = useSetAtom(uploadJobsMapAtom);
  const setNotifications = useSetAtom(uploadNotificationsAtom);
  const notifiedUploadJobIds = useAtomValue(notifiedUploadJobIdsAtom);
  const setNotifiedUploadJobIds = useSetAtom(notifiedUploadJobIdsAtom);
  const untrack = useSetAtom(untrackUploadJobAtom);
  const trpcContext = useTrpcContext();
  const notifiedTerminalRef = useRef(false);
  // Kept in a ref so `applyJob` always sees the current persisted set without
  // needing it in the effect's dependency list (which would tear down and
  // rebuild the stream every time a notification is recorded).
  const notifiedUploadJobIdsRef = useRef(notifiedUploadJobIds);
  notifiedUploadJobIdsRef.current = notifiedUploadJobIds;

  const jobQuery = useQuery(
    ['document.getUploadJob', { jobId: jobId as string, token }],
    { enabled: false, retry: false }
  );

  useEffect(() => {
    if (!jobId) return;
    if (!authDisabled && !token) return;

    notifiedTerminalRef.current = false;
    let cancelled = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let failureCount = 0;

    const applyJob = (job: UploadJob) => {
      if (cancelled) return;
      setJobsMap((prev) => ({ ...prev, [job.jobId]: job }));

      if (isTerminalStatus(job.status) && !notifiedTerminalRef.current) {
        notifiedTerminalRef.current = true;

        // Only surface the "upload complete/failed" toast the first time this
        // job reaches a terminal state. A later navigation or page reload
        // re-subscribes to the (still-tracked) finished job and would
        // otherwise pop the exact same notification every time.
        if (notifiedUploadJobIdsRef.current.includes(job.jobId)) return;
        setNotifiedUploadJobIds((prev) =>
          prev.includes(job.jobId) ? prev : [job.jobId, ...prev].slice(0, 50)
        );

        const failed = job.statistics.failed;
        const completed = job.statistics.completed;
        setNotifications((prev) => [
          ...prev,
          {
            id: `${job.jobId}-${job.status}`,
            title:
              job.status === 'failed'
                ? 'Upload failed'
                : failed > 0
                ? 'Upload finished with errors'
                : 'Upload complete',
            message:
              job.status === 'failed'
                ? job.error || 'The upload job failed.'
                : `${completed} of ${job.statistics.total} file(s) uploaded${
                    failed > 0 ? `, ${failed} failed` : ''
                  }`,
            type: job.status === 'failed' || failed > 0 ? 'warning' : 'success',
            timestamp: Date.now(),
            duration: 6000,
          },
        ]);
        trpcContext.invalidateQueries(['search.facetedSearch']);
        trpcContext.invalidateQueries(['document.inifniteDocuments']);
      }
    };

    const startPolling = () => {
      if (source) {
        source.close();
        source = null;
      }
      // Codes that will never resolve by retrying (wrong owner, deleted job,
      // expired session) - polling on these forever just spams the server
      // with the identical rejected request every FALLBACK_POLL_MS.
      // Dead jobs are also untracked, otherwise the same rejected request is
      // repeated on every page load and token refresh. UNAUTHORIZED stays
      // tracked so watching resumes after re-login.
      const stopOnPermanentError = (error: any) => {
        if (!isPermanentTrpcError(error)) return false;
        if (!cancelled && isDeadJobCode(getTrpcErrorCode(error))) {
          untrack(jobId);
        }
        return true;
      };

      const tick = async () => {
        if (cancelled) return;
        try {
          const job = await jobQuery.refetch();
          if (job.data) {
            applyJob(job.data as UploadJob);
            if (isTerminalStatus((job.data as UploadJob).status)) {
              return;
            }
          } else if (job.error && stopOnPermanentError(job.error)) {
            return;
          }
        } catch (error) {
          if (stopOnPermanentError(error)) return;
          // best-effort; keep polling on transient/network errors
        }
        if (!cancelled) pollTimer = setTimeout(tick, FALLBACK_POLL_MS);
      };
      tick();
    };

    const startSSE = () => {
      const url = `${
        process.env.NEXT_PUBLIC_BASE_PATH || ''
      }/api/upload-jobs/${encodeURIComponent(jobId)}/stream?token=${encodeURIComponent(
        token
      )}`;
      const es = new EventSource(url);
      source = es;

      es.addEventListener('job', (event: MessageEvent) => {
        failureCount = 0;
        try {
          applyJob(JSON.parse(event.data));
        } catch {
          // ignore malformed frame
        }
      });

      es.addEventListener('done', () => {
        es.close();
        source = null;
      });

      es.onerror = (event: Event) => {
        // A server-sent `error` frame (unlike a network failure) carries data.
        // If it says the job is gone or not ours, reconnecting or falling back
        // to polling can only repeat the same rejection: drop the job instead.
        const frame = (event as MessageEvent).data;
        if (typeof frame === 'string') {
          let code: unknown;
          try {
            code = JSON.parse(frame)?.code;
          } catch {
            // ignore malformed frame
          }
          if (isDeadJobCode(code)) {
            es.close();
            source = null;
            if (!cancelled) untrack(jobId);
            return;
          }
        }
        failureCount += 1;
        if (failureCount >= MAX_SSE_FAILURES) {
          es.close();
          source = null;
          startPolling();
        }
      };
    };

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      startSSE();
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      if (source) source.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, token, authDisabled]);
}
