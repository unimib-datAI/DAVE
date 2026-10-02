import { MultiPane } from '@/components/MultiPane';
import { collectionDocInfo } from '@/server/routers/collection';
import {
  AnnotationSet,
  Cluster,
  Document,
  EntityAnnotation,
} from '@/server/routers/document';
import { groupBy } from '@/utils/shared';
import { useQuery } from '@/utils/trpc';
import { EntityTypesList } from './EntityTypesList';
import { useState } from 'react';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import { useText } from '@/components';
import { EntityList } from './EntityList';
import { getMentionContext } from '@/utils/mentionContext';
import { MentionsList } from './MentionsList';
import { ClusterWithDocId, Mention } from './types';

type CollectionPageProps = {
  docsInfo: collectionDocInfo[];
};

export function CollectionPage({ docsInfo }: CollectionPageProps) {
  const t = useText('clusters');
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<
    ClusterWithDocId | undefined
  >();

  const { data: documents } = useQuery([
    'document.getDocuments',
    {
      ids: docsInfo.map((info) => info.id),
    },
  ]);

  // Get all the annotations for each document
  const docAnnotations: Record<number, AnnotationSet<EntityAnnotation>> = {};
  documents?.forEach((doc) => {
    const set = Object.values(doc.annotation_sets).find(
      (set) => set.name === 'entities_'
    );
    if (set) docAnnotations[doc.id] = set;
  });

  // Need this to color entity types
  const taxonomy = createTaxonomy(
    baseTaxonomy,
    Object.values(docAnnotations) ?? []
  );

  // docsCluster[i] -> clusters of document[i]
  const docsClusters: Cluster[][] = [];
  documents?.map((doc) => {
    docsClusters.push(doc.features.clusters['entities_']);
  });

  const newClusters: ClusterWithDocId[] = docsClusters.flatMap((doc, i) => {
    return doc.map((cluster) => {
      return {
        ...cluster,
        docId: documents![i].id,
      };
    });
  });

  // Group by types
  const clustersByType: Record<string, ClusterWithDocId[]> = groupBy(
    newClusters,
    (e) => e.type
  );

  // Get all the clusters for the selected type
  const clustersForSelectedType = selectedType
    ? clustersByType[selectedType].sort((c1, c2) =>
        c1.title.localeCompare(c2.title)
      )
    : [];

  const notFoundMention = (
    id: number,
    mention: string,
    doc?: Document
  ): Mention => ({
    id,
    mention,
    context: '',
    start: 0,
    end: mention.length,
    documentId: doc?.id,
    documentTitle: doc?.name,
  });

  // Get document context for each mention of the current entity
  const mentionsForEntity: Mention[] = selectedEntity
    ? selectedEntity?.mentions.map((m) => {
        if (!selectedEntity.docId) return notFoundMention(m.id, m.mention);

        const foundDoc = documents?.find((d) => d.id === selectedEntity.docId);

        if (!foundDoc) return notFoundMention(m.id, m.mention);

        const annotation = docAnnotations[
          selectedEntity.docId
        ].annotations.find((ann) => ann.id === m.id);

        if (!annotation) return notFoundMention(m.id, m.mention, foundDoc);

        const { context, mentionStart, mentionEnd } = getMentionContext(
          foundDoc.text,
          annotation?.start,
          annotation.end
        );

        return {
          ...m,
          start: mentionStart,
          end: mentionEnd,
          context,
          documentTitle: foundDoc.name,
          documentId: foundDoc.id,
        };
      })
    : [];

  // Event handlers
  const handleTypeSelection = (type: string) => {
    if (type === selectedType) {
      setSelectedType(undefined);
    } else {
      setSelectedType(type);
    }

    setSelectedEntity(undefined);
  };

  const handleEntitySelection = (e: ClusterWithDocId) => {
    if (e.id === selectedEntity?.id && e.docId === selectedEntity.docId) {
      setSelectedEntity(undefined);
    } else {
      setSelectedEntity(e);
    }
  };

  return (
    <MultiPane>
      <EntityTypesList
        isEmpty={Object.keys(clustersByType).length === 0}
        emptyMessage={t('noEntitiesFound')}
        selectedType={selectedType}
        clustersByType={clustersByType}
        onTypeSelection={handleTypeSelection}
        taxonomy={taxonomy}
      />
      <EntityList
        selectedType={selectedType}
        entities={clustersForSelectedType}
        selectedEntity={selectedEntity}
        onEntitySelection={handleEntitySelection}
      />
      <MentionsList
        selectedEntity={selectedEntity}
        mentions={mentionsForEntity}
      />
    </MultiPane>
  );
}
