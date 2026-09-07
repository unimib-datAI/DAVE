import { router } from '../trpc';
import { annotationsRouter } from './annotation';
import { collectionsRouter } from './collection';
import { documentsRouter } from './document';
import { inferRouter } from './infer';
import { permissionsRouter } from './permission';
import { reviewRouter } from './review';
import { searchRouter } from './search';
import { taxonomyRouter } from './taxonomy';
import { wikipediaRouter } from './wikipedia';
import { usersRouter } from './user';

export const appRouter = router({
  document: documentsRouter,
  annotation: annotationsRouter,
  collection: collectionsRouter,
  infer: inferRouter,
  taxonomy: taxonomyRouter,
  review: reviewRouter,
  wikipedia: wikipediaRouter,
  search: searchRouter,
  user: usersRouter,
  permission: permissionsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
