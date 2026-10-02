import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import { createTaxonomy } from '@/modules/document/DocumentProvider/utils';
import { Cluster } from '@/server/routers/document';
import { useQuery } from '@/utils/trpc';

export function useDocumentClusters(docId: string | undefined) {
  // Return the list of new clusters
  const { data: documentData } = useQuery(
    ['document.getDocument', { id: docId ?? '' }],
    { enabled: !!docId }
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

  return { documentData, taxonomy, annotations, clusters: filteredClusters };
}
