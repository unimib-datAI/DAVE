import { IconType } from '@react-icons/all-files';
import { Pane } from './Pane';
import { ReactNode } from 'react';
import styled from '@emotion/styled';

type ListPaneProps = {
  title: string;
  icon: IconType;
  children: ReactNode;
  actions? : ReactNode;
  isEmpty: boolean;
  emptyMessage: string;
};

export function ListPane({
  title,
  icon,
  children,
  actions,
  isEmpty,
  emptyMessage,
}: ListPaneProps) {
  return (
    <Pane title={title} icon={icon} actions={actions}>
      {isEmpty ? <Message>{emptyMessage}</Message> : <List>{children}</List>}
    </Pane>
  );
}

const Message = styled.p`
  color: var(--muted-foreground);
  text-align: center;
  margin: 24px 0;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;
