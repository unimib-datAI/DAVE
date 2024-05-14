import { Message } from '@/hooks/use-chat';
import { DocumentWithChunk } from '@/server/routers/search';
import { atom, useAtom } from 'jotai';
type MessagesState = {
  messages: Message[];
  contexts: (DocumentWithChunk[] | undefined)[];
  statuses: (boolean | undefined)[];
};
export const anonimizedNamesAtom = atom<boolean>(true);
export const documentPageAtom = atom<number>(1);
export const documentTextAtom = atom<string>('');
export const chatHistoryAtom = atom<MessagesState>({
  messages: [],
  contexts: [],
  statuses: [],
});
