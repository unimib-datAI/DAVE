import { PropsWithChildren, useReducer } from 'react';
import { ChatStateContext, ChatDispatchContext } from './ChatContext';
import { chatReducer } from './reducer';
import { initialState } from './state';

/**
 * Provides chat state and dispatch to the context consumer globally.
 */
const ChatProvider = ({ children }: PropsWithChildren<{}>) => {
  const [state, dispatch] = useReducer(chatReducer, initialState);

  return (
    <ChatStateContext.Provider value={state}>
      <ChatDispatchContext.Provider value={dispatch}>
        {children}
      </ChatDispatchContext.Provider>
    </ChatStateContext.Provider>
  );
};

export default ChatProvider;
