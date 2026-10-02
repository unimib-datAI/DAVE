import styled from '@emotion/styled';
import {
  Autocomplete,
  AutocompleteItem,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from '@heroui/react';
import { ClusterWithDocId } from './types';
import { collectionDocInfo } from '@/server/routers/collection';

type MergeClustersDrawerProps = {
  isOpen: boolean;
  onOpenChange: () => void;
  docs: collectionDocInfo[];
  selectedDocument?: collectionDocInfo;
  clusters: ClusterWithDocId[];
};

export function MergeClustersDrawer({
  isOpen,
  onOpenChange,
  docs,
  selectedDocument,
  clusters,
}: MergeClustersDrawerProps) {
  return (
    <StyledDrawer isOpen={isOpen} onOpenChange={onOpenChange} backdrop="opaque">
      <DrawerContent>
        <DrawerHeader>Merge Clusters</DrawerHeader>
        <DrawerBody>
          {/* <ClusterAutocomplete clusters={clusters} label="Select a cluster" />
          <ClusterAutocomplete clusters={clusters} label="Select a cluster" />
          Suggested */}
          <Autocomplete
            label="Select a document"
            defaultInputValue={selectedDocument?.name}
            defaultSelectedKey={selectedDocument?.id}
          >
            {docs.map((d) => (
              <AutocompleteItem key={d.id}>{d.name}</AutocompleteItem>
            ))}
          </Autocomplete>
        </DrawerBody>
      </DrawerContent>
    </StyledDrawer>
  );
}

type ClusterAutocompleteProps = {
  clusters: ClusterWithDocId[];
  label: string;
};

function ClusterAutocomplete({ clusters, label }: ClusterAutocompleteProps) {
  console.log(clusters);
  return (
    <Autocomplete label={label}>
      {clusters.map((c) => (
        <AutocompleteItem key={`${c.docId}-${c.id}`}>
          {c.title}
        </AutocompleteItem>
      ))}
    </Autocomplete>
  );
}

const StyledDrawer = styled(Drawer)`
  border-radius: 0px;
`;
