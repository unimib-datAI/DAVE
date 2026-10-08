import styled from '@emotion/styled';
import { Button } from '@heroui/react';
import { ClusterAutocomplete } from './ClusterAutocomplete';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { ClusterWithDocId } from '../types';
import { FlatTreeNode } from '@/components/Tree';
import { IoMdSwap } from '@react-icons/all-files/io/IoMdSwap';

type MergeClustersEntryProps = {
  clusters: ClusterWithDocId[];
  taxonomy: { [x: string]: FlatTreeNode };
  firstCluster: ClusterWithDocId | null;
  setFirstCluster: (c: ClusterWithDocId | null) => void;
  secondCluster: ClusterWithDocId | null;
  setSecondCluster: (c: ClusterWithDocId | null) => void;
  onMerge: () => void;
};

export function MergeClustersEntry({
  clusters,
  taxonomy,
  firstCluster,
  setFirstCluster,
  secondCluster,
  setSecondCluster,
  onMerge,
}: MergeClustersEntryProps) {
  console.log(clusters);
  const swapButtonHandler = () => {
    const first = firstCluster;
    setFirstCluster(secondCluster);
    setSecondCluster(first);
  };

  return (
    <MergeClustersRow>
      <Cell row={1} col={1}>
        <Label>Keep</Label>
      </Cell>
      <Cell row={1} col={3}>
        <Label>Merge Away</Label>
      </Cell>

      <Cell row={1} col={2}>
        <div className="flex items-center w-full h-full justify-center">
          <FiArrowLeft size={12} />
        </div>
      </Cell>

      <Cell row={2} col={1}>
        <ClusterAutocomplete
          clusters={clusters}
          selectedCluster={firstCluster}
          setSelectedCluster={setFirstCluster}
          taxonomy={taxonomy}
        />
      </Cell>

      <Cell row={2} col={2}>
        <ArrowContainer>
          <Button variant="light" isIconOnly onPress={swapButtonHandler}>
            <IoMdSwap size={24} />
          </Button>
        </ArrowContainer>
      </Cell>

      <Cell row={2} col={3}>
        <ClusterAutocomplete
          clusters={clusters}
          selectedCluster={secondCluster}
          setSelectedCluster={setSecondCluster}
          taxonomy={taxonomy}
        />
      </Cell>

      <Cell row={2} col={4}>
        <ActionsContainer>
          <MergeButton
            isDisabled={!firstCluster || !secondCluster}
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
