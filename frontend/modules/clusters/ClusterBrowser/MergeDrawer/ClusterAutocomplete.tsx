import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { ClusterWithDocId } from '../types';
import { AutocompleteItem } from '@heroui/react';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import { StyledAutocomplete } from '@/components/StyledAutocomplete/StyledAutocomplete';
import { getClusterKey, getInfoFromClusterKey } from './utils';

type ClusterAutocompleteProps = {
  clusters: ClusterWithDocId[];
  selectedCluster: ClusterWithDocId | null;
  setSelectedCluster: (c: ClusterWithDocId | null) => void;
  taxonomy: { [x: string]: FlatTreeNode };
};

export function ClusterAutocomplete({
  clusters,
  selectedCluster,
  setSelectedCluster,
  taxonomy,
}: ClusterAutocompleteProps) {
  return (
    <StyledAutocomplete
      placeholder="Select an entity"
      selectedKey={getClusterKey(selectedCluster)}
      onSelectionChange={(key) => {
        const info = getInfoFromClusterKey(key as string | null);
        const found = clusters.find(
          (c) => c.id === info?.clusterId && c.docId === info.docId
        );
        setSelectedCluster(found ?? null);
      }}
      variant="bordered"
      aria-label="Select an entity"
    >
      {clusters.map((c) => (
        <AutocompleteItem
          key={getClusterKey(c)}
          startContent={
            <EntityTypeTag
              label={c.type}
              color={getAllNodeData(taxonomy, c.type).color}
              fontSize="12px"
            />
          }
        >
          {c.title}
        </AutocompleteItem>
      ))}
    </StyledAutocomplete>
  );
}
