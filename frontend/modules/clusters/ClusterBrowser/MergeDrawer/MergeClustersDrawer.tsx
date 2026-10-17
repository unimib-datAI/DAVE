import styled from '@emotion/styled';
import {
  addToast,
  AutocompleteItem,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  useDisclosure,
} from '@heroui/react';
import { ClusterWithDocId, MergePair } from '../types';
import { collectionDocInfo } from '@/server/routers/collection';
import { useEffect, useRef, useState } from 'react';
import { useDocumentClusters } from '../useDocumentClusters';
import { StyledAutocomplete } from '../../../../components/StyledAutocomplete/StyledAutocomplete';
import { MergeClustersEntry } from './MergeClustersEntry';
import ConfirmMergeModal from './ConfirmMergeModal';
import { useText } from '@/components';
import { useContext as useTrpcContext, useMutation } from '@/utils/trpc';
import { useAtom } from 'jotai';
import { activeCollectionAtom } from '@/atoms/collection';
import { useSession } from 'next-auth/react';
import SuggestionsList from './SuggestionsList';

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
  // Translations
  const t = useText('clusters');

  // Get collection ID for merge functionality
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;

  // User info for merge functionality
  const { data: session } = useSession();
  const token = session?.accessToken;

  // TRPC hooks for string similarity calcs
  const trpcContext = useTrpcContext();
  const merge = useMutation('document.mergeClusters');

  // Confirm modal
  const {
    isOpen: isModalOpen,
    onOpen: onModalOpen,
    onOpenChange: onModalOpenChange,
  } = useDisclosure();

  // Need this to scroll to this section when user
  // wants to edit suggestion
  const manualMergeSectionRef = useRef<HTMLDivElement>(null);

  const [selectedDocument, setSelectedDocument] = useState<
    collectionDocInfo | undefined
  >(selectedDocumentInBrowser);

  // Values for manual selection of clusters to merge
  const [firstCluster, setFirstCluster] = useState<ClusterWithDocId | null>(
    null
  );
  const [secondCluster, setSecondCluster] = useState<ClusterWithDocId | null>(
    null
  );

  // Need this to trigger the computation of suggestions only when
  // the opening animation has ended, otherwise the animation will
  // lag due to the rendering of the suggestions
  const [isOpeningAnimationComplete, setIsOpeningAnimationComplete] =
    useState<boolean>(false);

  // Pair that is set to be merged. Need a separate state because
  // suggestions can be merged without being inserted in the autocompletes
  // Using the other cluster states would also change the values selected in
  // the autocompletes.
  const [pendingMergePair, setPendingMergePair] = useState<MergePair | null>(
    null
  );

  // Fetch clusters every time the selected document changes
  const {
    clusters,
    taxonomy,
    isLoading: isLoadingClusters,
  } = useDocumentClusters(selectedDocument?.id);

  useEffect(() => {
    if (isOpen) {
      setSelectedDocument(selectedDocumentInBrowser);

      // Reset selected clusters
      setFirstCluster(sourceCluster ?? null);
      setSecondCluster(null);
    } else {
      // Clean up the state of the drawer
      setIsOpeningAnimationComplete(false);
    }
  }, [isOpen, sourceCluster, selectedDocumentInBrowser]);

  // Event handlers
  const handleDocumentSelection = (key: string | null) => {
    if (key === selectedDocument?.id) return;

    setFirstCluster(null);
    setSecondCluster(null);

    if (key === null) {
      setSelectedDocument(undefined);
      return;
    }

    const newDoc = docsInCollection.find((d) => d.id === key);
    setSelectedDocument(newDoc);
  };

  const onEditSuggestion = (
    keep: ClusterWithDocId,
    mergeAway: ClusterWithDocId
  ) => {
    manualMergeSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    setFirstCluster(keep);
    setSecondCluster(mergeAway);
  };

  const onMergePress = (
    keep: ClusterWithDocId,
    mergeAway: ClusterWithDocId
  ) => {
    setPendingMergePair({ keep, mergeAway });
    onModalOpen();
  };

  const onMergeConfirm = () => {
    if (!collectionId || !selectedDocument || !pendingMergePair) {
      addToast({
        title: t('merge.toast.failTitle'),
        description: t('merge.toast.failMessage'),
        color: 'danger',
        variant: 'solid',
        radius: 'sm',
        timeout: 5000,
      });
      return;
    }

    merge.mutate(
      {
        collectionId,
        docId: selectedDocument?.id,
        keepClusterId: pendingMergePair?.keep.id,
        mergeAwayClusterId: pendingMergePair?.mergeAway.id,
        token,
      },
      {
        onSuccess: () => {
          addToast({
            title: t('merge.toast.successTitle'),
            description: t.tRich('merge.toast.successMessage', {
              source: pendingMergePair.mergeAway.title,
              destination: pendingMergePair.keep.title,
            }),
            color: 'success',
            variant: 'solid',
            radius: 'sm',
            timeout: 5000,
          });

          // Refetch the document
          trpcContext.invalidateQueries(['document.getDocument']);

          // Reset state of autocompletes
          setFirstCluster(null);
          setSecondCluster(null);
          setPendingMergePair(null);
        },
        onError: () => {
          addToast({
            title: t('merge.toast.failTitle'),
            description: t.tRich('merge.toast.failMessageWithClusters', {
              source: pendingMergePair.mergeAway.title,
              destination: pendingMergePair.keep.title,
            }),
            color: 'danger',
            variant: 'solid',
            radius: 'sm',
            timeout: 5000,
          });
        },
      }
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
    <>
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
            <h1>{t('merge.title')}</h1>
            <Subtitle>{t('merge.description')}</Subtitle>
          </StyledDrawerHeader>
          <StyledDrawerBody>
            <DocumentSelectionContainer>
              <p>{t('merge.document')}</p>
              <StyledAutocomplete
                placeholder={t('merge.documentSelectionPlaceholder')}
                aria-label={t('merge.documentSelectionPlaceholder')}
                defaultInputValue={selectedDocumentInBrowser?.name}
                defaultSelectedKey={selectedDocumentInBrowser?.id}
                onSelectionChange={(key: string | null) =>
                  handleDocumentSelection(key)
                }
                variant="bordered"
                className="w-56"
                listboxProps={{
                  emptyContent: t('merge.noDocumentFound'),
                }}
              >
                {docsInCollection.map((d) => (
                  <AutocompleteItem key={d.id}>{d.name}</AutocompleteItem>
                ))}
              </StyledAutocomplete>
            </DocumentSelectionContainer>
            <Separator />
            <Section ref={manualMergeSectionRef}>
              <SectionTitle>Merge Manually</SectionTitle>
              <SectionContent>
                <MergeClustersEntry
                  clusters={clusters}
                  taxonomy={taxonomy}
                  firstCluster={firstCluster}
                  setFirstCluster={setFirstCluster}
                  secondCluster={secondCluster}
                  setSecondCluster={setSecondCluster}
                  onMerge={() => {
                    if (firstCluster && secondCluster)
                      onMergePress(firstCluster, secondCluster);
                  }}
                />
              </SectionContent>
            </Section>
            <Separator />
            <Section>
              <SectionTitle>Suggested</SectionTitle>
              <Subtitle>{t('merge.suggestionsSubtitle')}</Subtitle>
              <SectionContent>
                <SuggestionsList
                  clusters={clusters}
                  taxonomy={taxonomy}
                  enabled={
                    isOpen && isOpeningAnimationComplete && !isLoadingClusters
                  }
                  onEditSuggestion={onEditSuggestion}
                  onMergePress={onMergePress}
                />
              </SectionContent>
            </Section>
          </StyledDrawerBody>
        </DrawerContent>
      </StyledDrawer>
      <ConfirmMergeModal
        isOpen={isModalOpen}
        onOpenChange={onModalOpenChange}
        onMergeConfirm={onMergeConfirm}
        keep={pendingMergePair?.keep ?? null}
        mergeAway={pendingMergePair?.mergeAway ?? null}
      />
    </>
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

const SectionContent = styled.div`
  padding: 24px 0px;
`;

const Separator = styled.div`
  height: 2px;
  flex-shrink: 0;
  background-color: var(--muted);
`;
