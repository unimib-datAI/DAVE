// Hybrid dense + full-text search with Reciprocal Rank Fusion (RRF).
// Ported from qavectorizer's vector_search.py (VectorSearch class) so the
// RAG retrieval routes no longer live in the Python service - only
// embedding generation does (see embedClient.ts).
//
// Each returned chunk carries a `text_emb` field - the all-MiniLM-L6-v2
// embedding of its text, computed in a single batched call for efficiency.

import { createHash } from 'crypto';
import { getElasticClient } from './elasticClient';
import { embedMain, embedChunks } from './embedClient';
import { retrieveDocument } from './documentRetrievers';
import { countTokens } from './tokenCounter';

const CHUNK_INNER_HIT_FIELDS = [
  'chunks.vectors.text',
  'chunks.vectors.text_anonymized',
  '_score',
];
const FULL_DOC_KEYWORDS = ['estrai', 'riassumi'];
const TOKEN_LIMIT = 18_000;

export type RetrievalMethod = 'full' | 'dense' | 'full-text' | 'hibrid_no_ner';

export type VectorSearchParams = {
  collectionName: string;
  query: string;
  retrievalMethod: RetrievalMethod | string;
  filterIds?: string[] | null;
  collectionId?: string | null;
  forceRag?: boolean;
};

type ChunkId = [docId: string, text: string, textAnonymized: string];

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
  } = params;

  const singleDocMode = !!(filterIds && filterIds.length === 1);

  // 1. Encode query
  const [queryEmbedding] = await embedMain([query]);

  // 2. Build & run ES queries
  const knnK = 64;
  const chunksToGather = singleDocMode ? 20 : 100;
  const innerHitsSize = 50;

  const { knnQuery, fullTextQuery } = buildQueries({
    query,
    embeddings: queryEmbedding,
    retrievalMethod,
    filterIds,
    collectionId,
    knnK,
    innerHitsSize,
  });

  const client = getElasticClient();

  const runsDense =
    retrievalMethod === 'full' ||
    retrievalMethod === 'dense' ||
    retrievalMethod === 'hibrid_no_ner';
  const runsFullText =
    retrievalMethod === 'full' ||
    retrievalMethod === 'hibrid_no_ner' ||
    retrievalMethod === 'full-text';

  const [denseResults, fulltextResults] = await Promise.all([
    runsDense ? client.search({ index: collectionName, ...knnQuery } as any) : null,
    runsFullText
      ? client.search({ index: collectionName, ...fullTextQuery } as any)
      : null,
  ]);

  // 3. RRF fusion
  const vectorRanks = denseResults ? collectChunkRanks(denseResults) : new Map();
  const fullTextRanks = fulltextResults
    ? collectChunkRanksFullText(fulltextResults)
    : new Map();
  const finalRanking = rrfRank(vectorRanks, fullTextRanks, singleDocMode);

  // 4. Collect top chunks (no embeddings yet)
  const docChunksIdMap = singleDocMode
    ? gatherChunksSingleDoc(finalRanking, chunksToGather)
    : gatherChunksMultiDoc(finalRanking);

  // 5. Batch-encode all chunk texts in one shot
  await embedChunksInPlace(docChunksIdMap);

  // 6. Fetch full documents from ES
  const fullDocs = await fetchFullDocs(collectionName, Array.from(docChunksIdMap.keys()));

  // 7. Assemble and return results
  return prepareResults({
    fullDocs,
    docChunksIdMap,
    query,
    singleDocMode,
    forceRag,
  });
}

// ── RRF ──────────────────────────────────────────────────────────────────

function rrfRank(
  vectorRanks: Map<string, number>,
  fullTextRanks: Map<string, number>,
  singleDocMode: boolean
): [string, number][] {
  const rrfK = singleDocMode ? 50 : 30;
  const allIds = new Set(
    Array.from(vectorRanks.keys()).concat(Array.from(fullTextRanks.keys()))
  );
  const scores = new Map<string, number>();
  for (const cid of Array.from(allIds)) {
    const vRank = vectorRanks.has(cid) ? vectorRanks.get(cid)! : Infinity;
    const ftRank = fullTextRanks.has(cid) ? fullTextRanks.get(cid)! : Infinity;
    scores.set(cid, 1 / (rrfK + vRank) + 5.0 * (1 / (rrfK + ftRank)));
  }
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}

// ── chunk-rank extraction (from ES kNN / full-text responses) ─────────────

function collectChunkRanks(response: any): Map<string, number> {
  const ranks = new Map<string, number>();
  let tempRank = 1;
  for (const hit of response.hits.hits) {
    const docId = hit._source.id;
    const innerHits = hit.inner_hits?.['chunks.vectors']?.hits?.hits;
    if (!innerHits) continue;
    for (const chunkHit of innerHits) {
      const fields = chunkHit.fields.chunks[0].vectors[0];
      const chunkText = fields.text[0];
      const chunkTextAnonymized = (fields.text_anonymized || [chunkText])[0];
      ranks.set(encodeChunkId([docId, chunkText, chunkTextAnonymized]), tempRank);
      tempRank += 1;
    }
  }
  return ranks;
}

function collectChunkRanksFullText(response: any): Map<string, number> {
  const ranks = new Map<string, number>();
  let tempRank = 1;
  for (const hit of response.hits.hits) {
    const docId = hit._source.id;
    const innerHits = hit.inner_hits?.['chunks.vectors']?.hits?.hits;
    if (!innerHits) continue;
    for (const chunkHit of innerHits) {
      const chunkText = chunkHit._source.text;
      const chunkTextAnonymized = chunkHit._source.text_anonymized ?? chunkText;
      ranks.set(encodeChunkId([docId, chunkText, chunkTextAnonymized]), tempRank);
      tempRank += 1;
    }
  }
  return ranks;
}

// Chunk ids are (doc_id, text, text_anonymized) tuples in Python (hashable).
// JS Maps need a primitive key, so we encode/decode the tuple as JSON.
function encodeChunkId(id: ChunkId): string {
  return JSON.stringify(id);
}

function decodeChunkId(id: string): ChunkId {
  return JSON.parse(id);
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

function gatherChunksSingleDoc(
  finalRanking: [string, number][],
  chunksToGather: number
): DocChunksMap {
  const docChunks: DocChunksMap = new Map();
  for (const [encodedId] of finalRanking.slice(0, chunksToGather)) {
    const [docId, text, textAnon] = decodeChunkId(encodedId);
    const chunks = docChunks.get(docId) || [];
    chunks.push(makeChunk(docId, text, textAnon));
    docChunks.set(docId, chunks);
  }
  return docChunks;
}

function gatherChunksMultiDoc(
  finalRanking: [string, number][],
  maxDocs = 5,
  maxChunksPerDoc = 5
): DocChunksMap {
  const docChunkScores = new Map<string, [number, string][]>();
  for (const [encodedId, score] of finalRanking) {
    const [docId] = decodeChunkId(encodedId);
    const list = docChunkScores.get(docId) || [];
    list.push([score, encodedId]);
    docChunkScores.set(docId, list);
  }

  const sortedDocs = Array.from(docChunkScores.entries()).sort(
    (a, b) => Math.max(...b[1].map((x) => x[0])) - Math.max(...a[1].map((x) => x[0]))
  );

  const docChunks: DocChunksMap = new Map();
  for (const [docId, scoredChunks] of sortedDocs.slice(0, maxDocs)) {
    const top = [...scoredChunks]
      .sort((a, b) => b[0] - a[0])
      .slice(0, maxChunksPerDoc);
    for (const [, encodedId] of top) {
      const [docId_, text, textAnon] = decodeChunkId(encodedId);
      const chunks = docChunks.get(docId) || [];
      chunks.push(makeChunk(docId_, text, textAnon));
      docChunks.set(docId, chunks);
    }
  }
  return docChunks;
}

// ── document retrieval ───────────────────────────────────────────────────

async function fetchFullDocs(collectionName: string, docIds: string[]): Promise<any[]> {
  if (docIds.length === 0) return [];
  try {
    const client = getElasticClient();
    const resp: any = await client.search({
      index: collectionName,
      query: { terms: { id: docIds } },
      _source: ['id', 'name', 'text', 'text_anonymized', 'preview'],
      size: docIds.length,
    } as any);

    const idToDoc = new Map<string, any>();
    for (const hit of resp.hits?.hits ?? []) {
      const src = hit._source ?? {};
      const docId = src.id ?? hit._id;
      if (docId != null) idToDoc.set(String(docId), src);
    }
    return docIds.filter((id) => idToDoc.has(String(id))).map((id) => idToDoc.get(String(id)));
  } catch (error) {
    console.error('ES fetch failed — falling back to configured retriever', error);
    const docs: any[] = [];
    for (const docId of docIds) {
      const doc = await retrieveDocument(collectionName, docId);
      if (doc && !doc.error) docs.push(doc);
    }
    return docs;
  }
}

// ── result preparation ───────────────────────────────────────────────────

async function prepareResults(params: {
  fullDocs: any[];
  docChunksIdMap: DocChunksMap;
  query: string;
  singleDocMode: boolean;
  forceRag: boolean;
}): Promise<VectorSearchResult[]> {
  const { fullDocs, docChunksIdMap, query, singleDocMode, forceRag } = params;
  const fullDocsFlag = FULL_DOC_KEYWORDS.some((kw) => query.toLowerCase().includes(kw));

  if (forceRag) {
    console.log('FORCE RAG ENABLED');
    return fullDocs.map((doc) => ({
      doc,
      chunks: docChunksIdMap.get(doc.id) || [],
      full_docs: false,
    }));
  }

  if (singleDocMode && fullDocs.length > 0) {
    const tokenCount = await countTokens(fullDocs[0].text);
    console.log(`Number of tokens: ${tokenCount}`);
    if (tokenCount < TOKEN_LIMIT) {
      return [
        {
          full_docs: false,
          doc: fullDocs[0],
          chunks: docChunksIdMap.get(fullDocs[0].id) || [],
        },
      ];
    }
  }

  if (fullDocsFlag) {
    const tokenCounts = await Promise.all(fullDocs.map((doc) => countTokens(doc.text)));
    const totalTokens = tokenCounts.reduce((a, b) => a + b, 0);
    if (totalTokens <= TOKEN_LIMIT) {
      return fullDocResults(fullDocs);
    }
  }

  return fullDocs.map((doc) => ({
    doc,
    chunks: docChunksIdMap.get(doc.id) || [],
    full_docs: false,
  }));
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

function buildQueries(params: {
  query: string;
  embeddings: number[];
  retrievalMethod: string;
  filterIds?: string[] | null;
  collectionId?: string | null;
  knnK: number;
  innerHitsSize: number;
}) {
  const { query, embeddings, retrievalMethod, filterIds, collectionId, knnK, innerHitsSize } =
    params;

  const shouldClauses =
    retrievalMethod === 'hibrid_no_ner'
      ? [{ match: { 'chunks.vectors.text': { query, boost: 5.0 } } }]
      : [
          { match: { 'chunks.vectors.text': { query, boost: 5.0 } } },
          { match: { 'chunks.vectors.entities': { query, boost: 3.0 } } },
        ];

  if (filterIds && filterIds.length > 0) {
    return {
      knnQuery: buildFilteredKnnQuery({
        embeddings,
        filterIds,
        collectionId,
        knnK,
        innerHitsSize,
      }),
      fullTextQuery: buildFilteredFullTextQuery({
        shouldClauses,
        filterIds,
        collectionId,
        innerHitsSize,
      }),
    };
  }

  return {
    knnQuery: buildGlobalKnnQuery({ embeddings, collectionId, knnK, innerHitsSize }),
    fullTextQuery: buildGlobalFullTextQuery({ shouldClauses, collectionId, innerHitsSize }),
  };
}

function buildFilteredKnnQuery(params: {
  embeddings: number[];
  filterIds: string[];
  collectionId?: string | null;
  knnK: number;
  innerHitsSize: number;
}) {
  const { embeddings, filterIds, collectionId, knnK, innerHitsSize } = params;
  const knnFilter = collectionId
    ? {
        bool: {
          must: [
            { terms: { id: filterIds } },
            { term: { 'collectionId.keyword': collectionId } },
          ],
        },
      }
    : { terms: { id: filterIds } };

  return {
    knn: {
      field: 'chunks.vectors.predicted_value',
      query_vector: embeddings,
      k: knnK,
      num_candidates: 2000,
      filter: knnFilter,
      inner_hits: {
        _source: false,
        fields: CHUNK_INNER_HIT_FIELDS,
        size: innerHitsSize,
      },
    },
  };
}

function buildGlobalKnnQuery(params: {
  embeddings: number[];
  collectionId?: string | null;
  knnK: number;
  innerHitsSize: number;
}) {
  const { embeddings, collectionId, knnK, innerHitsSize } = params;
  const knn: any = {
    field: 'chunks.vectors.predicted_value',
    query_vector: embeddings,
    k: knnK,
    inner_hits: {
      _source: false,
      fields: CHUNK_INNER_HIT_FIELDS,
      size: innerHitsSize,
    },
  };
  if (collectionId) {
    knn.filter = { term: { 'collectionId.keyword': collectionId } };
  }
  return { _source: ['id'], knn };
}

function buildFilteredFullTextQuery(params: {
  shouldClauses: any[];
  filterIds: string[];
  collectionId?: string | null;
  innerHitsSize: number;
}) {
  const { shouldClauses, filterIds, collectionId, innerHitsSize } = params;
  const filterList: any[] = [{ terms: { id: filterIds } }];
  if (collectionId) {
    filterList.push({ term: { 'collectionId.keyword': collectionId } });
  }
  return {
    _source: ['id'],
    query: {
      bool: {
        filter: filterList,
        must: {
          nested: {
            path: 'chunks.vectors',
            query: {
              bool: { should: shouldClauses, minimum_should_match: 1 },
            },
            inner_hits: { _source: true, size: innerHitsSize },
          },
        },
      },
    },
  };
}

function buildGlobalFullTextQuery(params: {
  shouldClauses: any[];
  collectionId?: string | null;
  innerHitsSize: number;
}) {
  const { shouldClauses, collectionId, innerHitsSize } = params;
  const nestedQuery = {
    nested: {
      path: 'chunks.vectors',
      query: { bool: { should: shouldClauses, minimum_should_match: 1 } },
      inner_hits: { _source: true, size: innerHitsSize },
    },
  };
  if (collectionId) {
    return {
      _source: ['id'],
      query: {
        bool: {
          filter: [{ term: { 'collectionId.keyword': collectionId } }],
          must: nestedQuery,
        },
      },
    };
  }
  return { _source: ['id'], query: nestedQuery };
}
