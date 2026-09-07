import fetchJson from '@/lib/fetchJson';
import { z } from 'zod';
import { createRouter } from '../context';
import { getAuthHeader } from '../get-auth-header';
import { serverConfig } from '@/lib/config/server';
import type { Document } from '@/lib/types/document';

type InferOptions = {
  save: boolean;
}

const defaultOptions = {
  save: false
}

const inferText = async (value: string, options: InferOptions) => {
  const response = await fetchJson<any, Document>(
    `${serverConfig.externalBackend.baseUri}/pipeline`,
    {
      method: 'POST',
      headers: {
        Authorization: getAuthHeader()
      },
      body: {
        text: value,
        save: options.save
      },
    }
  );
  return response;
};

export const infer = createRouter()
  .mutation('getResults', {
    input: z.object({
      value: z.string(),
      save: z.boolean().optional()
    }),
    resolve: ({ input }) => {
      const { value, ...options } = input;
      const resolvedOptions = {
        ...defaultOptions,
        ...options
      }
      return inferText(value, resolvedOptions);
    },
  });
