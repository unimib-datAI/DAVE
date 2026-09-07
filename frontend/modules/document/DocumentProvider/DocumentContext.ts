import { atom } from 'jotai';
import { createContext } from 'react';
import { Dispatch, State } from './types';

export interface DocumentContextType {
  data: any; // Replace `any` with your actual data type
  updateData: (newData: any) => void; // Define the type for newData
  deAnonimize: boolean;
  setDeAnonimize: (value: boolean) => void;
  /**
   * True when the document is not backed by a server record and cannot be
   * saved (QuickView - see `pages/quickView.tsx`). Consumers use this to hide
   * save affordances.
   */
  readOnly?: boolean;
}

export const DocumentContext = createContext<DocumentContextType | undefined>(
  undefined
);

export const documentStateAtom = atom<State | undefined>(undefined);
