import { ToolbarLayout, useText } from '@/components';
import { MultiPane } from '@/components/MultiPane';
import { GetServerSideProps, NextPage } from 'next';
import { useQuery } from '@/utils/trpc';
import { useSession, getSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { useState } from 'react';
import { groupBy } from '@/utils/shared';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiTag } from '@react-icons/all-files/fi/FiTag';
import { FiFileText } from '@react-icons/all-files/fi/FiFileText';
import { Cluster, Document } from '@/server/routers/document';
import { activeCollectionAtom } from '@/atoms/collection';
import { useAtom } from 'jotai';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import { getAllNodeData } from '@/components/Tree';
import { darken } from 'polished';
import { FiList } from '@react-icons/all-files/fi/FiList';
import { FiFile } from '@react-icons/all-files/fi/FiFile';

const ClustersPage: NextPage = () => {
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;
  const { data: session } = useSession();

  // Translations
  const t = useText('clusters');

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

  const entityAnnotationSet = Object.values(
    documentData?.annotation_sets ?? []
  ).filter((set) => set.name === 'entities_');
  console.log(entityAnnotationSet);

  // Need this to get the correct colors for the types
  const taxonomy = createTaxonomy(baseTaxonomy, entityAnnotationSet);
  const annotations = entityAnnotationSet[0]?.annotations;

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
  const MENTION_PADDING = 60;
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
    if (e.id === selectedEntity?.id) {
      setSelectedEntity(undefined);
    } else {
      setSelectedEntity(e);
    }
  };

  return (
    <ToolbarLayout>
      <PageContainer>
        <MultiPane>
          {/* Document selection: optional based on current mode */}
          <Pane>
            <PaneTitle>
              <FiFolder />
              <h2>{t('documents')}</h2>
            </PaneTitle>
            <PaneContent>
              {collectionData?.length == 0 && (
                <Message>{t('collectionEmpty')}</Message>
              )}
              <List>
                {(collectionData ?? []).map((doc: Document) => {
                  return (
                    <ListItem
                      key={doc.id}
                      data-selected={doc.id === selectedDocId}
                      onClick={() => handleDocumentSelection(doc.id)}
                    >
                      <FiFile />
                      <ItemLabel>{doc.name}</ItemLabel>
                    </ListItem>
                  );
                })}
              </List>
            </PaneContent>
          </Pane>
          {/* Type selection */}
          <Pane>
            <PaneTitle>
              <FiList />
              <h2>{t('types')}</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedDocId && <Message>{t('selectDocument')}</Message>}
              {selectedDocId && Object.keys(clusterGroups).length === 0 && (
                <Message>{t('noEntitiesFound')}</Message>
              )}
              <List>
                {selectedDocId &&
                  Object.keys(clusterGroups).map((type) => {
                    return (
                      <ListItem
                        key={type}
                        onClick={() => handleTypeSelection(type)}
                        data-selected={type === selectedType}
                      >
                        <EntityTypeTag
                          color={getAllNodeData(taxonomy, type).color}
                        >
                          {type}
                        </EntityTypeTag>
                        <NumberLabel>
                          <span>
                            ({clusterGroups[type].length}{' '}
                            {t('entities').toLowerCase()})
                          </span>
                        </NumberLabel>
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
              <h2>{t('entities')}</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedType && <Message>{t('selectType')}</Message>}
              <List>
                {selectedType &&
                  entitiesForType.map((e) => {
                    return (
                      <ListItem
                        key={e.id}
                        data-selected={selectedEntity?.id === e.id}
                        onClick={() => handleEntitySelection(e)}
                      >
                        <FiTag />
                        <ItemLabel>{e.title}</ItemLabel>
                        <NumberLabel>
                          ({e.mentions.length} {t('mentions').toLowerCase()})
                        </NumberLabel>
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
              <h2>{t('mentions')}</h2>
            </PaneTitle>
            <PaneContent>
              {!selectedEntity && <Message>{t('selectEntity')}</Message>}
              <List>
                {selectedEntity &&
                  mentionsForSelectedEntity.map((m) => {
                    return (
                      <Mention key={m.id}>
                        <p>{m.context}</p>
                      </Mention>
                    );
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

// Protect this page - require authentication unless USE_AUTH is false
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'eng';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

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
  padding: 0px;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
`;

const PaneTitle = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 14px;
  font-weight: var(--font-semibold);
  background-color: var(--background);
  color: var(--muted-foreground);
  border-bottom: 2px solid var(--muted);
`;

const Message = styled.p`
  color: var(--muted-foreground);
  text-align: center;
  margin: 24px 0;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
`;

const EntityTypeTag = styled.div`
  background-color: ${(props) => props.color};
  width: fit-content;
  padding: 0px 4px;
  border-radius: 6px;
  color: ${(props) => darken(0.7, props.color ?? '#FFFFFF')} !important;
  font-size: 14px;
  border: 1px solid ${(props) => darken(0.05, props.color ?? '#FFFFFF')};
  margin-right: auto;
`;

const ListItem = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;

  font-size: 16px;

  svg {
    color: var(--muted-foreground);
  }

  &:hover {
    background-color: var(--muted);
  }

  &[data-selected='true'] {
    background-color: var(--primary);
    color: var(--background);

    * {
      color: var(--background);
    }

    svg {
      color: var(--background);
    }
  }
`;

const Mention = styled.div`
  padding: 16px 16px;
  cursor: pointer;
  font-size: 16px;
  border-bottom: 2px solid var(--muted);

  &:hover {
    background-color: var(--muted);
  }
`;

const ItemLabel = styled.span`
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NumberLabel = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 14px;
`;
