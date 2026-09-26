import styled from '@emotion/styled';
import { IconType } from '@react-icons/all-files/lib';
import { ReactNode } from 'react';

type PaneProps = {
  icon: IconType
  title: string;
  children: ReactNode;
};

export function Pane({ icon : Icon, title, children }: PaneProps) {
  return (
    <PaneContainer>
      <PaneTitle>
        <Icon/>
        <h2>{title}</h2>
      </PaneTitle>
      <PaneContent>{children}</PaneContent>
    </PaneContainer>
  );
}

const PaneContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const PaneContent = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0px;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
`;

const PaneTitle = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: var(--font-semibold);
  background-color: var(--background);
  color: var(--muted-foreground);
  border-bottom: 2px solid var(--muted);
`;
