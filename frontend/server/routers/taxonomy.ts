import fetchJson from '@/lib/fetchJson';
import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';
import { getAuthHeader } from '../get-auth-header';
import { serverConfig } from '@/lib/config/server';
import type { SpecializationCandidate } from '@/lib/types/taxonomy';

const baseURL = `${serverConfig.externalBackend.baseUri}/specialization`;

const getZeroShotExamples = async (
  type_id: string,
  verbalizer: string[],
  ancestor_type_id: string
): Promise<SpecializationCandidate[]> => {
  try {
    const candidates = fetchJson<any, SpecializationCandidate[]>(
      `${baseURL}/zero`,
      {
        method: 'POST',
        headers: {
          Authorization: getAuthHeader(),
        },
        body: {
          type_id,
          verbalizer,
          ancestor_type_id,
        },
      }
    );
    return candidates;
  } catch (err) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `AAA`,
    });
  }
};

const getFewShotExamples = async (
  type_id: string
): Promise<SpecializationCandidate[]> => {
  const candidates = fetchJson<any, SpecializationCandidate[]>(
    `${baseURL}/few`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader(),
      },
      body: {
        type_id,
      },
    }
  );
  return candidates;
};

export const taxonomyRouter = router({
  getZeroShotCandidates: publicProcedure
    .input(
      z.object({
        id: z.string(),
        terms: z.string().array(),
        parent: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { id, terms, parent } = input;
      return getZeroShotExamples(id, terms, parent);
    }),
  getFewShotCandidates: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getFewShotExamples(input.id);
    }),
});
