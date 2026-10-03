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
import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { EntityTypeTag } from '@/components/EntityTypeTag';

type MergeClustersDrawerProps = {
  isOpen: boolean;
  onOpenChange: () => void;
  docsInCollection: collectionDocInfo[];
  selectedDocumentInBrowser?: collectionDocInfo;
  sourceCluster?: ClusterWithDocId;
};

const getAutocompleteKey = (c: ClusterWithDocId | null) => {
  if (!c) return null;
  return `${c.docId}-${c.id}`;
};

export function MergeClustersDrawer({
  isOpen,
  onOpenChange,
  docsInCollection,
  selectedDocumentInBrowser,
  sourceCluster,
}: MergeClustersDrawerProps) {
  // State
  const [selectedDocument, setSelectedDocument] = useState<
    collectionDocInfo | undefined
  >(selectedDocumentInBrowser);

  const [firstClusterKey, setFirstClusterKey] = useState<string | null>(null);
  const [secondClusterKey, setSecondClusterKey] = useState<string | null>(null);

  useEffect(() => {
    // If the drawer has just been opened
    if (isOpen) {
      setSelectedDocument(selectedDocumentInBrowser);

      // Reset selected keys
      setFirstClusterKey(getAutocompleteKey(sourceCluster ?? null));
      setSecondClusterKey(null);
    }
  }, [isOpen, sourceCluster, selectedDocument]);

  // Fetch clusters every time the selected document changes
  const { clusters, taxonomy } = useDocumentClusters(selectedDocument?.id);

  // Event handlers
  const handleDocumentSelection = (key: string | null) => {
    if (key === selectedDocument?.id) return;

    const newDoc = docsInCollection.find((d) => d.id === key);
    if (!newDoc) return;

    setFirstClusterKey(null);
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
            setSelectedKey={setFirstClusterKey}
            taxonomy={taxonomy}
          />
          <ClusterAutocomplete
            clusters={clusters}
            label="Select a cluster"
            selectedKey={secondClusterKey}
            setSelectedKey={setSecondClusterKey}
            taxonomy={taxonomy}
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
  taxonomy: { [x: string]: FlatTreeNode };
};

function ClusterAutocomplete({
  clusters,
  label,
  selectedKey,
  setSelectedKey,
  taxonomy,
}: ClusterAutocompleteProps) {
  return (
    <Autocomplete
      label={label}
      selectedKey={selectedKey}
      onSelectionChange={(key) => setSelectedKey(key as string | null)}
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
    </Autocomplete>
  );
}

const StyledDrawer = styled(Drawer)`
  border-radius: 0px;
`;
