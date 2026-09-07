/**
 * Hook for submitting background upload jobs and reading tracked job state.
 *
 * Submission just hands file contents to the server and gets a jobId back —
 * all the actual processing (annotation pipeline, document creation) runs
 * server-side, independent of this browser tab. See
 * server/routers/document.ts `createUploadJob` for the background loop, and
 * `useUploadJobStream` for how progress is read back.
 */

import { useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { trpc } from '@/utils/trpc';
import {
  uploadJobIdsAtom,
  uploadJobsMapAtom,
  trackUploadJobAtom,
  untrackUploadJobAtom,
} from '@/atoms/uploadJobs';
import { UploadJob } from '@/lib/upload/types';

export interface SubmitUploadJobInput {
  collectionId: string;
  uploadType: 'json' | 'txt';
  files: Array<{ fileName: string; content: string }>;
  token: string;
  configurationId?: string;
  toAnonymize?: boolean;
  anonymizeTypes?: string[];
}

export function useUploadJobs() {
  const jobIds = useAtomValue(uploadJobIdsAtom);
  const jobsMap = useAtomValue(uploadJobsMapAtom);
  const trackJob = useSetAtom(trackUploadJobAtom);
  const untrackJob = useSetAtom(untrackUploadJobAtom);

  const createUploadJobMutation = trpc.document.createUploadJob.useMutation();
  const dismissUploadJobMutation = trpc.document.dismissUploadJob.useMutation();
  const cancelUploadJobMutation = trpc.document.cancelUploadJob.useMutation();

  const submitUploadJob = useCallback(
    async (input: SubmitUploadJobInput): Promise<string> => {
      const result = await createUploadJobMutation.mutateAsync({
        collectionId: input.collectionId,
        uploadType: input.uploadType,
        files: input.files,
        configurationId: input.configurationId,
        toAnonymize: input.toAnonymize,
        anonymizeTypes: input.anonymizeTypes,
      });
      trackJob(result.jobId);
      return result.jobId as string;
    },
    [createUploadJobMutation, trackJob]
  );

  const dismissJob = useCallback(
    async (jobId: string, token: string) => {
      untrackJob(jobId);
      try {
        await dismissUploadJobMutation.mutateAsync({ jobId });
      } catch {
        // best-effort — the job is already untracked client-side
      }
    },
    [dismissUploadJobMutation, untrackJob]
  );

  // Cancels a still-running job. Unlike `dismissJob`, this keeps the job
  // tracked so its (now 'cancelled') terminal state stays visible — the
  // live stream (see useUploadJobStream) picks up the status change and
  // the user can dismiss it afterwards like any other finished job.
  const cancelJob = useCallback(
    async (jobId: string, token: string) => {
      await cancelUploadJobMutation.mutateAsync({ jobId });
    },
    [cancelUploadJobMutation]
  );

  const jobs: UploadJob[] = jobIds
    .map((id) => jobsMap[id])
    .filter((job): job is UploadJob => Boolean(job));

  return {
    jobIds,
    jobs,
    submitUploadJob,
    dismissJob,
    cancelJob,
    isSubmitting: createUploadJobMutation.isPending,
  };
}
