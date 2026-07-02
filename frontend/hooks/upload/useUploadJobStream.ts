/**
 * Subscribes to live progress for a single upload job via Server-Sent
 * Events, falling back to polling if EventSource repeatedly fails (older
 * browsers, restrictive proxies, etc). Writes results into the shared
 * `uploadJobsMapAtom` cache so any component can read current progress.
 */

import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import {
  uploadJobsMapAtom,
  uploadNotificationsAtom,
} from '@/atoms/uploadJobs';
import { isTerminalStatus, UploadJob } from '@/lib/upload/types';
import { useQuery, useContext as useTrpcContext } from '@/utils/trpc';

const MAX_SSE_FAILURES = 3;
const FALLBACK_POLL_MS = 4000;

export function useUploadJobStream(jobId: string | null | undefined) {
  const { data: session } = useSession();
  const token = ((session as any)?.accessToken as string | undefined) ?? '';
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const setJobsMap = useSetAtom(uploadJobsMapAtom);
  const setNotifications = useSetAtom(uploadNotificationsAtom);
  const trpcContext = useTrpcContext();
  const notifiedTerminalRef = useRef(false);

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
      const tick = async () => {
        if (cancelled) return;
        try {
          const job = await jobQuery.refetch();
          if (job.data) applyJob(job.data as UploadJob);
          if (job.data && isTerminalStatus((job.data as UploadJob).status)) {
            return;
          }
        } catch (error) {
          // best-effort; keep polling
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

      es.onerror = () => {
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
