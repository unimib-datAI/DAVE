import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { Cluster } from '@/server/routers/document';
import { useQuery } from '@/utils/trpc';
import { useMemo } from 'react';
import { ClusterWithDocId } from './types';

export function useDocumentClusters(docId: string | undefined) {
  const { data: documentData } = useQuery(
    ['document.getDocument', { id: docId ?? '' }],
    { enabled: !!docId, keepPreviousData: true }
  );

  return useMemo(() => {
    const entityAnnotationSet = Object.values(
      documentData?.annotation_sets ?? []
    ).filter((set) => set.name === 'entities_');

    // Need this to get the correct colors for the types
    const taxonomy = createTaxonomy(baseTaxonomy, entityAnnotationSet);
    const annotations = entityAnnotationSet[0]?.annotations;

    // Some mentions do not have a corresponding
    // annotation in the document. These need to be filtered out.
    const clusters: Cluster[] =
      documentData?.features.clusters['entities_'] ?? [];
    const filteredClusters: ClusterWithDocId[] = clusters
      .map((c) => ({
        ...c,
        docId: docId,
        mentions: c.mentions.filter((m) =>
          annotations?.some((ann) => ann.id === m.id)
        ),
      }))
      .filter((c) => c.mentions.length > 0);

    return {
      documentData,
      taxonomy,
      annotations,
      clusters: filteredClusters,
    };
  }, [documentData]);
}
