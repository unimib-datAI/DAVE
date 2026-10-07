import styled from '@emotion/styled';
import {
  AutocompleteItem,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Spinner,
} from '@heroui/react';
import { ClusterWithDocId, Suggestion } from '../types';
import { collectionDocInfo } from '@/server/routers/collection';
import { useEffect, useRef, useState } from 'react';
import { useDocumentClusters } from '../useDocumentClusters';
import { StyledAutocomplete } from '../../../../components/StyledAutocomplete/StyledAutocomplete';
import { getAutocompleteKey } from './utils';
import { MergeClustersEntry } from './MergeClustersEntry';
import { StringSimilarityWorkerOutput } from './stringSimilarityWorker';

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
  // Constants
  const PAGE_SIZE = 10;
  const SIMILARITY_THRESHOLD = 0.98;

  const [selectedDocument, setSelectedDocument] = useState<
    collectionDocInfo | undefined
  >(selectedDocumentInBrowser);

  // Suggestions for selected document
  const [suggestions, setSuggestions] = useState<Suggestion[]>();
  const [isComputingSuggestions, setIsComputingSuggestions] =
    useState<boolean>(false);

  // Values for manual selection of clusters to merge
  const [firstClusterKey, setFirstClusterKey] = useState<string | null>(null);
  const [secondClusterKey, setSecondClusterKey] = useState<string | null>(null);

  // Used for slicing the actual suggestions list
  const [visibleSuggestionsCount, setVisibleSuggestionsCount] =
    useState<number>(PAGE_SIZE);

  // Need this to trigger the computation of suggestions only when
  // the opening animation has ended, otherwise the animation will
  // lag due to the rendering of the suggestions
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] =
    useState<boolean>(false);

  // Fetch clusters every time the selected document changes
  const { clusters, taxonomy } = useDocumentClusters(selectedDocument?.id);

  useEffect(() => {
    if (isOpen) {
      setSelectedDocument(selectedDocumentInBrowser);

      // Reset suggestions
      setIsComputingSuggestions(true);
      setSuggestions(undefined);

      // Reset selected keys
      setFirstClusterKey(getAutocompleteKey(sourceCluster ?? null));
      setSecondClusterKey(null);
    } else {
      // Clean up the state of the drawer
      setSuggestions(undefined);
      setIsComputingSuggestions(false);
      setIsOpeningAnimationComplete(false);
    }
  }, [isOpen, sourceCluster, selectedDocumentInBrowser]);

  useEffect(() => {
    if (!isOpen || !isOpeningAnimationComplete) return;

    setIsComputingSuggestions(true);
    setSuggestions(undefined);

    if (!selectedDocument || clusters.length === 0) {
      setIsComputingSuggestions(false);
      setSuggestions([]);
      setVisibleSuggestionsCount(PAGE_SIZE);
      return;
    }

    const worker = new Worker(
      new URL('./stringSimilarityWorker.ts', import.meta.url)
    );

    worker.onmessage = (e: MessageEvent<StringSimilarityWorkerOutput[]>) => {
      const suggestions: Suggestion[] = e.data.map((s) => ({
        first: clusters[s.firstIndex],
        second: clusters[s.secondIndex],
        score: s.score,
      }));

      setSuggestions(suggestions);
      setIsComputingSuggestions(false);
      setVisibleSuggestionsCount(PAGE_SIZE);
    };

    worker.postMessage({
      strings: clusters.map((c) => c.title),
      threshold: SIMILARITY_THRESHOLD,
    });

    return () => {
      worker.terminate();
    };
  }, [isOpen, isOpeningAnimationComplete, clusters]);

  const visibleSuggestions = suggestions?.slice(0, visibleSuggestionsCount);

  // Event handlers
  const handleDocumentSelection = (key: string | null) => {
    if (key === selectedDocument?.id) return;

    setFirstClusterKey(null);
    setSecondClusterKey(null);

    if (key === null) {
      setSuggestions([]);
      return;
    }

    const newDoc = docsInCollection.find((d) => d.id === key);
    if (!newDoc) return;
    setSelectedDocument(newDoc);
  };

  // Define suggestion list here for readability
  const SuggestionList = () => {
    if (isComputingSuggestions) {
      return (
        <SuggestionsFeedback>
          <Spinner variant="gradient" />
        </SuggestionsFeedback>
      );
    }

    if (!suggestions || suggestions.length === 0) {
      return (
        <SuggestionsFeedback>
          <Message>No suggestions found.</Message>
        </SuggestionsFeedback>
      );
    }

    const remaining = suggestions.length - visibleSuggestionsCount;

    return (
      <>
        {visibleSuggestions?.map((s) => (
          <MergeClustersEntry
            key={`${s.first.id}-${s.second.id}`}
            clusters={clusters}
            taxonomy={taxonomy}
            firstClusterKey={getAutocompleteKey(s.first)}
            secondClusterKey={getAutocompleteKey(s.second)}
            onMerge={() => {}}
          />
        ))}
        {remaining > 0 && (
          <LoadMoreButton
            onPress={() =>
              setVisibleSuggestionsCount((prev) => prev + PAGE_SIZE)
            }
          >
            Load {Math.min(PAGE_SIZE, remaining)} more
          </LoadMoreButton>
        )}
      </>
    );
  };

  const drawerAnimationProps = {
    enter: {
      x: 0,
      transition: {
        duration: 0.3,
        ease: [0.25, 1, 0.5, 1],
      },
    },
    exit: {
      x: '100%',
      transition: {
        duration: 0.3,
        ease: [0.25, 1, 0.5, 1],
      },
    },
  };

  return (
    <StyledDrawer
      isOpen={isOpen}
      size="full"
      onOpenChange={onOpenChange}
      backdrop="opaque"
      motionProps={{
        variants: drawerAnimationProps,
        onAnimationComplete: () => {
          // If it has just opened, set the flag to true.
          // Needed for triggering the computation of suggestions.
          if (isOpen) {
            setIsOpeningAnimationComplete(true);
          }
        },
      }}
    >
      <DrawerContent>
        <StyledDrawerHeader>
          <h1>Merge Entities</h1>
          <Subtitle>
            Pick two entities: the second one will merge into the first.
          </Subtitle>
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
          <Section>
            <SectionTitle>Merge Manually</SectionTitle>
            <MergeClustersEntry
              clusters={clusters}
              taxonomy={taxonomy}
              firstClusterKey={firstClusterKey}
              setFirstClusterKey={setFirstClusterKey}
              secondClusterKey={secondClusterKey}
              setSecondClusterKey={setSecondClusterKey}
              onMerge={() => {}}
            />
          </Section>
          <Separator />
          <Section>
            <SectionTitle>Suggested</SectionTitle>
            <Subtitle>
              Possible duplicates in the selected document, based on name
              similarity.
            </Subtitle>
            {SuggestionList()}
          </Section>
        </StyledDrawerBody>
      </DrawerContent>
    </StyledDrawer>
  );
}

const StyledDrawer = styled(Drawer)`
  border-radius: 0px;
  width: 50%;
`;

const StyledDrawerHeader = styled(DrawerHeader)`
  display: flex;
  flex-direction: column;

  border-bottom: 2px solid var(--muted);

  h1 {
    font-size: 24px;
  }
`;

const Subtitle = styled.p`
  font-size: 14px;
  font-weight: var(--font-regular);
  color: var(--muted-foreground);
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

const Section = styled.div`
  display: flex;
  flex-direction: column;
`;

const SectionTitle = styled.h2`
  font-size: 18px;
  font-weight: var(--font-bold);
`;

const Separator = styled.div`
  height: 2px;
  flex-shrink: 0;
  background-color: var(--muted);
`;

const SuggestionsFeedback = styled.div`
  width: 100%;
  padding: 36px 0px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const LoadMoreButton = styled(Button)`
  width: fit-content;
  margin: 12px auto;
`;

const Message = styled.p`
  color: var(--muted-foreground);
`;
