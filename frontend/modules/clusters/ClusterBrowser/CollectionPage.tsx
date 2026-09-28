import { MultiPane } from '@/components/MultiPane';
import { collectionDocInfo } from '@/server/routers/collection';
import {
  AnnotationSet,
  Cluster,
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
import { useAtom } from 'jotai';
import { activeCollectionAtom } from '@/atoms/collection';
import { getMentionContext } from '@/utils/mentionContext';
import { Mention, MentionsList } from './MentionsList';

type CollectionPageProps = {
  docsInfo: collectionDocInfo[];
};

export function CollectionPage({ docsInfo }: CollectionPageProps) {
  const t = useText('clusters');
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [selectedEntity, setSelectedEntity] = useState<Cluster | undefined>();

  const { data: documents } = useQuery([
    'document.getDocuments',
    {
      ids: docsInfo.map((info) => info.id),
    },
  ]);

  // docsClusters[i] -> clusters of doc[i]
  const docsClusters: Cluster[][] = [];
  documents?.map((doc) => {
    docsClusters.push(doc.features.clusters['entities_']);
    //   console.log(doc.features);
  });

  // Get all the annotations for each document
  const annotationsByDoc = documents
    ?.map((doc) =>
      Object.values(doc.annotation_sets).filter(
        (set) => set.name === 'entities_'
      )
    )
    .flat();
  console.log(annotationsByDoc);
  const taxonomy = createTaxonomy(baseTaxonomy, annotationsByDoc ?? []);

  // Group by types
  const clustersByType: Record<string, Cluster[]> = groupBy(
    docsClusters.flat(),
    (e) => e.type
  );

  // Get all the clusters for the selected type
  const clustersForSelectedType = selectedType
    ? clustersByType[selectedType].sort((c1, c2) =>
        c1.title.localeCompare(c2.title)
      )
    : [];

  // Get document context for each mention of the current entity
  const mentionsForEntity = selectedEntity
    ? selectedEntity?.mentions.map((m) => {
        let annotation: EntityAnnotation | undefined;
        let docIndex = -1;

        for (let i = 0; i < (annotationsByDoc?.length ?? 0); i++) {
          const foundAnn = annotationsByDoc![i].annotations.find(
            (a) => a.id === m.id
          );

          if (foundAnn) {
            docIndex = i;
            annotation = foundAnn;
            break;
          }
        }

        if (!annotation || !documents) {
          return {
            ...m,
            start: 0,
            end: m.mention.length,
            context: '',
            documentTitle: '',
          };
        }

        const { context, mentionStart, mentionEnd } = getMentionContext(
          documents[docIndex].text,
          annotation?.start,
          annotation.end
        );

        return {
          ...m,
          start: mentionStart,
          end: mentionEnd,
          context,
          documentTitle: documents[docIndex].name,
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

  const handleEntitySelection = (e: Cluster) => {
    if (e.id === selectedEntity?.id) {
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
