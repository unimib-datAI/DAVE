import { Message } from '@/hooks/use-chat';
import { atom, useAtom } from 'jotai';

export const anonimizedNamesAtom = atom<boolean>(true);

export const chatHistoryAtom = atom<Message[]>([]);
