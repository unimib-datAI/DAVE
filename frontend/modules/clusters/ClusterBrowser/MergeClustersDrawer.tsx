import styled from '@emotion/styled';
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from '@heroui/react';
import { ClusterWithDocId } from './types';
import { collectionDocInfo } from '@/server/routers/collection';
import { useEffect, useState } from 'react';
import { useDocumentClusters } from './useDocumentClusters';

type MergeClustersDrawerProps = {
  isOpen: boolean;
  onOpenChange: () => void;
  docsInCollection: collectionDocInfo[];
  selectedDocumentInBrowser?: collectionDocInfo;
};

export function MergeClustersDrawer({
  isOpen,
  onOpenChange,
  docsInCollection,
  selectedDocumentInBrowser,
}: MergeClustersDrawerProps) {
  // State
  const [selectedDocument, setSelectedDocument] = useState<
    collectionDocInfo | undefined
  >(selectedDocumentInBrowser);

  useEffect(() => {
    setSelectedDocument(selectedDocumentInBrowser);
  }, [selectedDocumentInBrowser]);

  const [firstClusterKey, setfirstClusterKey] = useState<string | null>(null);
  const [secondClusterKey, setSecondClusterKey] = useState<string | null>(null);

  // Fetch clusters every time the selected document changes
  console.log(selectedDocument?.id);
  const { clusters } = useDocumentClusters(selectedDocument?.id);

  // Event handlers
  const handleDocumentSelection = (key: string | null) => {
    if (key === selectedDocument?.id) return;

    const newDoc = docsInCollection.find((d) => d.id === key);
    if (!newDoc) return;

    setfirstClusterKey(null);
    setSecondClusterKey(null);

    setSelectedDocument(newDoc);
  };

  return (
    <StyledDrawer isOpen={isOpen} onOpenChange={onOpenChange} backdrop="opaque">
      <DrawerContent>
        <DrawerHeader>Merge Clusters</DrawerHeader>
        <DrawerBody>
          <Autocomplete
            label="Select a document"
            defaultInputValue={selectedDocumentInBrowser?.name}
            defaultSelectedKey={selectedDocumentInBrowser?.id}
            onSelectionChange={(key) =>
              handleDocumentSelection(key as string | null)
            }
          >
            {docsInCollection.map((d) => (
              <AutocompleteItem key={d.id}>{d.name}</AutocompleteItem>
            ))}
          </Autocomplete>
          <ClusterAutocomplete
            clusters={clusters}
            label="Select a cluster"
            selectedKey={firstClusterKey}
            setSelectedKey={setfirstClusterKey}
          />
          <ClusterAutocomplete
            clusters={clusters}
            label="Select a cluster"
            selectedKey={secondClusterKey}
            setSelectedKey={setSecondClusterKey}
          />
          <Button isDisabled={!firstClusterKey || !secondClusterKey}>
            Merge
          </Button>
        </DrawerBody>
      </DrawerContent>
    </StyledDrawer>
  );
}

type ClusterAutocompleteProps = {
  clusters: ClusterWithDocId[];
  label: string;
  selectedKey: string | null;
  setSelectedKey: (key: string | null) => void;
};

function ClusterAutocomplete({
  clusters,
  label,
  selectedKey,
  setSelectedKey,
}: ClusterAutocompleteProps) {
  return (
    <Autocomplete
      label={label}
      selectedKey={selectedKey}
      onSelectionChange={(key) => setSelectedKey(key as string | null)}
    >
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
