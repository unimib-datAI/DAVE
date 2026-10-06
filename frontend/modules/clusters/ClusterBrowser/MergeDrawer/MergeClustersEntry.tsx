import styled from '@emotion/styled';
import { Button } from '@heroui/react';
import { ClusterAutocomplete } from './ClusterAutocomplete';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { ClusterWithDocId } from '../types';
import { FlatTreeNode } from '@/components/Tree';

type MergeClustersEntryProps = {
  clusters: ClusterWithDocId[];
  firstPlaceholder: string;
  secondPlaceholder: string;
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
  firstPlaceholder,
  secondPlaceholder,
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
      <ClusterAutocomplete
        clusters={clusters}
        label={firstPlaceholder}
        selectedKey={firstClusterKey}
        setSelectedKey={(key) => setFirstClusterKey?.(key)}
        taxonomy={taxonomy}
        isEnabled={isSelectionEnabled}
      />
      <FiArrowLeft size={52} />
      <ClusterAutocomplete
        clusters={clusters}
        label={secondPlaceholder}
        selectedKey={secondClusterKey}
        setSelectedKey={(key) => setSecondClusterKey?.(key)}
        taxonomy={taxonomy}
        isEnabled={isSelectionEnabled}
      />
      <MergeButton
        isDisabled={!firstClusterKey || !secondClusterKey}
        onPress={onMerge}
      >
        Merge
      </MergeButton>
    </MergeClustersRow>
  );
}

const MergeClustersRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: 12px;
  margin: 24px 0px;
  height: fit-content;

  svg {
    color: var(--muted-foreground);
  }
`;

const MergeButton = styled(Button)`
  height: auto;
  margin-bottom: 6px;

  background-color: var(--primary);
  color: white;
`;
