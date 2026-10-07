import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { ClusterWithDocId } from '../types';
import { AutocompleteItem } from '@heroui/react';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import { StyledAutocomplete } from '@/components/StyledAutocomplete/StyledAutocomplete';
import { getAutocompleteKey } from './utils';

type ClusterAutocompleteProps = {
  clusters: ClusterWithDocId[];
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  taxonomy: { [x: string]: FlatTreeNode };
  isEnabled: boolean;
};

export function ClusterAutocomplete({
  clusters,
  selectedKey,
  setSelectedKey,
  taxonomy,
  isEnabled,
}: ClusterAutocompleteProps) {
  return (
    <StyledAutocomplete
      placeholder="Select an entity"
      selectedKey={selectedKey}
      onSelectionChange={(key) => setSelectedKey(key as string | null)}
      variant="bordered"
      isDisabled={!isEnabled}
      aria-label="Select an entity"
    >
      {clusters.map((c) => (
        <AutocompleteItem
          key={getAutocompleteKey(c)}
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
