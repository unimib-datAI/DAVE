import styled from '@emotion/styled';
import { ClusterWithDocId, Suggestion } from '../types';
import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import { getClusterKey } from './utils';
import { Button } from '@heroui/react';
import { Fragment } from 'react/jsx-runtime';
import { FiCheck } from '@react-icons/all-files/fi/FiCheck';
import { FiEdit2 } from '@react-icons/all-files/fi/FiEdit2';

type SuggestionsTableProps = {
  suggestions: Suggestion[];
  taxonomy: { [x: string]: FlatTreeNode };
  onEdit: (keep: ClusterWithDocId, mergeAway: ClusterWithDocId) => void;
  onMerge: () => void;
};

export default function SuggestionsTable({
  suggestions,
  taxonomy,
  onEdit,
  onMerge,
}: SuggestionsTableProps) {
  return (
    <Table>
      <TableHeader>
        <Cell col={2} row={1}>
          <HeaderLabel>Entity</HeaderLabel>
        </Cell>

        <Cell col={3} row={1}>
          <HeaderLabel>Type</HeaderLabel>
        </Cell>

        <Cell col={4} row={1}>
          <HeaderLabel>Mentions</HeaderLabel>
        </Cell>
      </TableHeader>
      <TableContent>
        {suggestions.map((s) => (
          <SuggestionRow
            key={getClusterKey(s.first) + '-' + getClusterKey(s.second)}
            suggestion={s}
            taxonomy={taxonomy}
            onEdit={onEdit}
            onMerge={onMerge}
          />
        ))}
      </TableContent>
    </Table>
  );
}

type SuggestionRowProps = {
  suggestion: Suggestion;
  taxonomy: { [x: string]: FlatTreeNode };
  onEdit: (keep: ClusterWithDocId, mergeAway: ClusterWithDocId) => void;
  onMerge: () => void;
};
function SuggestionRow({
  suggestion,
  taxonomy,
  onEdit,
  onMerge,
}: SuggestionRowProps) {
  const { first, second } = suggestion;
  return (
    <TableRow>
      <ConnectorTop aria-hidden />
      <ConnectorBottom aria-hidden />
      {[second, first].map((e, i) => (
        <Fragment key={getClusterKey(e)}>
          <Cell row={i + 1} col={2}>
            <EntityName title={e.title}>{e.title}</EntityName>
          </Cell>
          <Cell row={i + 1} col={3}>
            <EntityTypeTag
              color={getAllNodeData(taxonomy, e.type).color}
              label={e.type}
              fontSize="12px"
            />
          </Cell>
          <Cell row={i + 1} col={4}>
            {e.mentions.length}
          </Cell>
        </Fragment>
      ))}

      <Cell row={1} col={5}>
        <ActionButtonContainer>
          <ActionButton onPress={() => onEdit(first, second)} isIconOnly>
            <FiEdit2 />
          </ActionButton>
        </ActionButtonContainer>
      </Cell>

      <Cell row={2} col={5}>
        <ActionButtonContainer>
          <ActionButton onPress={onMerge} color="primary" isIconOnly>
            <FiCheck />
          </ActionButton>
        </ActionButtonContainer>
      </Cell>
    </TableRow>
  );
}

// Arrow - Name - Type - # Mentions - Buttons
const COLUMNS = '40px minmax(0, 1fr) 200px 100px 96px';

const Table = styled.div`
  width: 100%;
`;

const TableHeader = styled.div`
  display: grid;
  grid-template-columns: ${COLUMNS};
  background-color: #fbfbfa;
  padding: 12px 0px;
  border-bottom: 1px solid #e3e1dc;
`;

const HeaderLabel = styled.span`
  font-size: 14px;
  font-weight: var(--font-bold);
`;

const Cell = styled.div<{ col: number; row: number }>`
  grid-row: ${(props) => props.row};
  grid-column: ${(props) => props.col};
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
`;

const TableContent = styled.div``;

const TableRow = styled.div`
  display: grid;
  grid-template-columns: ${COLUMNS};
  grid-template-rows: auto auto;
  padding: 12px 0px;
  border-bottom: 1px solid #e3e1dc;
`;

const EntityName = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: var(--font-semibold);
  font-size: 16px;
`;

const ActionButtonContainer = styled.div`
  width: 100%;
  display: flex;
  justify-content: end;
`;

const ActionButton = styled(Button)`
  height: 30px;
  margin: 4px 0px;
`;

const CONNECTOR_COLOR = '#d1d1d1';
const ARROW_MARGIN_LEFT = '10px';
const ARROW_MARGIN_RIGHT = '10px';

const ConnectorBase = styled.div`
  grid-column: 1;
  position: relative;
  pointer-events: none;

  &::before {
    content: '';
    box-sizing: border-box;
    position: absolute;

    left: ${ARROW_MARGIN_LEFT};
    right: ${ARROW_MARGIN_RIGHT};

    // Set the color for later
    border: 0 solid ${CONNECTOR_COLOR};
  }
`;

// Arrow tail
const ConnectorTop = styled(ConnectorBase)`
  grid-row: 1;

  &::before {
    // Starts in the middle of the first row
    // to match the position of the entity name
    top: calc(50% - 1px);
    bottom: 0;

    border-width: 2px 0 0 2px;

    border-top-left-radius: 4px;
  }
`;

// Arrow head
const ConnectorBottom = styled(ConnectorBase)`
  grid-row: 2;

  &::before {
    top: 0;
    // Goes down to half the row
    bottom: calc(50% - 1px);
    border-width: 0 0 2px 2px;
    border-bottom-left-radius: 4px;
  }

  // Actual head of the arrow
  &::after {
    content: '';
    position: absolute;
    right: ${ARROW_MARGIN_RIGHT};
    top: 50%;
    width: 8px;
    height: 8px;
    box-sizing: border-box;

    // Rotate the square to simulate the arrow point
    transform: translateY(-50%) rotate(45deg);
    border: solid ${CONNECTOR_COLOR};
    border-width: 2px 2px 0 0;
  }
`;
