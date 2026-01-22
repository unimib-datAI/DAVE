import { FacetedQueryHit } from '@/server/routers/search';
import { atom } from 'jotai';

export const anonimizedNamesAtom = atom<boolean>(true);
export const documentPageAtom = atom<number>(1);
export const documentTextAtom = atom<string>('');
export const facetsDocumentsAtom = atom<FacetedQueryHit[]>([]);
export const selectedFiltersAtom = atom<string[]>([]);
export const deanonymizeFacetsAtom = atom<boolean>(false);
export const deanonymizedFacetNamesAtom = atom<Record<string, string>>({});
