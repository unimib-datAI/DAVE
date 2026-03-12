import { PropsWithChildren, useMemo } from 'react';
import { Provider, createStore } from 'jotai';
import { chatStateAtom } from './ChatContext';
import { initialState } from './state';

/**
 * Provides chat state to its subtree via a scoped Jotai store.
 */
const ChatProvider = ({ children }: PropsWithChildren<{}>) => {
  const store = useMemo(() => {
    const s = createStore();
    s.set(chatStateAtom, initialState);
    return s;
  }, []);

  return <Provider store={store}>{children}</Provider>;
};

export default ChatProvider;
