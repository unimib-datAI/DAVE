import styled from '@emotion/styled';
import { ReactNode } from 'react';

type ListItemProps = {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function ListItem({ selected, onClick, children }: ListItemProps) {
  return (
    <ListItemContainer data-selected={selected} onClick={onClick}>
      {children}
    </ListItemContainer>
  );
}

const ListItemContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;

  font-size: 16px;

  svg {
    color: var(--muted-foreground);
  }

  &:hover {
    background-color: var(--muted);
  }

  &[data-selected='true'] {
    background-color: var(--primary);
    color: var(--background);

    * {
      color: var(--background);
    }

    svg {
      color: var(--background);
    }
  }
`;
