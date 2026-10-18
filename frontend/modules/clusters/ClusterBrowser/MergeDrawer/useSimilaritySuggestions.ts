import { useEffect, useState } from 'react';
import { ClusterWithDocId, Suggestion } from '../types';
import { useMutation, useQuery } from '@/utils/trpc';

// How often to check if the suggestions are ready, in ms
const REFETCH_INTERVAL = 1000;

export function useSimilaritySuggestions(
  clusters: ClusterWithDocId[],
  threshold: number,
  enabled: boolean
) {
  const computeSuggestions = useMutation('similarity.startJob');
  
  /*
    - If empty, then no suggestion has been found
    - If undefined:
        - If hasJobFailed, there has been an error
        - else, backend is computing suggestions
  */
  const [suggestions, setSuggestions] = useState<Suggestion[]>();

  const [hasJobFailed, setHasJobFailed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);

  // Used to trigger the effect again on request from UI
  const [attempt, setAttempt] = useState(0);

  // This will hold the ID of the similarity job running in the backend
  // It's needed to fetch the result of the task that is started with
  // the mutation
  const [jobId, setJobId] = useState<string>();

  const retry = () => setAttempt((prev) => prev + 1);

  useEffect(() => {
    // If clusters change, then reset suggestions regardless
    // of enabled
    setSuggestions(undefined);
    setJobId(undefined);
    setHasJobFailed(false);

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // Not enough clusters to compute suggestions
    if (clusters.length <= 1) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    computeSuggestions.mutate(
      { values: clusters.map((c) => c.title), threshold },
      {
        onSuccess: ({ jobId }) => {
          setJobId(jobId);
        },
        onError: () => {
          setIsLoading(false);
          setHasJobFailed(true);
        },
      }
    );
  }, [clusters, enabled, attempt]);

  useQuery(['similarity.getJob', { jobId: jobId ?? '' }], {
    // Only run the query when a job ID is set
    enabled: !!jobId,

    // Refetch only if the job has not completed successfully or failed
    refetchInterval: (data) =>
      data?.status === 'completed' || data?.status === 'failed'
        ? false
        : REFETCH_INTERVAL,

    onSuccess: ({ status, result }) => {
      // If the job fails, just return empty suggestions
      if (status === 'failed') {
        setHasJobFailed(true);
        setJobId(undefined);
        setIsLoading(false);
        return;
      }

      // If the job is not completed yet, return and wait for refetch

      if (status !== 'completed' || !result) return;

      // The job has completed, the array of suggestions can be built
      // from the list of indexes returned by the API
      const suggestions: Suggestion[] = result.map((s) => ({
        keep: clusters[s.firstIndex],
        mergeAway: clusters[s.secondIndex],
        score: s.score,
      }));
      setSuggestions(suggestions);

      // Job is done, forget the ID
      setJobId(undefined);

      setIsLoading(false);
    },
    onError: () => {
      setHasJobFailed(true);
      setJobId(undefined);
      setIsLoading(false);
    },
  });

  return { suggestions, isLoading, hasJobFailed, retry };
}
