import { atom } from 'jotai';
import { State } from './reducer';

export const taxonomyStateAtom = atom<State | undefined>(undefined);
