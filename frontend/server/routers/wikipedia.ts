import fetchJson from '@/lib/fetchJson';
import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '../trpc';

export type GetDataProps = {
  title: string;
  extract: string;
};

export const wikipediaRouter = router({
  getData: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        title: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { id, title } = input;
      let query = '';
      if (id) {
        query = `pageids=${id}`;
      } else if (title) {
        query = `titles=${title}`;
      }

      if (!query) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'id or title are required',
        });
      }
      const data = await fetchJson<void, any>(
        `https://it.wikipedia.org/w/api.php?format=json&action=query&prop=extracts&exintro&explaintext&redirects=1&${query}`
      );

      const objData = Object.values(data.query.pages)[0] as GetDataProps;
      return {
        title: objData.title,
        extract: objData.extract.slice(0, 300),
      };
    }),
});
