import styled from '@emotion/styled';
import {
  AutocompleteItem,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Spinner,
} from '@heroui/react';
import { ClusterWithDocId, Suggestion } from '../types';
import { collectionDocInfo } from '@/server/routers/collection';
import { useEffect, useState } from 'react';
import { useDocumentClusters } from '../useDocumentClusters';
import { StyledAutocomplete } from '../../../../components/StyledAutocomplete/StyledAutocomplete';
import { getAutocompleteKey } from './utils';
import { MergeClustersEntry } from './MergeClustersEntry';
import { token_set_ratio } from 'fuzzball';

type MergeClustersDrawerProps = {
  isOpen: boolean;
  onOpenChange: () => void;
  docsInCollection: collectionDocInfo[];
  selectedDocumentInBrowser?: collectionDocInfo;
  sourceCluster?: ClusterWithDocId;
};

export function MergeClustersDrawer({
  isOpen,
  onOpenChange,
  docsInCollection,
  selectedDocumentInBrowser,
  sourceCluster,
}: MergeClustersDrawerProps) {
  const [selectedDocument, setSelectedDocument] = useState<
    collectionDocInfo | undefined
  >(selectedDocumentInBrowser);

  const [suggestions, setSuggestions] = useState<Suggestion[]>();
  const [isComputingSuggestions, setIsComputingSuggestions] =
    useState<boolean>(false);

  const [firstClusterKey, setFirstClusterKey] = useState<string | null>(null);
  const [secondClusterKey, setSecondClusterKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedDocument(selectedDocumentInBrowser);

      // Reset selected keys
      setFirstClusterKey(getAutocompleteKey(sourceCluster ?? null));
      setSecondClusterKey(null);
    }
  }, [isOpen, sourceCluster, selectedDocumentInBrowser]);

  // Fetch clusters every time the selected document changes
  const { clusters, taxonomy } = useDocumentClusters(selectedDocument?.id);

  const SIMILARITY_THRESHOLD = 0.95;
  useEffect(() => {
    if (!isOpen || !selectedDocument || clusters.length === 0) {
      setIsComputingSuggestions(false);
      return;
    }

    setSuggestions([]);
    setIsComputingSuggestions(true);

    const worker = new Worker(
      new URL('./stringSimilarityWorker.ts', import.meta.url)
    );

    worker.onmessage = (e) => {
      setSuggestions(e.data);
      setIsComputingSuggestions(false);
    };

    worker.postMessage({ clusters, threshold: SIMILARITY_THRESHOLD });

    return () => worker.terminate();
  }, [isOpen, clusters]);

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
    <StyledDrawer
      isOpen={isOpen}
      size="5xl"
      onOpenChange={onOpenChange}
      backdrop="opaque"
    >
      <DrawerContent>
        <StyledDrawerHeader>
          <h1>Merge Entities</h1>
          <p>Pick two entities: the second one will merge into the first.</p>
        </StyledDrawerHeader>
        <StyledDrawerBody>
          <DocumentSelectionContainer>
            <p>Document</p>
            <StyledAutocomplete
              placeholder="Select a document"
              aria-label="Select a document"
              defaultInputValue={selectedDocumentInBrowser?.name}
              defaultSelectedKey={selectedDocumentInBrowser?.id}
              onSelectionChange={(key) =>
                handleDocumentSelection(key as string | null)
              }
              variant="bordered"
              className="w-56"
            >
              {docsInCollection.map((d) => (
                <AutocompleteItem key={d.id}>{d.name}</AutocompleteItem>
              ))}
            </StyledAutocomplete>
          </DocumentSelectionContainer>
          <div>
            <SectionTitle>Merge Manually</SectionTitle>
            <MergeClustersEntry
              clusters={clusters}
              firstPlaceholder="Keep"
              secondPlaceholder="Merge away"
              taxonomy={taxonomy}
              firstClusterKey={firstClusterKey}
              setFirstClusterKey={setFirstClusterKey}
              secondClusterKey={secondClusterKey}
              setSecondClusterKey={setSecondClusterKey}
              onMerge={() => {}}
            />
          </div>
          <Separator />
          <div>
            <SectionTitle>Suggested</SectionTitle>
            {isComputingSuggestions ? (
              <Spinner />
            ) : (
              suggestions?.map((s, i) => (
                <MergeClustersEntry
                  key={i}
                  clusters={clusters}
                  firstPlaceholder="Keep"
                  secondPlaceholder="Merge Away"
                  taxonomy={taxonomy}
                  firstClusterKey={getAutocompleteKey(s.first)}
                  secondClusterKey={getAutocompleteKey(s.second)}
                  onMerge={() => {}}
                  isSelectionEnabled={false}
                />
              ))
            )}
          </div>
        </StyledDrawerBody>
      </DrawerContent>
    </StyledDrawer>
  );
}

const StyledDrawer = styled(Drawer)`
  border-radius: 0px;
`;

const StyledDrawerHeader = styled(DrawerHeader)`
  display: flex;
  flex-direction: column;

  border-bottom: 2px solid var(--muted);

  h1 {
    font-size: 24px;
  }

  p {
    font-size: 14px;
    font-weight: var(--font-regular);
    color: var(--muted-foreground);
  }
`;

const StyledDrawerBody = styled(DrawerBody)`
  padding: 32px 32px;
  display: flex;
  flex-direction: column;
  gap: 32px;
`;

const DocumentSelectionContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: center;
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: var(--font-bold);
`;

const Separator = styled.div`
  height: 2px;
  background-color: var(--muted);
`;
