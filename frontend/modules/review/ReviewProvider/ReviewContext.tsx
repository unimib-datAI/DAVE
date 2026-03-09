import { atom } from 'jotai';
import { State } from './types';

export const reviewStateAtom = atom<State | undefined>(undefined);
