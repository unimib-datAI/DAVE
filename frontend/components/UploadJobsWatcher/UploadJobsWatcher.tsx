/**
 * Keeps live progress subscriptions open for every tracked upload job,
 * independent of whether the upload modal is open or which page is active.
 *
 * `uploadJobIdsAtom` is persisted to localStorage, so on a fresh page load
 * (navigation, refresh, or a brand new tab) this component immediately
 * reconnects to every job that wasn't already known to be finished and pulls
 * its current state from the server.
 */

import { useAtomValue } from 'jotai';
import { uploadJobIdsAtom, uploadJobsMapAtom } from '@/atoms/uploadJobs';
import { useUploadJobStream } from '@/hooks/upload/useUploadJobStream';
import { isTerminalStatus } from '@/lib/upload/types';

function JobWatcher({ jobId }: { jobId: string }) {
  useUploadJobStream(jobId);
  return null;
}

export function UploadJobsWatcher() {
  const jobIds = useAtomValue(uploadJobIdsAtom);
  const jobsMap = useAtomValue(uploadJobsMapAtom);

  const idsToWatch = jobIds.filter((id) => {
    const job = jobsMap[id];
    return !job || !isTerminalStatus(job.status);
  });

  return (
    <>
      {idsToWatch.map((id) => (
        <JobWatcher key={id} jobId={id} />
      ))}
    </>
  );
}

export default UploadJobsWatcher;
