import { createContext } from 'react';
import { Dispatch, State } from './types';

export interface DocumentContextType {
  data: any; // Replace `any` with your actual data type
  updateData: (newData: any) => void; // Define the type for newData
  deAnonimize: boolean;
  setDeAnonimize: (value: boolean) => void;
}

export const DocumentContext = createContext<DocumentContextType | undefined>(
  undefined
);

export const DocumentStateContext = createContext<State | undefined>(undefined);
export const DocumentDispatchContext = createContext<Dispatch | undefined>(
  undefined
);
