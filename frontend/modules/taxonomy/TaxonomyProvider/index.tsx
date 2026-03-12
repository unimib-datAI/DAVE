import { PropsWithChildren, useMemo } from 'react';
import { Provider, createStore } from 'jotai';
import { flatTaxonomy } from '../taxonomy';
import { taxonomyStateAtom } from './context';

const TaxonomyProvider = ({ children }: PropsWithChildren<{}>) => {
  const store = useMemo(() => {
    const s = createStore();
    s.set(taxonomyStateAtom, { taxonomy: flatTaxonomy });
    return s;
  }, []);

  return <Provider store={store}>{children}</Provider>;
};

export default TaxonomyProvider;
