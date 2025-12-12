import { createRouter } from '../context';
import { annotations } from './annotation';
import { collections } from './collection';
import { documents } from './document';
import { infer } from './infer';
import { review } from './review';
import { search } from './search';
import { taxonomy } from './taxonomy';
import { wikipedia } from './wikipedia';
import { users } from './user';

// export type definition of API
export type AppRouter = typeof appRouter;

export const appRouter = createRouter()
  .merge('document.', documents)
  .merge('annotation.', annotations)
  .merge('collection.', collections)
  .merge('infer.', infer)
  .merge('taxonomy', taxonomy)
  .merge('review.', review)
  .merge('wikipedia.', wikipedia)
  .merge('search.', search)
  .merge('user.', users);
