import { ToolbarLayout } from '@/components';
import { MultiPane } from '@/components/MultiPane';
import { GetServerSideProps, NextPage } from 'next';
import { useQuery } from '@/utils/trpc';
import { useSession, getSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { useState } from 'react';
import { groupBy } from '@/utils/shared';
import { Cluster } from '@/server/routers/document';
import { activeCollectionAtom } from '@/atoms/collection';
import { useAtom } from 'jotai';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import {
  DocumentList,
  EntityList,
  EntityTypesList,
  Mention,
  MentionsList,
  ModeSelectionTabs,
} from '@/modules/clusters/ClusterBrowser';
import { collectionDocInfo } from '@/server/routers/collection';
import { getMentionContext } from '@/utils/mentionContext';

const PageContainer = styled.div`
  height: calc(100vh - var(--toolbar-height));
  overflow: hidden;
`;

const Mode = {
  document: 'document',
  collection: 'collection',
} as const;

const ClustersPage: NextPage = () => {
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;
  const { data: session } = useSession();

  // Mode selection
  const modes = [
    {
      key: Mode.document,
      label: 'By Document',
    },
    { key: Mode.collection, label: 'Collection' },
  ];
  const [selectedMode, setSelectedMode] = useState<string>(modes[0].key);

  // Browser state
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<Cluster | undefined>();

  // Get document IDs and names in the collection
  const { data: collectionData } = useQuery([
    'collection.getCollectionInfo',
    { id: collectionId ?? '', token: (session as any)?.accessToken },
  ]) as { data: collectionDocInfo[] };

  // Get the selected document's entities
  const { data: documentData } = useQuery(
    ['document.getDocument', { id: selectedDocId ?? '' }],
    { enabled: !!selectedDocId }
  );

  const entityAnnotationSet = Object.values(
    documentData?.annotation_sets ?? []
  ).filter((set) => set.name === 'entities_');

  // Need this to get the correct colors for the types
  const taxonomy = createTaxonomy(baseTaxonomy, entityAnnotationSet);
  const annotations = entityAnnotationSet[0]?.annotations;

  // Some mentions do not have a corresponding
  // annotation in the document. These need to be filtered out.
  const clusters = documentData?.features.clusters['entities_'] ?? [];
  const filteredClusters: Cluster[] = clusters
    .map((c) => ({
      ...c,
      mentions: c.mentions.filter((m) =>
        annotations?.some((ann) => ann.id === m.id)
      ),
    }))
    .filter((c) => c.mentions.length > 0);

  // Group entities by type
  const clusterGroups: Record<string, Cluster[]> = groupBy(
    filteredClusters,
    (c) => c.type
  );

  // Get entities of the selected type.
  // Order alphabetically based on the name of the entity
  const entitiesForSelectedType: Cluster[] = selectedType
    ? clusterGroups[selectedType].sort((c1, c2) =>
        c1.title.localeCompare(c2.title)
      )
    : [];

  // Get document context for each mention of the current entity
  const mentionsForSelectedEntity: Mention[] =
    selectedEntity && documentData
      ? selectedEntity.mentions.map((m) => {
          // For each mention for selected entity, find corresponding
          // mention in the document
          const ann = annotations?.find((ann) => ann.id === m.id);
          if (!ann)
            return { ...m, start: 0, end: m.mention.length, context: 'none' };

          const { context, mentionStart, mentionEnd } = getMentionContext(
            documentData.text,
            ann.start,
            ann.end
          );

          return {
            ...m,
            start: mentionStart,
            end: mentionEnd,
            context,
          };
        })
      : [];

  // Event handlers
  const handleDocumentSelection = (id: string) => {
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
    <ToolbarLayout
      toolbarContent={
        <ModeSelectionTabs
          modes={modes}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
        />
      }
    >
      <PageContainer>
        {selectedMode === Mode.document && (
          <MultiPane>
            <DocumentList
              selectedDocId={selectedDocId}
              onDocumentSelection={handleDocumentSelection}
              docsInfo={collectionData}
            />
            <EntityTypesList
              selectedDocId={selectedDocId}
              selectedType={selectedType}
              clustersByType={clusterGroups}
              onTypeSelection={handleTypeSelection}
              taxonomy={taxonomy}
            />
            <EntityList
              selectedType={selectedType}
              entities={entitiesForSelectedType}
              selectedEntity={selectedEntity}
              onEntitySelection={handleEntitySelection}
            />
            <MentionsList
              selectedEntity={selectedEntity}
              mentions={mentionsForSelectedEntity}
            />
          </MultiPane>
        )}
        {selectedMode === Mode.collection && <div>Collection Mode</div>}
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
