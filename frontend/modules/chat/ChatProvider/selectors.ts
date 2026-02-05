import { useContext } from 'react';
import { ChatDispatchContext, ChatStateContext } from './ChatContext';
import { State } from './types';

export const useChatState = () => {
  const context = useContext(ChatStateContext);
  if (context === undefined) {
    throw new Error('useChatState must be used within a ChatProvider');
  }
  return context;
};

export const useChatDispatch = () => {
  const context = useContext(ChatDispatchContext);
  if (context === undefined) {
    throw new Error('useChatDispatch must be used within a ChatProvider');
  }
  return context;
};

export function useSelector<T>(cb: (state: State) => T) {
  const _state = useChatState();
  return cb(_state);
}

// Convenience selectors
export const useMessages = () => useSelector((state) => state.messages);
export const useContexts = () => useSelector((state) => state.contexts);
export const useStatuses = () => useSelector((state) => state.statuses);
export const useConversationRated = () => useSelector((state) => state.conversationRated);
