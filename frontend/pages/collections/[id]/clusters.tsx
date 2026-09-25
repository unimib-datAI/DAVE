import { ToolbarLayout } from '@/components';
import { MultiPane } from '@/components/MultiPane';
import { NextPage } from 'next';
import { useQuery } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { useState } from 'react';
import { groupBy } from '@/utils/shared';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiServer } from '@react-icons/all-files/fi/FiServer';
import { FiTag } from '@react-icons/all-files/fi/FiTag';
import { FiFileText } from '@react-icons/all-files/fi/FiFileText';
import { Cluster, Document } from '@/server/routers/document';
import { activeCollectionAtom } from '@/atoms/collection';
import { useAtom } from 'jotai';

const ClustersPage: NextPage = () => {
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;
  const { data: session } = useSession();

  // Component state
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>();
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<Cluster | undefined>();

  // Get document IDs and names in the collection
  const { data: collectionData } = useQuery([
    'collection.getCollectionInfo',
    { id: collectionId ?? '', token: (session as any)?.accessToken },
  ]);
  console.log(collectionData);

  // Get the selected document's entities
  const { data: documentData } = useQuery(
    ['document.getDocument', { id: selectedDocId ?? '' }],
    { enabled: !!selectedDocId }
  );

  const annotations = documentData?.annotation_sets['entities_'].annotations;

  // Some mentions do not have a corresponding
  // annotation in the document. These need to be filtered out.
  const clusters = documentData?.features.clusters['entities_'] ?? [];
  const filteredClusters = clusters
    .map((c) => ({
      ...c,
      mentions: c.mentions.filter((m) =>
        annotations?.some((ann) => ann.id === m.id)
      ),
    }))
    .filter((c) => c.mentions.length > 0);

  // Group entities by type
  const clusterGroups = groupBy(filteredClusters, (c) => c.type);

  // Get entities of the selected type.
  // Order alphabetically based on the name of the entity
  const entitiesForType = selectedType
    ? clusterGroups[selectedType].sort((c1, c2) =>
        c1.title.localeCompare(c2.title)
      )
    : [];

  // Get document context for each mention of the current entity
  const MENTION_PADDING = 30;
  const mentionsForSelectedEntity =
    selectedEntity && documentData
      ? selectedEntity.mentions.map((m) => {
          // For each mention for selected entity, find corresponding
          // mention in the document
          const ann = annotations?.find((ann) => ann.id === m.id);
          if (!ann) return { ...m, context: 'none' };

          // Extract the sentence context from the document
          const start = Math.max(0, ann.start - MENTION_PADDING);
          const end = Math.min(
            documentData?.text.length,
            ann.end + MENTION_PADDING
          );
          const context =
            (start == 0 ? '' : '...') +
            documentData?.text.slice(start, end) +
            (end === documentData?.text.length ? '' : '...');
          return { ...m, context };
        })
      : [];

  // Event handlers
  const handleDocumentSelection = (id: number) => {
    if (id === selectedDocId) {
      setSelectedDocId(undefined);
    } else {
      setSelectedDocId(id);
    }

    setSelectedType(undefined);
    setSelectedEntity(undefined);
  };

  const handleTypeSelection = (type: string) => {
    if (type === selectedType) {
      setSelectedType(undefined);
    } else {
      setSelectedType(type);
    }

    setSelectedEntity(undefined);
  };

  const handleEntitySelection = (e: Cluster) => {
    setSelectedEntity(e);
  };

  return (
    <ToolbarLayout>
      <PageContainer>
        <MultiPane>
          {/* Document selection: optional based on current mode */}
          <Pane>
            <PaneTitle>
              <FiFolder />
              <h2>Documents</h2>
            </PaneTitle>
            <PaneContent>
              {collectionData?.length == 0 && (
                <Message>Collection is empty</Message>
              )}
              <List>
                {(collectionData ?? []).map((doc: Document) => {
                  return (
                    <ListItem
                      key={doc.id}
                      data-selected={doc.id === selectedDocId}
                      onClick={() => handleDocumentSelection(doc.id)}
                    >
                      {doc.name}
                    </ListItem>
                  );
                })}
              </List>
            </PaneContent>
          </Pane>
          {/* Cluster selection */}
          <Pane>
            <PaneTitle>
              <FiServer />
              <h2>Clusters</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedDocId && <Message>Select a document</Message>}
              <List>
                {Object.keys(clusterGroups).map((type) => {
                  return (
                    <ListItem
                      key={type}
                      data-selected={type === selectedType}
                      onClick={() => handleTypeSelection(type)}
                    >
                      {type} ({clusterGroups[type].length})
                    </ListItem>
                  );
                })}
              </List>
            </PaneContent>
          </Pane>
          {/* Entity selection */}
          <Pane>
            <PaneTitle>
              <FiTag />
              <h2>Entity</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedType && <Message>Select an entity type</Message>}
              <List>
                {entitiesForType.map((e) => {
                  return (
                    <ListItem
                      key={e.id}
                      data-selected={selectedEntity?.id === e.id}
                      onClick={() => handleEntitySelection(e)}
                    >
                      {e.title} ({e.mentions.length})
                    </ListItem>
                  );
                })}
              </List>
            </PaneContent>
          </Pane>
          {/* Mention selection */}
          <Pane>
            <PaneTitle>
              <FiFileText />
              <h2>Mention</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedEntity && <Message>Select an entity</Message>}
              <List>
                {mentionsForSelectedEntity.map((m) => {
                  return <ListItem key={m.id}>{m.context}</ListItem>;
                })}
              </List>
            </PaneContent>
          </Pane>
        </MultiPane>
      </PageContainer>
    </ToolbarLayout>
  );
};

export default ClustersPage;

// 48px is the height of the toolbar
const PageContainer = styled.div`
  height: calc(100vh - var(--toolbar-height));
  overflow: hidden;
`;

const Pane = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const PaneContent = styled.div`
  display: flex;
  flex-direction: column;
  padding: 24px 12px;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
`;

const PaneTitle = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 12px 12px;
  font-size: 16px;
  font-weight: var(--font-semibold);
  background-color: var(--muted);
`;

const Message = styled.p`
  color: var(--muted-foreground);
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const ListItem = styled.div`
  padding: 8px 8px;
  cursor: pointer;
  border-radius: 8px;

  &:hover {
    background-color: var(--muted);
  }

  &[data-selected='true'] {
    background-color: var(--primary);
    color: var(--background);
  }
`;
