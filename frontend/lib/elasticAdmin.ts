// Elasticsearch index/document CRUD, ported from qavectorizer's remaining
// "Elasticsearch Index"/"Elasticsearch Documents" routes in app.py. These
// are pure ES operations with no ML dependency, unlike documentIndexer.ts
// (which still calls qavectorizer for embeddings) or vectorSearch.ts.

import { getElasticClient } from './elasticClient';
import { getIndexSettings } from './elasticIndexSettings';

// ── POST /elastic/index ──────────────────────────────────────────────────
// Creates an index if it doesn't exist yet, or returns the existing one.
export async function createOrGetElasticIndex(name: string) {
  const client = getElasticClient();

  const exists = await client.indices.exists({ index: name });
  if (exists) {
    const index = await client.indices.get({ index: name });
    const count = await client.count({ index: name });
    return { ...index, n_documents: count.count };
  }

  await client.indices.create({ index: name, ...getIndexSettings() } as any);
  const index = await client.indices.get({ index: name });
  return { ...index, n_documents: 0 };
}

// ── DELETE /elastic/index/{index_name} ───────────────────────────────────
export async function deleteElasticIndex(indexName: string) {
  const client = getElasticClient();
  try {
    await client.indices.delete({ index: indexName });
    return { count: 1 };
  } catch (error) {
    console.error(error);
    throw new Error('Error while deleting index');
  }
}

// ── GET /elastic/index/{index_name}/mapping ──────────────────────────────
export async function getElasticMapping(indexName: string) {
  const client = getElasticClient();
  try {
    return await client.indices.getMapping({ index: indexName });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// ── POST /elastic/index/{index_name}/doc ─────────────────────────────────
// Indexes a document directly, with no chunking/embedding/annotation
// processing (see documentIndexer.ts for the full-processing pipeline).
export async function indexElasticDocumentRaw(
  indexName: string,
  doc: Record<string, any>
) {
  const client = getElasticClient();
  const res: any = await client.index({ index: indexName, document: doc } as any);
  await client.indices.refresh({ index: indexName });
  return res.result;
}

// ── DELETE /elastic/index/{index_name}/doc/{doc_id} ──────────────────────
export async function deleteElasticDocument(indexName: string, docId: string) {
  const client = getElasticClient();
  try {
    const response: any = await client.deleteByQuery({
      index: indexName,
      query: { term: { id: docId } },
    } as any);
    return { deleted: response.deleted };
  } catch (error) {
    console.error(
      `Error deleting document ${docId} from index ${indexName}:`,
      error
    );
    throw new Error(`Document ${docId} not found in index ${indexName}`);
  }
}

// ── POST /elastic/index/{index_name}/doc/{document_id}/annotations ──────

const ANONYMIZE_TYPES = ['persona', 'parte', 'controparte'];

function anonymizeMention(s: string) {
  if (!s) return '';
  return s
    .split(' ')
    .map((word) => word[0] + '*'.repeat(Math.max(word.length - 1, 0)))
    .join(' ');
}

export async function addAnnotationsToDocumentEs(
  indexName: string,
  documentId: string,
  mentions: any[],
  // `documentId` is a content hash, not globally unique - the same source
  // file uploaded into two different collections produces two ES documents
  // sharing the same `id`/`mongo_id`. Without this filter, `should` alone
  // lets the query match either duplicate and silently updates whichever one
  // the search happens to rank first, which can write annotations into the
  // wrong collection's copy. Pass it whenever the caller knows which
  // collection it means.
  collectionId?: string
) {
  const client = getElasticClient();

  const searchResult: any = await client.search({
    index: indexName,
    query: {
      bool: {
        should: [
          { term: { id: documentId } },
          { term: { mongo_id: documentId } },
        ],
        minimum_should_match: 1,
        // collectionId is mapped as analyzed `text` with a `.keyword`
        // sub-field (ES's default dynamic mapping) - `term` needs the exact
        // (unanalyzed) sub-field, not the analyzed base field, otherwise a
        // UUID like "a67f290a-693c-..." gets tokenized on hyphens and the
        // filter silently fails to match anything.
        ...(collectionId ? { filter: [{ term: { 'collectionId.keyword': collectionId } }] } : {}),
      },
    },
  } as any);

  if ((searchResult.hits?.total?.value ?? 0) === 0) {
    throw new Error(`Document with ID ${documentId} not found`);
  }

  const esDocId = searchResult.hits.hits[0]._id;

  const annotations = mentions.map((mention) => {
    const type = mention.type ?? 'unknown';
    const shouldAnonymize = ANONYMIZE_TYPES.includes(type);
    return {
      id: mention.id,
      id_ER: mention.id_ER ?? '',
      start: mention.start ?? 0,
      end: mention.end ?? 0,
      type,
      mention: mention.mention ?? '',
      is_linked: mention.is_linked ?? false,
      display_name:
        mention.display_name ??
        (shouldAnonymize
          ? anonymizeMention(mention.mention ?? '')
          : mention.mention ?? ''),
      anonymize: shouldAnonymize,
    };
  });

  const result: any = await client.update({
    index: indexName,
    id: esDocId,
    doc: { annotations },
    refresh: true,
  } as any);

  return {
    result: result.result,
    document_id: documentId,
    annotations_count: annotations.length,
  };
}

// ── POST /elastic/index/{index_name}/doc/mongo ───────────────────────────

const MONGO_METADATA_KEYS = new Set([
  'annosentenza',
  'annoruolo',
  'codiceoggetto',
  'parte',
  'controparte',
  'nomegiudice',
  'tipodocumento',
]);

export async function indexElasticDocumentFromMongo(
  indexName: string,
  mongoDoc: any
) {
  const doc: Record<string, any> = {};
  doc.mongo_id = mongoDoc.id;
  doc.name = mongoDoc.name;
  doc.text = mongoDoc.text;
  doc.metadata = Object.entries(mongoDoc.features || {})
    .filter(([key]) => MONGO_METADATA_KEYS.has(key))
    .map(([type, value]) => ({ type, value }));

  const clusters = mongoDoc.features?.clusters?.entities_merged || [];
  doc.annotations = clusters.map((cluster: any) => ({
    id: cluster.id,
    // this will be a real ER id when it exists
    id_ER: cluster.id,
    start: 0,
    end: 0,
    type: cluster.type,
    mention: cluster.title,
    is_linked: Boolean(cluster.url),
    // Mirrors qavectorizer's (swapped-argument) call exactly:
    // anonymize(cluster["type"], cluster["title"]) - `cluster.type` is only
    // anonymized if `cluster.title` happens to equal "persona", which is
    // never true in practice, so this always returns `cluster.type` as-is.
    display_name: anonymizeLegacy(cluster.type, cluster.title),
  }));

  return indexElasticDocumentRaw(indexName, doc);
}

function anonymizeLegacy(
  s: string,
  sType: string = 'persona',
  anonymizeTypes: string[] = ['persona']
) {
  if (!s) return '';
  if (anonymizeTypes.includes(sType)) {
    return s
      .split(' ')
      .map((word) => word[0] + '*'.repeat(Math.max(word.length - 1, 0)))
      .join(' ');
  }
  return s;
}
