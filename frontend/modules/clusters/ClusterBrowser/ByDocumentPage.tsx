import { ToolbarLayout, useText } from '@/components';
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

type ByDocumentPageProps = {
  docsInfo: collectionDocInfo[];
};

export function ByDocumentPage({ docsInfo }: ByDocumentPageProps) {
  const t = useText('clusters');
  // Browser state
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
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
            return { ...m, start: 0, end: m.mention.length, context: '', documentId : documentData.id };

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
            documentId: documentData.id
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
    <MultiPane>
      <DocumentList
        selectedDocId={selectedDocId}
        onDocumentSelection={handleDocumentSelection}
        docsInfo={docsInfo}
      />
      <EntityTypesList
        isEmpty={!selectedDocId || Object.keys(clusterGroups).length === 0}
        emptyMessage={
          !selectedDocId ? t('selectDocument') : t('noEntitiesFound')
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
  );
}
