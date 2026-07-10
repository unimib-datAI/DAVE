import { getElasticClient } from './elasticClient';

export type FacetFilter = {
  type: string;
  value: string;
};

export type FacetedSearchParams = {
  indexName: string;
  text: string;
  metadata?: FacetFilter[];
  annotations?: FacetFilter[];
  page?: number;
  documentsPerPage?: number;
  collectionId?: string;
  isAnonymized?: boolean;
};

function buildQuery(params: FacetedSearchParams) {
  const {
    text,
    metadata = [],
    annotations = [],
    collectionId,
    isAnonymized = true,
  } = params;

  const query: any = {
    bool: {
      must: [] as any[],
      filter: { bool: { should: [] as any[] } },
    },
  };

  if (text && text.trim()) {
    const searchField = isAnonymized ? 'text' : 'text_deanonymized';
    query.bool.must.push({
      query_string: { query: text, default_field: searchField },
    });
  } else {
    query.bool.must.push({ match_all: {} });
  }

  if (collectionId) {
    query.bool.must.push({
      bool: {
        should: [
          { term: { 'collectionId.keyword': collectionId } },
          { match_phrase: { collectionId } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  for (const annotation of annotations) {
    query.bool.filter.bool.should.push({
      nested: {
        path: 'annotations',
        query: {
          bool: {
            must: [
              { term: { 'annotations.id_ER': annotation.value } },
              { term: { 'annotations.type': annotation.type } },
            ],
          },
        },
      },
    });
  }

  for (const meta of metadata) {
    query.bool.filter.bool.should.push({
      nested: {
        path: 'metadata',
        query: {
          bool: {
            must: [
              { term: { 'metadata.value': meta.value } },
              { term: { 'metadata.type': meta.type } },
            ],
          },
        },
      },
    });
  }

  return query;
}

function getHits(searchRes: any) {
  return searchRes.hits.hits.map((hit: any) => {
    const source = { ...hit._source };
    const text: string = source.text ?? '';
    delete source.text;
    return { _id: hit._id, text: text.slice(0, 150), ...source };
  });
}

function getFacetsAnnotationsNoAgg(hits: any) {
  const mentionsTypeBuckets: Record<string, any[]> = {};

  for (const document of hits.hits.hits) {
    const anns = document._source.annotations;
    if (!anns) continue;
    for (const mention of anns) {
      if (!mentionsTypeBuckets[mention.type]) {
        mentionsTypeBuckets[mention.type] = [];
      }
      mentionsTypeBuckets[mention.type].push(mention);
    }
  }

  const annFacets: any[] = [];

  for (const bucketKey of Object.keys(mentionsTypeBuckets)) {
    const bucketItems = mentionsTypeBuckets[bucketKey];
    const aggregatedData: Record<string, any> = {};

    for (const obj of bucketItems) {
      if (!(obj.id_ER in aggregatedData)) {
        aggregatedData[obj.id_ER] = { ...obj, doc_count: 1 };
      } else {
        aggregatedData[obj.id_ER].doc_count += 1;
      }
    }

    const children = Object.entries(aggregatedData).map(([idER, ment]: [string, any]) => ({
      key: idER,
      display_name: ment.display_name,
      doc_count: ment.doc_count,
      is_linked: ment.is_linked,
    }));

    annFacets.push({
      key: bucketKey,
      doc_count: bucketItems.length,
      children,
      n_children: children.length,
    });
  }

  return annFacets;
}

function groupFacets(facets: any[]) {
  for (const facetsGroup of facets) {
    const grouped: Record<string, any> = {};
    for (const facet of facetsGroup.children) {
      const key = (facet.display_name ?? '').toLowerCase();
      if (!(key in grouped)) {
        grouped[key] = { ...facet, ids_ER: [facet.key] };
      } else {
        grouped[key].doc_count += facet.doc_count;
        grouped[key].ids_ER.push(facet.key);
      }
    }
    facetsGroup.children = Object.values(grouped);
  }
  return facets;
}

function getFacetsMetadata(searchRes: any) {
  const metadataTypeBuckets: Record<string, any[]> = {};

  for (const document of searchRes.hits.hits) {
    const meta = document._source.metadata;
    if (!meta) continue;
    for (const mention of meta) {
      if (!metadataTypeBuckets[mention.type]) {
        metadataTypeBuckets[mention.type] = [];
      }
      metadataTypeBuckets[mention.type].push(mention);
    }
  }

  const metadataFacets: any[] = [];

  for (const bucketKey of Object.keys(metadataTypeBuckets)) {
    const bucketItems = metadataTypeBuckets[bucketKey];
    const aggregatedData: Record<string, any> = {};

    for (const obj of bucketItems) {
      if (!(obj.value in aggregatedData)) {
        aggregatedData[obj.value] = { doc_count: 1 };
      } else {
        aggregatedData[obj.value].doc_count += 1;
      }
    }

    const children = Object.entries(aggregatedData).map(([value, agg]: [string, any]) => ({
      key: value,
      display_name: value,
      doc_count: agg.doc_count,
    }));

    metadataFacets.push({
      key: bucketKey,
      doc_count: bucketItems.length,
      children,
      n_children: children.length,
    });
  }

  return metadataFacets;
}

export async function runFacetedSearch(params: FacetedSearchParams) {
  const { indexName, page = 1, documentsPerPage = 20 } = params;
  const client = getElasticClient();
  const fromOffset = (page - 1) * documentsPerPage;
  const query = buildQuery(params);

  const searchRes: any = await client.search({
    index: indexName,
    size: documentsPerPage,
    from: fromOffset,
    _source_excludes: ['chunks', 'annotation_sets'],
    query,
    timeout: '10s',
  });

  const hits = getHits(searchRes);
  const totalHits: number = searchRes.hits.total?.value ?? 0;

  const facetSampleSize = Math.min(200, totalHits);
  let annotationsFacets: any[];
  let metadataFacets: any[];

  if (facetSampleSize > documentsPerPage) {
    try {
      const facetRes: any = await client.search({
        index: indexName,
        size: facetSampleSize,
        _source: ['annotations', 'metadata'],
        query,
        timeout: '5s',
      });
      annotationsFacets = groupFacets(getFacetsAnnotationsNoAgg(facetRes));
      metadataFacets = getFacetsMetadata(facetRes);
    } catch (error) {
      annotationsFacets = groupFacets(getFacetsAnnotationsNoAgg(searchRes));
      metadataFacets = getFacetsMetadata(searchRes);
    }
  } else {
    annotationsFacets = groupFacets(getFacetsAnnotationsNoAgg(searchRes));
    metadataFacets = getFacetsMetadata(searchRes);
  }

  let numPages = Math.floor(totalHits / documentsPerPage);
  if (totalHits % documentsPerPage > 0) {
    numPages += 1;
  }

  return {
    hits,
    facets: { annotations: annotationsFacets, metadata: metadataFacets },
    pagination: {
      current_page: page,
      total_pages: numPages,
      total_hits: totalHits,
    },
  };
}
