import {
  getSimilarityJob,
  similarityJobResultSchema,
  startSimilarityJob,
} from '@/lib/similarityClient';
import { createRouter } from '../context';
import z from 'zod';
import { TRPCError } from '@trpc/server';

export const similarity = createRouter()
  .mutation('startJob', {
    input: z.object({
      values: z.string().array().min(1),
      threshold: z.number().min(0).max(1),
    }),
    output: z.object({
      jobId: z.string(),
    }),
    resolve: async ({ input }) => {
      const { values, threshold } = input;
      try {
        const jobId = await startSimilarityJob(values, threshold);
        return { jobId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('startJob failed', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start similarity job.',
        });
      }
    },
  })
  .query('getJob', {
    input: z.object({
      jobId: z.string(),
    }),
    output: similarityJobResultSchema,
    resolve: async ({ input }) => {
      const { jobId } = input;
      const result = await getSimilarityJob(jobId);
      return result;
    },
  });
