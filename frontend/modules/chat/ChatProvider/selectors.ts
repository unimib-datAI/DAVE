import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { chatStateAtom } from './ChatContext';
import { chatReducer } from './reducer';
import { Action, State } from './types';
import { initialState } from './state';

export const useChatState = (): State => {
  const state = useAtomValue(chatStateAtom);
  if (state === undefined) {
    throw new Error('useChatState must be used within a ChatProvider');
  }
  return state;
};

export const useChatDispatch = () => {
  const setAtom = useSetAtom(chatStateAtom);
  return useCallback(
    (action: Action) =>
      setAtom((prev) => chatReducer(prev ?? initialState, action)),
    [setAtom]
  );
};

export function useSelector<T>(cb: (state: State) => T) {
  const state = useChatState();
  return cb(state);
}

// Convenience selectors
export const useMessages = () => useSelector((state) => state.messages);
export const useContexts = () => useSelector((state) => state.contexts);
export const useStatuses = () => useSelector((state) => state.statuses);
export const useConversationRated = () =>
  useSelector((state) => state.conversationRated);
