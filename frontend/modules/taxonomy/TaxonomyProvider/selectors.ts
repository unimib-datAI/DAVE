import { buildTreeFromFlattenedObject } from '@/components/TreeSpecialization';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { createSelector } from 'reselect';
import { taxonomyStateAtom } from './context';
import { Action, State, taxonomyReducer } from './reducer';

export const useTaxonomyState = (): State => {
  const state = useAtomValue(taxonomyStateAtom);
  if (state === undefined) {
    throw new Error('useTaxonomyState must be used within a TaxonomyProvider');
  }
  return state;
};

export const useTaxonomyDispatch = () => {
  const setAtom = useSetAtom(taxonomyStateAtom);
  return useCallback(
    (action: Action) =>
      setAtom((prev) => taxonomyReducer(prev ?? { taxonomy: {} }, action)),
    [setAtom]
  );
};

export function useSelector<T>(cb: (state: State) => T) {
  const state = useTaxonomyState();
  return cb(state);
}

// SELECTORS
export const selectFlatTaxonomy = (state: State) => state.taxonomy;

export const selectTreeTaxonomy = createSelector(
  [selectFlatTaxonomy],
  (flatTaxonomy) => buildTreeFromFlattenedObject(flatTaxonomy)
);
