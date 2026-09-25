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
export type SelectedFilter = { id_ER: string; display_name: string };
export const selectedFiltersAtom = atom<SelectedFilter[]>([]);

// Ids of the documents currently visible on the /search page, scoped to the
// applied facet filters (or every currently loaded document when no filter
// is applied). The search page keeps this in sync with its own facet ->
// document-id mapping (which goes through the facets-cache `doc_ids`, since
// ES hits no longer carry usable top-level `annotations`), so consumers like
// the chat's "use current search results" toggle don't need to recompute -
// and potentially get wrong - the filter/document matching themselves.
export const filteredDocumentIdsAtom = atom<string[]>([]);

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
