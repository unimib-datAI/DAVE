import { PropsWithChildren } from 'react';
import { useHydrateAtoms } from 'jotai/utils';
import { chatStateAtom } from './ChatContext';
import { initialState } from './state';

const HydrateAtoms = ({ children }: PropsWithChildren<{}>) => {
  useHydrateAtoms([[chatStateAtom, initialState]]);
  return <>{children}</>;
};

const ChatProvider = ({ children }: PropsWithChildren<{}>) => {
  return <HydrateAtoms>{children}</HydrateAtoms>;
};

export default ChatProvider;
