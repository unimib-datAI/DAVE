import { useText } from '@/components';
import { MultiPane } from '@/components/MultiPane';
import { useQuery } from '@/utils/trpc';
import { useState } from 'react';
import { groupBy } from '@/utils/shared';
import { Cluster } from '@/server/routers/document';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import {
  DocumentList,
  EntityList,
  EntityTypesList,
  MentionsList,
  useDocumentClusters,
} from '@/modules/clusters/ClusterBrowser';
import { collectionDocInfo } from '@/server/routers/collection';
import { getMentionContext } from '@/utils/mentionContext';
import { MergeClustersDrawer } from '@/modules/clusters/ClusterBrowser';
import { Mention } from './types';

type ByDocumentPageProps = {
  docsInfo: collectionDocInfo[];
  isDrawerOpen: boolean;
  onDrawerChange: () => void;
};

export function ByDocumentPage({
  docsInfo,
  isDrawerOpen,
  onDrawerChange,
}: ByDocumentPageProps) {
  const t = useText('clusters');
  // Browser state
  const [selectedDoc, setSelectedDoc] = useState<
    collectionDocInfo | undefined
  >();
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<Cluster | undefined>();

  /*
    1. Given a document, get the info about it (documentData)
    2. Group entities in the document based on their type (clusterGroups)
    3. Given a selected type, filter the document's entities to match that type
    4. Given a selected entity, cross reference document's annotation and
    mentions for selected entity to get an accurate list of mentions
    for that specific entity
  */

  const { documentData, taxonomy, annotations, clusters } = useDocumentClusters(
    selectedDoc?.id
  );

  // Group entities by type
  const clusterGroups: Record<string, Cluster[]> = groupBy(
    clusters,
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
          selectedEntity={selectedEntity}
          onEntitySelection={handleEntitySelection}
        />
        <MentionsList
          selectedEntity={selectedEntity}
          mentions={mentionsForSelectedEntity}
        />
      </MultiPane>
      <MergeClustersDrawer
        docsInCollection={docsInfo ?? []}
        selectedDocumentInBrowser={selectedDoc}
        isOpen={isDrawerOpen}
        onOpenChange={onDrawerChange}
      />
    </>
  );
}
