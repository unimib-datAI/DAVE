import { Message } from '@/hooks/use-chat';
import { atom, useAtom } from 'jotai';

export const chatHistoryAtom = atom<Message[]>([]);
