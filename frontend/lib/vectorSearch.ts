// Hybrid dense + full-text search with Reciprocal Rank Fusion (RRF).
// Ported from qavectorizer's vector_search.py (VectorSearch class) so the
// RAG retrieval routes no longer live in the Python service - only
// embedding generation and reranking do (see embedClient.ts).
//
// Each returned chunk carries a `text_emb` field - the all-MiniLM-L6-v2
// embedding of its text, computed in a single batched call for efficiency.

import { createHash } from 'crypto';
import { getElasticClient } from './elasticClient';
import { embedMain, embedChunks, rerank } from './embedClient';
import { retrieveDocument } from './documentRetrievers';
import { countTokens } from './tokenCounter';
import { decryptFieldIfEncrypted } from './crypto/fieldEncryption';

const CHUNK_INNER_HIT_FIELDS = [
  'chunks.vectors.text',
  'chunks.vectors.text_anonymized',
  '_score',
];
const FULL_DOC_KEYWORDS = ['estrai', 'riassumi'];
const TOKEN_LIMIT = 18_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

// Ranking knobs, exposed for tuning against the RAG benchmark.
const RRF_K = envNumber('RAG_RRF_K', 60);
const RRF_DENSE_WEIGHT = envNumber('RAG_RRF_DENSE_WEIGHT', 1);
const RRF_FULLTEXT_WEIGHT = envNumber('RAG_RRF_FULLTEXT_WEIGHT', 1);
// Chunks returned when the caller doesn't pass `topK`, and how many of them
// may come from the same document.
const DEFAULT_TOP_K = envNumber('RAG_TOP_K', 10);
const MAX_TOP_K = 50;
const MAX_CHUNKS_PER_DOC = envNumber('RAG_MAX_CHUNKS_PER_DOC', 5);
// Fused chunks handed to the cross-encoder reranker; 0 disables reranking.
const RERANK_POOL = envNumber('RAG_RERANK_POOL', 50);
// Boost of a query match on the document title in the full-text search.
const NAME_BOOST = envNumber('RAG_NAME_BOOST', 2);

const KNN_K = 64;
const KNN_NUM_CANDIDATES = 500;
// Documents (and best chunks of each) fetched per search to rank from.
const DOCS_PER_SEARCH = 30;
const INNER_HITS_MULTI_DOC = 20;
const INNER_HITS_SINGLE_DOC = 50;
const SINGLE_DOC_CHUNKS = 20;

export type RetrievalMethod = 'full' | 'dense' | 'full-text' | 'hibrid_no_ner';

export type VectorSearchParams = {
  collectionName: string;
  query: string;
  retrievalMethod: RetrievalMethod | string;
  filterIds?: string[] | null;
  collectionId?: string | null;
  forceRag?: boolean;
  // Max chunks to return across all documents (default RAG_TOP_K).
  topK?: number | null;
};

type ChunkId = [docId: string, text: string, textAnonymized: string];

type ScoredChunk = { id: string; score: number };

type Chunk = {
  id: string;
  text: string;
  text_anonymized: string;
  metadata: { doc_id: string; chunk_size: number };
  text_emb?: number[];
};

type DocChunksMap = Map<string, Chunk[]>;

export type VectorSearchResult = {
  doc: any;
  chunks: Chunk[];
  full_docs: boolean;
};

export async function search(params: VectorSearchParams): Promise<VectorSearchResult[]> {
  const {
    collectionName,
    query,
    retrievalMethod,
    filterIds,
    collectionId,
    forceRag = false,
    topK,
  } = params;

  const singleDocMode = !!(filterIds && filterIds.length === 1);
  const chunkLimit = singleDocMode
    ? SINGLE_DOC_CHUNKS
    : Math.min(Math.max(Math.floor(topK || DEFAULT_TOP_K), 1), MAX_TOP_K);
  const maxChunksPerDoc = singleDocMode
    ? chunkLimit
    : Math.max(Math.min(MAX_CHUNKS_PER_DOC, chunkLimit), 1);

  // 1. Encode query
  const [queryEmbedding] = await embedMain([query]);

  // 2. Build & run ES queries
  const client = getElasticClient();

  const { knnQuery, fullTextQuery } = buildQueries({
    query,
    embeddings: queryEmbedding,
    filterIds,
    collectionId,
    size: filterIds?.length ? Math.min(filterIds.length, DOCS_PER_SEARCH) : DOCS_PER_SEARCH,
    innerHitsSize: singleDocMode ? INNER_HITS_SINGLE_DOC : INNER_HITS_MULTI_DOC,
    chunkTextField: await resolveChunkTextField(client, collectionName),
  });

  const runsDense =
    retrievalMethod === 'full' ||
    retrievalMethod === 'dense' ||
    retrievalMethod === 'hibrid_no_ner';
  const runsFullText =
    retrievalMethod === 'full' ||
    retrievalMethod === 'hibrid_no_ner' ||
    retrievalMethod === 'full-text';

  // Pass the queries as an explicit `body`: the installed client (8.0) only
  // routes body keys it knows about into the request body and sends the
  // rest - including top-level `knn`, added in client 8.4 - as URL params,
  // which ES rejects ("contains unrecognized parameter: [knn]").
  const [denseResults, fulltextResults] = await Promise.all([
    runsDense ? client.search({ index: collectionName, body: knnQuery } as any) : null,
    runsFullText
      ? client.search({ index: collectionName, body: fullTextQuery } as any)
      : null,
  ]);

  // 3. RRF fusion
  const vectorRanks = denseResults
    ? toRanks(collectDenseChunks(denseResults))
    : new Map<string, number>();
  const fullTextRanks = fulltextResults
    ? toRanks(collectFullTextChunks(fulltextResults))
    : new Map<string, number>();
  const fused = rrfRank(vectorRanks, fullTextRanks)
    .slice(0, Math.max(RERANK_POOL, chunkLimit))
    .map(([encodedId]) => encodedId);

  // 4. Fetch the candidate chunks' documents from ES
  const fullDocsFlag =
    !forceRag && FULL_DOC_KEYWORDS.some((kw) => query.toLowerCase().includes(kw));
  const docsById = await fetchDocs({
    collectionName,
    docIds: uniqueDocIds(fused),
    collectionId,
    includeText: fullDocsFlag,
  });

  // 5. Rerank the candidates and keep the best chunks (no embeddings yet)
  const ranked = await rerankChunks(query, fused, docsById);
  const docChunksIdMap = gatherChunks(ranked, chunkLimit, maxChunksPerDoc);

  // 6. Batch-encode all chunk texts in one shot
  await embedChunksInPlace(docChunksIdMap);

  // 7. Assemble and return results
  return prepareResults({ docsById, docChunksIdMap, fullDocsFlag });
}

// ── RRF ──────────────────────────────────────────────────────────────────

function rrfRank(
  vectorRanks: Map<string, number>,
  fullTextRanks: Map<string, number>
): [string, number][] {
  const allIds = new Set(
    Array.from(vectorRanks.keys()).concat(Array.from(fullTextRanks.keys()))
  );
  const scores = new Map<string, number>();
  for (const cid of Array.from(allIds)) {
    const vRank = vectorRanks.has(cid) ? vectorRanks.get(cid)! : Infinity;
    const ftRank = fullTextRanks.has(cid) ? fullTextRanks.get(cid)! : Infinity;
    scores.set(
      cid,
      RRF_DENSE_WEIGHT / (RRF_K + vRank) + RRF_FULLTEXT_WEIGHT / (RRF_K + ftRank)
    );
  }
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}

// Ranks chunks by score across every document: ES returns them grouped by
// document, so a document's 20th chunk must not outrank the next
// document's best one.
function toRanks(chunks: ScoredChunk[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const { id } of [...chunks].sort((a, b) => b.score - a.score)) {
    if (!ranks.has(id)) ranks.set(id, ranks.size + 1);
  }
  return ranks;
}

// ── chunk extraction (from ES kNN / full-text responses) ──────────────────

function collectDenseChunks(response: any): ScoredChunk[] {
  const chunks: ScoredChunk[] = [];
  for (const hit of response.hits.hits) {
    const docId = hit._source.id;
    const innerHits = hit.inner_hits?.['chunks.vectors']?.hits?.hits;
    if (!innerHits) continue;
    for (const chunkHit of innerHits) {
      const fields = chunkHit.fields.chunks[0].vectors[0];
      // Some indexed chunks hold AES-encrypted text (see resolveChunkTextField)
      const chunkText = decryptFieldIfEncrypted(fields.text[0]);
      const chunkTextAnonymized = (fields.text_anonymized || [chunkText])[0];
      chunks.push({
        id: encodeChunkId([docId, chunkText, chunkTextAnonymized]),
        score: chunkHit._score ?? 0,
      });
    }
  }
  return chunks;
}

function collectFullTextChunks(response: any): ScoredChunk[] {
  const chunks: ScoredChunk[] = [];
  for (const hit of response.hits.hits) {
    const docId = hit._source.id;
    const innerHits = hit.inner_hits?.['chunks.vectors']?.hits?.hits;
    if (!innerHits?.length) continue;
    // The document score is its best chunk's score (score_mode: max) plus
    // the title match, if any - carry that title bonus to each chunk.
    const bestChunkScore = Math.max(...innerHits.map((h: any) => h._score ?? 0));
    const titleBonus = Math.max((hit._score ?? 0) - bestChunkScore, 0);
    for (const chunkHit of innerHits) {
      const chunkText = decryptFieldIfEncrypted(chunkHit._source.text);
      const chunkTextAnonymized = chunkHit._source.text_anonymized ?? chunkText;
      chunks.push({
        id: encodeChunkId([docId, chunkText, chunkTextAnonymized]),
        score: (chunkHit._score ?? 0) + titleBonus,
      });
    }
  }
  return chunks;
}

// Chunk ids are (doc_id, text, text_anonymized) tuples in Python (hashable).
// JS Maps need a primitive key, so we encode/decode the tuple as JSON.
function encodeChunkId(id: ChunkId): string {
  return JSON.stringify(id);
}

function decodeChunkId(id: string): ChunkId {
  return JSON.parse(id);
}

function uniqueDocIds(encodedIds: string[]): string[] {
  return Array.from(new Set(encodedIds.map((id) => String(decodeChunkId(id)[0]))));
}

// ── reranking ────────────────────────────────────────────────────────────

// Reorders the fused candidates with the cross-encoder, which reads the
// query and each chunk together (prefixed with its document's title, since
// chunks rarely name the document they come from). Keeps the fused order
// when the reranker is disabled or unavailable.
async function rerankChunks(
  query: string,
  encodedIds: string[],
  docsById: Map<string, any>
): Promise<string[]> {
  if (RERANK_POOL <= 0 || encodedIds.length < 2) return encodedIds;

  const texts = encodedIds.map((encodedId) => {
    const [docId, text] = decodeChunkId(encodedId);
    const doc = docsById.get(String(docId));
    const title = doc?.name_text || doc?.name;
    return title ? `${title}\n${text}` : text;
  });
  const scores = await rerank(query, texts);
  if (!scores) return encodedIds;

  return encodedIds
    .map((encodedId, i) => [encodedId, scores[i]] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .map(([encodedId]) => encodedId);
}

// ── chunk gathering ─────────────────────────────────────────────────────

function makeChunk(docId: string, text: string, textAnonymized: string): Chunk {
  const hash = createHash('sha256').update(text, 'utf-8').digest('hex');
  return {
    id: `${docId}_${hash}`,
    text,
    text_anonymized: textAnonymized,
    metadata: { doc_id: docId, chunk_size: text.length },
  };
}

async function embedChunksInPlace(docChunksIdMap: DocChunksMap): Promise<void> {
  const flat = Array.from(docChunksIdMap.values()).flat();
  if (flat.length === 0) return;
  const embeddings = await embedChunks(flat.map((c) => c.text));
  flat.forEach((chunk, i) => {
    chunk.text_emb = embeddings[i];
  });
}

// Takes the best `limit` chunks overall (at most `maxPerDoc` from the same
// document), grouped by document. Documents come out ordered by their best
// chunk; nothing is added to fill a quota, so weak matches stay out.
function gatherChunks(
  rankedIds: string[],
  limit: number,
  maxPerDoc: number
): DocChunksMap {
  const docChunks: DocChunksMap = new Map();
  let gathered = 0;
  for (const encodedId of rankedIds) {
    if (gathered >= limit) break;
    const [rawDocId, text, textAnon] = decodeChunkId(encodedId);
    const docId = String(rawDocId);
    const chunks = docChunks.get(docId) || [];
    if (chunks.length >= maxPerDoc) continue;
    chunks.push(makeChunk(docId, text, textAnon));
    docChunks.set(docId, chunks);
    gathered += 1;
  }
  return docChunks;
}

// ── document retrieval ───────────────────────────────────────────────────

// Returns the documents keyed by id. The full `text` is only loaded when
// the caller is going to return whole documents - it can be hundreds of KB
// per document.
async function fetchDocs(params: {
  collectionName: string;
  docIds: string[];
  collectionId?: string | null;
  includeText: boolean;
}): Promise<Map<string, any>> {
  const { collectionName, docIds, collectionId, includeText } = params;
  const idToDoc = new Map<string, any>();
  if (docIds.length === 0) return idToDoc;
  try {
    const client = getElasticClient();
    const filter: any[] = [{ terms: { id: docIds } }];
    if (collectionId) {
      filter.push({ term: { 'collectionId.keyword': collectionId } });
    }
    const resp: any = await client.search({
      index: collectionName,
      query: { bool: { filter } },
      _source: [
        'id',
        'name',
        'name_text',
        'preview',
        ...(includeText ? ['text', 'text_anonymized'] : []),
      ],
      // A document id is a content hash, shared by the copies of the same
      // file in other collections: without a collection filter, leave room
      // for those copies so they can't crowd out another document.
      size: collectionId ? docIds.length : docIds.length * 5,
    } as any);

    for (const hit of resp.hits?.hits ?? []) {
      const src = hit._source ?? {};
      const docId = src.id ?? hit._id;
      if (docId != null && !idToDoc.has(String(docId))) {
        idToDoc.set(String(docId), src);
      }
    }
  } catch (error) {
    console.error('ES fetch failed — falling back to configured retriever', error);
    for (const docId of docIds) {
      const doc = await retrieveDocument(collectionName, docId);
      if (doc && !doc.error) idToDoc.set(String(docId), doc);
    }
  }
  return idToDoc;
}

// ── result preparation ───────────────────────────────────────────────────

async function prepareResults(params: {
  docsById: Map<string, any>;
  docChunksIdMap: DocChunksMap;
  fullDocsFlag: boolean;
}): Promise<VectorSearchResult[]> {
  const { docsById, docChunksIdMap, fullDocsFlag } = params;
  const results: VectorSearchResult[] = [];
  for (const [docId, chunks] of Array.from(docChunksIdMap.entries())) {
    const doc = docsById.get(docId);
    if (doc) results.push({ doc, chunks, full_docs: false });
  }

  if (fullDocsFlag) {
    const fullDocs = results.map((r) => r.doc);
    const tokenCounts = await Promise.all(
      fullDocs.map((doc) => countTokens(doc.text ?? ''))
    );
    const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
    if (totalTokens <= TOKEN_LIMIT) {
      return fullDocResults(fullDocs);
    }
  }

  return results;
}

async function fullDocResults(fullDocs: any[]): Promise<VectorSearchResult[]> {
  const chunks: Chunk[] = fullDocs.map((doc) => ({
    id: doc.id,
    text: doc.text,
    text_anonymized: doc.text_anonymized ?? doc.text,
    metadata: { doc_id: doc.id, chunk_size: doc.text.length },
  }));

  if (chunks.length > 0) {
    const embeddings = await embedChunks(chunks.map((c) => c.text));
    chunks.forEach((chunk, i) => {
      chunk.text_emb = embeddings[i];
    });
  }

  return fullDocs.map((doc, i) => ({
    full_docs: true,
    doc,
    chunks: [chunks[i]],
  }));
}

// ── ES query builders ────────────────────────────────────────────────────

const chunkTextFieldCache = new Map<string, string>();

/**
 * Field to full-text match chunk text against. Normally
 * `chunks.vectors.text`, but indexes created while that field held
 * AES-encrypted chunks (lib/crypto/fieldEncryption.ts - still the case for
 * the chunks indexed back then, decrypted on read above) map it as
 * `binary`, which can't be queried (ES never changes an existing field's
 * type - only recreating the index fixes it). Those fall back to
 * `chunks.vectors.text_anonymized`: the same chunks, with anonymized
 * entities shown as their vault tokens.
 */
async function resolveChunkTextField(client: any, index: string): Promise<string> {
  const cached = chunkTextFieldCache.get(index);
  if (cached) return cached;
  let field = 'chunks.vectors.text';
  try {
    const res: any = await client.indices.getFieldMapping({
      index,
      fields: 'chunks.vectors.text',
    });
    const types = Object.values(res ?? {}).map(
      (idx: any) => idx?.mappings?.['chunks.vectors.text']?.mapping?.text?.type
    );
    if (types.some((type) => type && type !== 'text')) {
      console.warn(
        `[vectorSearch] "${index}" maps chunks.vectors.text as ${types.join(
          '/'
        )}, which full-text queries can't use - falling back to ` +
          'chunks.vectors.text_anonymized. Recreate the index to restore it.'
      );
      field = 'chunks.vectors.text_anonymized';
    }
  } catch (error) {
    // Mapping lookup is best-effort; keep the default field.
    console.error('[vectorSearch] Could not read the chunk text mapping', error);
  }
  chunkTextFieldCache.set(index, field);
  return field;
}

function buildQueries(params: {
  query: string;
  embeddings: number[];
  filterIds?: string[] | null;
  collectionId?: string | null;
  size: number;
  innerHitsSize: number;
  chunkTextField: string;
}) {
  const { query, embeddings, filterIds, collectionId, size, innerHitsSize, chunkTextField } =
    params;

  const filters: any[] = [];
  if (filterIds && filterIds.length > 0) {
    filters.push({ terms: { id: filterIds } });
  }
  if (collectionId) {
    filters.push({ term: { 'collectionId.keyword': collectionId } });
  }

  return {
    knnQuery: buildKnnQuery({
      embeddings,
      filters,
      // a document filter leaves few candidates: search them exhaustively
      numCandidates: filterIds?.length ? 2000 : KNN_NUM_CANDIDATES,
      size,
      innerHitsSize,
    }),
    fullTextQuery: buildFullTextQuery({
      query,
      filters,
      size,
      innerHitsSize,
      chunkTextField,
    }),
  };
}

function buildKnnQuery(params: {
  embeddings: number[];
  filters: any[];
  numCandidates: number;
  size: number;
  innerHitsSize: number;
}) {
  const { embeddings, filters, numCandidates, size, innerHitsSize } = params;
  const knn: any = {
    field: 'chunks.vectors.predicted_value',
    query_vector: embeddings,
    k: KNN_K,
    num_candidates: numCandidates,
    inner_hits: {
      _source: false,
      fields: CHUNK_INNER_HIT_FIELDS,
      size: innerHitsSize,
    },
  };
  if (filters.length === 1) {
    knn.filter = filters[0];
  } else if (filters.length > 1) {
    knn.filter = { bool: { filter: filters } };
  }
  return { _source: ['id'], size, knn };
}

function buildFullTextQuery(params: {
  query: string;
  filters: any[];
  size: number;
  innerHitsSize: number;
  chunkTextField: string;
}) {
  const { query, filters, size, innerHitsSize, chunkTextField } = params;
  // The stemmed sub-fields (see elasticIndexSettings.ts) only exist on
  // chunks indexed after they were added; elsewhere they match nothing and
  // the query behaves as a plain match on the chunk text.
  const fields =
    chunkTextField === 'chunks.vectors.text'
      ? [chunkTextField, `${chunkTextField}.it`, `${chunkTextField}.en`]
      : [chunkTextField];

  return {
    _source: ['id'],
    size,
    query: {
      bool: {
        filter: filters,
        must: {
          nested: {
            path: 'chunks.vectors',
            // `max` so the document score is its best chunk's score, which
            // collectFullTextChunks relies on to isolate the title bonus
            score_mode: 'max',
            query: { multi_match: { query, type: 'most_fields', fields } },
            inner_hits: { _source: true, size: innerHitsSize },
          },
        },
        // optional: a query naming the document lifts that document's chunks
        should: [{ match: { name_text: { query, boost: NAME_BOOST } } }],
      },
    },
  };
}
