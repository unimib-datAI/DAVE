import { appRouter } from '@/server/routers/_app';
import { createContext } from '@/server/context';
import * as trpcNext from '@trpc/server/adapters/next';

export const config = {
  api: {
    bodyParser: {
      // large document uploads arrive as base64 in the JSON body
      sizeLimit: '900mb',
    },
  },
};

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
  onError({ error, path }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // eslint-disable-next-line no-console
      console.error(`tRPC failure on "${path ?? '<no-path>'}":`, error.message);
    }
  },
});
