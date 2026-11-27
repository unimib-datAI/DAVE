// Finds the documents that mention a named entity, using the entity
// annotations stored with every indexed document (nested `annotations` field:
// mention, display_name, type, is_linked, id_ER - see elasticIndexSettings.ts).
//
// It only returns document ids. The multi-agent pipeline then fetches the
// chunks of those documents through the regular vector search, so anonymized
// text and encrypted chunks keep going through the one existing code path.

import { getElasticClient } from './elasticClient';

export type EntityLookupParams = {
  indexName: string;
  /** Entity names as written in the question, e.g. "Mario Rossi". */
  names: string[];
  collectionId?: string;
  /** Restrict to these document ids (the chat's document filter). */
  filterIds?: string[];
  /** Upper bound on the document ids returned. */
  maxDocs?: number;
};

export type EntityLookupResult = {
  docIds: string[];
  /** Linked entities that matched (id_ER is shared across documents). */
  entities: { name: string; idER: string; type: string }[];
};

const MAX_NAMES = 5;
const MAX_NAME_LENGTH = 80;
const SEARCH_SIZE = 20;

function baseFilters(params: EntityLookupParams): any[] {
  const filters: any[] = [];
  if (params.filterIds && params.filterIds.length > 0) {
    filters.push({ terms: { id: params.filterIds } });
  }
  if (params.collectionId) {
    filters.push({ term: { 'collectionId.keyword': params.collectionId } });
  }
  return filters;
}

/** Trimmed, de-duplicated, length-capped entity names. */
export function cleanEntityNames(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const clean = name.trim().slice(0, MAX_NAME_LENGTH);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length === MAX_NAMES) break;
  }
  return out;
}

export async function findEntityDocuments(
  params: EntityLookupParams
): Promise<EntityLookupResult> {
  const names = cleanEntityNames(params.names);
  const empty: EntityLookupResult = { docIds: [], entities: [] };
  if (names.length === 0 || !params.indexName) return empty;

  const maxDocs = params.maxDocs ?? 8;
  const client = getElasticClient();
  const filters = baseFilters(params);

  try {
    // 1. Documents with an annotation whose mention or display name is one of
    //    the names (case-insensitive: the fields are keywords).
    const byName: any = await client.search({
      index: params.indexName,
      size: SEARCH_SIZE,
      _source: ['id'],
      timeout: '10s',
      query: {
        bool: {
          filter: filters,
          must: [
            {
              nested: {
                path: 'annotations',
                query: {
                  bool: {
                    should: names.flatMap((value) => [
                      {
                        term: {
                          'annotations.mention': {
                            value,
                            case_insensitive: true,
                          },
                        },
                      },
                      {
                        term: {
                          'annotations.display_name': {
                            value,
                            case_insensitive: true,
                          },
                        },
                      },
                    ]),
                    minimum_should_match: 1,
                  },
                },
                inner_hits: {
                  size: 5,
                  _source: [
                    'annotations.id_ER',
                    'annotations.display_name',
                    'annotations.type',
                    'annotations.is_linked',
                  ],
                },
              },
            },
          ],
        },
      },
    } as any);

    const docIds: string[] = [];
    const entities = new Map<string, EntityLookupResult['entities'][number]>();
    for (const hit of byName.hits?.hits ?? []) {
      const id = hit._source?.id;
      if (id !== undefined && !docIds.includes(String(id))) {
        docIds.push(String(id));
      }
      for (const inner of hit.inner_hits?.annotations?.hits?.hits ?? []) {
        const ann = inner._source ?? {};
        // Unlinked annotations get a per-document id_ER: useless to expand on.
        if (ann.is_linked && ann.id_ER && !entities.has(ann.id_ER)) {
          entities.set(ann.id_ER, {
            name: ann.display_name ?? '',
            idER: ann.id_ER,
            type: ann.type ?? '',
          });
        }
      }
    }

    // 2. The same linked entity can be written differently elsewhere
    //    ("Rossi", "M. Rossi"): its id_ER finds those documents too.
    if (entities.size > 0) {
      const byId: any = await client.search({
        index: params.indexName,
        size: SEARCH_SIZE,
        _source: ['id'],
        timeout: '10s',
        query: {
          bool: {
            filter: filters,
            must: [
              {
                nested: {
                  path: 'annotations',
                  query: {
                    terms: { 'annotations.id_ER': Array.from(entities.keys()) },
                  },
                },
              },
            ],
          },
        },
      } as any);
      for (const hit of byId.hits?.hits ?? []) {
        const id = hit._source?.id;
        if (id !== undefined && !docIds.includes(String(id))) {
          docIds.push(String(id));
        }
      }
    }

    return {
      docIds: docIds.slice(0, maxDocs),
      entities: Array.from(entities.values()),
    };
  } catch (error) {
    // Best effort: the regular retrievers still run without it.
    console.error('[entityLookup] Elasticsearch query failed', error);
    return empty;
  }
}
