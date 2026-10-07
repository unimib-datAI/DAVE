import styled from '@emotion/styled';
import { Button } from '@heroui/react';
import { ClusterAutocomplete } from './ClusterAutocomplete';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { ClusterWithDocId } from '../types';
import { FlatTreeNode } from '@/components/Tree';

type MergeClustersEntryProps = {
  clusters: ClusterWithDocId[];
  taxonomy: { [x: string]: FlatTreeNode };
  firstClusterKey: string | null;
  setFirstClusterKey?: (key: string | null) => void;
  secondClusterKey: string | null;
  setSecondClusterKey?: (key: string | null) => void;
  isSelectionEnabled?: boolean;
  onMerge: () => void;
};

export function MergeClustersEntry({
  clusters,
  taxonomy,
  firstClusterKey,
  setFirstClusterKey,
  secondClusterKey,
  setSecondClusterKey,
  isSelectionEnabled = true,
  onMerge,
}: MergeClustersEntryProps) {
  return (
    <MergeClustersRow>
      <Cell row={1} col={1}>
        <Label>Keep</Label>
      </Cell>
      <Cell row={1} col={3}>
        <Label>Merge Away</Label>
      </Cell>

      <Cell row={2} col={1}>
        <ClusterAutocomplete
          clusters={clusters}
          selectedKey={firstClusterKey}
          setSelectedKey={(key) => setFirstClusterKey?.(key)}
          taxonomy={taxonomy}
          isEnabled={isSelectionEnabled}
        />
      </Cell>

      <Cell row={2} col={2}>
        <ArrowContainer>
          <FiArrowLeft size={24} />
        </ArrowContainer>
      </Cell>

      <Cell row={2} col={3}>
        <ClusterAutocomplete
          clusters={clusters}
          selectedKey={secondClusterKey}
          setSelectedKey={(key) => setSecondClusterKey?.(key)}
          taxonomy={taxonomy}
          isEnabled={isSelectionEnabled}
        />
      </Cell>

      <Cell row={2} col={4}>
        <ActionsContainer>
          <MergeButton
            isDisabled={!firstClusterKey || !secondClusterKey}
            onPress={onMerge}
          >
            Merge
          </MergeButton>
        </ActionsContainer>
      </Cell>
    </MergeClustersRow>
  );
}

const MergeClustersRow = styled.div`
  svg {
    color: var(--muted-foreground);
  }

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
  column-gap: 12px;
  row-gap: 4px;
  margin: 24px 0px;
  align-items: start;
`;

const Cell = styled.div<{ col: number; row: number }>`
  grid-row: ${(props) => props.row};
  grid-column: ${(props) => props.col};
  height: 100%;
`;

const Label = styled.span`
  grid-row: 1;
  font-size: 12px;
  text-transform: uppercase;
  color: var(--muted-foreground);
`;

const ArrowContainer = styled.div`
  height: 100%;
  display: flex;
  align-items: center;
`;

const ActionsContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
`;

const MergeButton = styled(Button)`
  height: 100%;

  background-color: var(--primary);
  color: white;
`;
