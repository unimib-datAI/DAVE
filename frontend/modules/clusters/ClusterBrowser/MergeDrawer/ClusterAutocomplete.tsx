import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { ClusterWithDocId } from '../types';
import { AutocompleteItem } from '@heroui/react';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import { StyledAutocomplete } from '@/components/StyledAutocomplete/StyledAutocomplete';
import { getAutocompleteKey } from './utils';

type ClusterAutocompleteProps = {
  clusters: ClusterWithDocId[];
  label: string;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
  taxonomy: { [x: string]: FlatTreeNode };
};

export function ClusterAutocomplete({
  clusters,
  label,
  selectedKey,
  setSelectedKey,
  taxonomy,
}: ClusterAutocompleteProps) {
  return (
    <StyledAutocomplete
      placeholder={label}
      selectedKey={selectedKey}
      onSelectionChange={(key) => setSelectedKey(key as string | null)}
      variant="bordered"
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
