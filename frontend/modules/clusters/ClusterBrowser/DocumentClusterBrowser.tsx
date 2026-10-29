import { useText } from '@/components';
import { MultiPane } from '@/components/MultiPane';
import { useEffect, useState } from 'react';
import { groupBy } from '@/utils/shared';
import { Cluster } from '@/server/routers/document';
import { collectionDocInfo } from '@/server/routers/collection';
import { getMentionContext } from '@/utils/mentionContext';
import { MergeClustersDrawer } from '@/modules/clusters/ClusterBrowser';
import { ClusterWithDocId, Mention } from './types';
import { DocumentList } from './lists/DocumentList';
import { EntityTypesList } from './lists/EntityTypesList';
import { EntityList } from './lists/EntityList';
import { MentionsList } from './lists/MentionsList';
import useDocumentClusters from './useDocumentClusters';

type DocumentClusterBrowserProps = {
  docsInfo: collectionDocInfo[];
  collectionId: string | undefined;
  isDrawerOpen: boolean;
  onDrawerChange: () => void;
  openDrawer: () => void;
};

export function DocumentClusterBrowser({
  docsInfo,
  collectionId,
  isDrawerOpen,
  onDrawerChange,
  openDrawer,
}: DocumentClusterBrowserProps) {
  const t = useText('clusters');

  // Cluster Browser state
  const [selectedDoc, setSelectedDoc] = useState<
    collectionDocInfo | undefined
  >();
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<Cluster | undefined>();

  // Need this to set the source cluster for the merge functionality
  // when clicking the merge button in the EntityList
  const [sourceCluster, setSourceCluster] = useState<
    ClusterWithDocId | undefined
  >();

  useEffect(() => {
    // Source cluster needs to be consumed once the drawer is opened
    // to prevent the next opening of the drawer through the button
    // in the toolbar to still have the old sourceCluster selected,
    // even tho no cluster was actually selected through the button
    // on its row
    if (!isDrawerOpen) {
      setSourceCluster(undefined);
    }
  }, [isDrawerOpen]);

  /*
    WORKFLOW:
    1. Given a document, get the info about it (documentData)
    2. Group entities in the document based on their type (clusterGroups)
    3. Given a selected type, filter the document's entities to match that type
    4. Given a selected entity, cross reference document's annotation and
    mentions for selected entity to get an accurate list of mentions
    for that specific entity
  */

  const { documentData, taxonomy, annotations, clusters } = useDocumentClusters(
    selectedDoc?.id,
    collectionId
  );

  // Group entities by type
  const clusterGroups: Record<string, Cluster[]> = groupBy(
    clusters,
    (c) => c.type
  );

  // Get entities of the selected type.
  // Order alphabetically based on the name of the entity
  const entitiesForSelectedType: Cluster[] = selectedType
    ? [...(clusterGroups[selectedType] ?? [])].sort((c1, c2) =>
        c1.title.localeCompare(c2.title)
      )
    : [];

  // The selected entity as in the current data: it changes when the document is
  // refetched, e.g. its title when switching between anonymized and not
  const currentEntity =
    clusters.find((c) => c.id === selectedEntity?.id) ?? selectedEntity;

  // Get document context for each mention of the current entity
  const mentionsForSelectedEntity: Mention[] =
    currentEntity && documentData
      ? currentEntity.mentions.map((m) => {
          // For each mention for selected entity, find corresponding
          // mention in the document
          const ann = annotations?.find((ann) => ann.id === m.id);
          if (!ann)
            return {
              ...m,
              start: 0,
              end: m.mention.length,
              context: '',
              documentId: documentData.id,
            };

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
            documentId: documentData.id,
          };
        })
      : [];

  // Event handlers
  const handleDocumentSelection = (doc: collectionDocInfo) => {
    if (doc.id === selectedDoc?.id) {
      setSelectedDoc(undefined);
    } else {
      setSelectedDoc(doc);
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

  // This is only for the button that is rendered
  // on the row of a cluster in the list
  const onMergeButtonClick = (c: ClusterWithDocId) => {
    openDrawer();
    setSourceCluster(c);
  };

  return (
    <>
      <MultiPane>
        <DocumentList
          selectedDocId={selectedDoc?.id}
          onDocumentSelection={handleDocumentSelection}
          docsInfo={docsInfo}
        />
        <EntityTypesList
          isEmpty={!selectedDoc?.id || Object.keys(clusterGroups).length === 0}
          emptyMessage={
            !selectedDoc?.id ? t('selectDocument') : t('noEntitiesFound')
          }
          selectedType={selectedType}
          clustersByType={clusterGroups}
          onTypeSelection={handleTypeSelection}
          taxonomy={taxonomy}
        />
        <EntityList
          selectedType={selectedType}
          entities={entitiesForSelectedType}
          selectedEntity={currentEntity}
          onEntitySelection={handleEntitySelection}
          showMergeButton={true}
          onMergeButtonClick={onMergeButtonClick}
        />
        <MentionsList
          selectedEntity={currentEntity}
          mentions={mentionsForSelectedEntity}
        />
      </MultiPane>
      <MergeClustersDrawer
        docsInCollection={docsInfo ?? []}
        collectionId={collectionId}
        selectedDocumentInBrowser={selectedDoc}
        isOpen={isDrawerOpen}
        onOpenChange={onDrawerChange}
        sourceCluster={sourceCluster}
      />
    </>
  );
}
