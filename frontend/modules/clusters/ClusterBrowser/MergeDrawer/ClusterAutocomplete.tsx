import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { ClusterWithDocId } from '../types';
import { AutocompleteItem, AutocompleteSection } from '@heroui/react';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import { StyledAutocomplete } from '@/components/StyledAutocomplete/StyledAutocomplete';
import { getClusterKey, getInfoFromClusterKey } from './utils';
import { groupBy } from '@/utils/shared';
import { css } from '@emotion/css';
import { darken } from 'polished';

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
  const grouped = Object.entries(groupBy(clusters, (c) => c.type));

  const headingClass = (color: string) =>
    css`
      && {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        width: 100%;
        padding: 6px 8px;
        border-radius: 8px;
        background: ${color};
        border: 1px solid ${darken(0.05, color)};
        color: ${darken(0.7, color)};
      }
    `;

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
      scrollShadowProps={{
        isEnabled: false,
      }}
      isVirtualized={false}
    >
      {grouped.map(([type, entities]) => (
        <AutocompleteSection
          key={type}
          title={type}
          classNames={{
            heading: headingClass(getAllNodeData(taxonomy, type).color),
          }}
        >
          {entities
            .sort((a, b) => a.title.localeCompare(b.title))
            .map((e) => (
              <AutocompleteItem key={getClusterKey(e)}>
                {e.title}
              </AutocompleteItem>
            ))}
        </AutocompleteSection>
      ))}
    </StyledAutocomplete>
  );
}
