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

const ClustersPage: NextPage = () => {
  const router = useRouter();
  const collectionId = router.query.id as string;
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

  // Get the selected document's entities
  const { data: documentData } = useQuery(
    ['document.getDocument', { id: selectedDocId ?? '' }],
    { enabled: !!selectedDocId }
  );

  // Group entities by type
  const clusters = documentData?.features.clusters['entities_'] ?? [];
  const clusterGroups = groupBy(clusters, (c) => c.type);

  // Get entities of the selected type
  const entitiesForType = selectedType ? clusterGroups[selectedType] : [];

  // Get document context for each mention of the current entity
  const annotations = documentData?.annotation_sets['entities_'].annotations;
  const MENTION_PADDING = 30;
  const mentionsForSelectedEntity =
    selectedEntity && documentData
      ? selectedEntity.mentions.map((m) => {
          // For each mention for selected entity, find corresponding
          // mention in the document
          const ann = annotations?.find((ann) => ann.id === m.id);
          if (!ann) return { ...m, context: m.mention };

          // Extract the sentence context from the document
          const start = Math.max(0, ann.start - MENTION_PADDING);
          const end = Math.min(
            documentData?.text.length,
            ann.end + MENTION_PADDING
          );
          const context = '...' + documentData?.text.slice(start, end) + '...';
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
    console.log(e);
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
                {/* {[...Array(50)].map((i) => {
                  return <ListItem key={i}>prova</ListItem>;
                })} */}
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
                      {e.title}
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
  height: calc(100vh - 48px);
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
  font-weight: 500;
  background-color: #f4f4f5;
`;

const Message = styled.p`
  color: #949597;
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

  &[data-selected='true'] {
    background-color: hsl(var(--primary));
    color: white;
    border-radius: 8px;
  }
`;
