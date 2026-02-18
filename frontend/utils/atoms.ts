import { FacetedQueryHit } from '@/server/routers/search';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const anonimizedNamesAtom = atom<boolean>(true);
export const globalAnonymizationAtom = atomWithStorage<boolean>(
  'globalAnonymization',
  true
);

export const isLoadingAnonymizationAtom = atom<boolean>(false);
export const documentPageAtom = atom<number>(1);
export const documentTextAtom = atom<string>('');
export const facetsDocumentsAtom = atom<FacetedQueryHit[]>([]);
export const selectedFiltersAtom = atom<string[]>([]);

// `deanonymizeFacetsAtom` is now a derived writable atom that maps to the global anonymization toggle.
// - `globalAnonymizationAtom` = true  -> documents/facets are anonymized
// - `deanonymizeFacetsAtom`  = true  -> user is viewing de-anonymized names (inverse of globalAnonymizationAtom)
export const deanonymizeFacetsAtom = atom(
  (get) => !get(globalAnonymizationAtom),
  (get, set, update: boolean) => {
    // `update` is the desired deanonymize state (true = show real names).
    // Store the inverse into the global anonymization atom.
    set(globalAnonymizationAtom, !update);
  }
);

export const deanonymizedFacetNamesAtom = atom<Record<string, string>>({});
