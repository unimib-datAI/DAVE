import z from 'zod';

export async function startSimilarityJob(
  names: string[],
  threshold: number
): Promise<string> {
  if (names.length === 0) {
    throw new Error('Cannot start a similarity job with no cluster names');
  }

  const baseUrl = process.env.API_INDEXER;
  if (!baseUrl) {
    throw new Error('API_INDEXER is not configured');
  }

  const res = await fetch(`${baseUrl}/similarity/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names, threshold }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Similarity request failed (${res.status}): ${body}`);
  }

  const jobId = (await res.json()).jobId as string;
  return jobId;
}

export const similarityJobResultSchema = z.object({
  // Same values as the python backend in the qavectorizer
  status: z.enum(['pending', 'processing', 'completed']),
  result: z
    .object({
      firstIndex: z.number(),
      secondIndex: z.number(),
      score: z.number(),
    })
    .array()
    .optional(),
});

type SimilarityJobResult = z.infer<typeof similarityJobResultSchema>;

export async function getSimilarityJob(jobId: string) {
  const baseUrl = process.env.API_INDEXER;
  if (!baseUrl) {
    throw new Error('API_INDEXER is not configured');
  }

  const res = await fetch(
    `${baseUrl}/similarity/jobs/${encodeURIComponent(jobId)}`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Could not get status of job ${jobId} (${res.status}): ${body}`
    );
  }

  const data = (await res.json()) as SimilarityJobResult;

  return data;
}
