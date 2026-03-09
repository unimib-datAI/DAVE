import { atom } from 'jotai';
import { State } from './types';

export const chatStateAtom = atom<State | undefined>(undefined);
