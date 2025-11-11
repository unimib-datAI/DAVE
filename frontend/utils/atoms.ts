import { Message } from '@/hooks/use-chat';
import { DocumentWithChunk, FacetedQueryHit } from '@/server/routers/search';
import { atom } from 'jotai';

type MessagesState = {
  messages: Message[];
  contexts: (DocumentWithChunk[] | undefined)[];
  statuses: (boolean | undefined)[];
};

export const anonimizedNamesAtom = atom<boolean>(true);
export const documentPageAtom = atom<number>(1);
export const documentTextAtom = atom<string>('');
export const facetsDocumentsAtom = atom<FacetedQueryHit[]>([]);
export const selectedFiltersAtom = atom<string[]>([]);
export const conversationRatedAtom = atom<boolean>(false);
export const chatHistoryAtom = atom<MessagesState>({
  messages: [],
  contexts: [],
  statuses: [],
});
export const deanonymizeFacetsAtom = atom<boolean>(false);
export const deanonymizedFacetNamesAtom = atom<Record<string, string>>({});
