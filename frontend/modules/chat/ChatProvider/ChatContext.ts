import { createContext } from 'react';
import { Dispatch, State } from './types';

export const ChatStateContext = createContext<State | undefined>(undefined);
export const ChatDispatchContext = createContext<Dispatch | undefined>(
  undefined
);
