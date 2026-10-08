// Full document indexing pipeline (annotations, chunking, embeddings,
// Elasticsearch indexing), ported from qavectorizer's
// `POST /{elastic_index}/_doc` (index_document_with_processing).
//
// qavectorizer is only called here for embeddings (see embedClient.ts) -
// chunking and the Elasticsearch write itself now happen directly in
// Next.js.

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getElasticClient } from './elasticClient';
import { embedMain } from './embedClient';
import {
  getIndexSettings,
  getAdditiveMappings,
  humanizeDocumentName,
} from './elasticIndexSettings';

// Chunking is tunable without a code change; changing it only affects
// documents indexed afterwards.
const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE) || 500;
const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 100;
// Chunks sent to the embedding service per request. One request for every
// chunk of a large document (a 500 KB contract is ~1200 chunks) is slow
// enough to time out.
const EMBED_BATCH_SIZE = 64;

const mappedIndexes = new Set<string>();

// Brings an index created with an older mapping up to date (see
// getAdditiveMappings). Best-effort, once per index per process.
async function ensureAdditiveMappings(client: any, index: string) {
  if (mappedIndexes.has(index)) return;
  mappedIndexes.add(index);
  for (const mapping of getAdditiveMappings()) {
    try {
      await client.indices.putMapping({ index, ...mapping } as any);
    } catch (error) {
      console.warn(`Could not update the mapping of "${index}"`, error);
    }
  }
}

async function embedInBatches(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    embeddings.push(...(await embedMain(texts.slice(i, i + EMBED_BATCH_SIZE))));
  }
  return embeddings;
}

export type IndexDocumentInput = {
  id: string;
  text: string;
  collectionId: string;
  annotationSets?: Record<string, any> | null;
  preview?: string | null;
  name?: string | null;
  features?: Record<string, any> | null;
  offsetType?: string | null;
  textDeanonymized?: string | null;
};

function processAnnotation(annotation: any, text: string, documentId: string) {
  const name = text.slice(annotation.start, annotation.end);

  const annObject: Record<string, any> = {
    mention: name,
    start: annotation.start,
    end: annotation.end,
    id: annotation.id,
    type: annotation.type,
  };

  const linking = annotation.features?.linking;
  if (linking && linking.is_nil !== true) {
    Object.assign(annObject, {
      display_name: annotation.features?.title ?? name,
      is_linked: true,
      id_ER: linking.top_candidate?.url ?? '',
    });
  } else {
    Object.assign(annObject, {
      display_name: name,
      is_linked: false,
      id_ER: `${documentId}_${name}`,
    });
  }

  return annObject;
}

function cleanDocumentData(fileObject: Record<string, any>) {
  for (const key of ['annotation_sets', 'annoation_sets', 'features', '_id']) {
    delete fileObject[key];
  }
  if (!('metadata' in fileObject)) {
    fileObject.metadata = [];
  }
  return fileObject;
}

// Indexes a document with full processing: annotations, chunking, embeddings.
export async function indexDocument(elasticIndex: string, input: IndexDocumentInput) {
  const client = getElasticClient();

  const textDeanonymized = input.textDeanonymized || input.text;

  const fileObject: Record<string, any> = {
    id: input.id,
    text: input.text,
    text_deanonymized: textDeanonymized,
    annotation_sets: input.annotationSets ?? null,
    preview: input.preview,
    name: input.name,
    name_text: humanizeDocumentName(input.name),
    features: input.features,
    offset_type: input.offsetType,
    collectionId: input.collectionId,
  };

  // Process annotations
  const annotationSets = fileObject.annotation_sets || {};
  const entities = annotationSets.entities_ || {};
  const rawAnnotations = entities.annotations || [];

  const annotations = [];
  for (const annotation of rawAnnotations) {
    try {
      annotations.push(processAnnotation(annotation, fileObject.text, fileObject.id));
    } catch (error) {
      console.warn('Error processing annotation:', error, annotation);
    }
  }
  fileObject.annotations = annotations;

  // Clean up the document
  cleanDocumentData(fileObject);

  // Ensure index exists
  const indexExists = await client.indices.exists({ index: elasticIndex });
  if (!indexExists) {
    await client.indices.create({
      index: elasticIndex,
      ...getIndexSettings(),
    } as any);
    mappedIndexes.add(elasticIndex);
  } else {
    await ensureAdditiveMappings(client, elasticIndex);
  }

  // Chunk and embed - use de-anonymized text for embeddings if available
  const textForChunking = textDeanonymized;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const chunks = await splitter.splitText(textForChunking);
  // Also chunk the anonymized text for preview purposes
  const chunksAnonymized = await splitter.splitText(fileObject.text);

  if (chunks.length > 0) {
    // A chunk rarely names the document it comes from ("the Agreement",
    // "the Company"), so the title is embedded with it - a query naming the
    // document then lands on its chunks. The stored text stays the raw chunk.
    const title = fileObject.name_text;
    const embeddings = await embedInBatches(
      title ? chunks.map((chunk) => `${title}\n${chunk}`) : chunks
    );

    fileObject.chunks = chunks.map((chunk, i) => {
      const chunkAnonymized = chunksAnonymized[i] ?? chunk;
      return {
        vectors: {
          predicted_value: embeddings[i],
          text: chunk, // De-anonymized text for generation
          text_anonymized: chunkAnonymized, // Anonymized text for preview
          entities: '',
        },
      };
    });
  }

  const res: any = await client.index({
    index: elasticIndex,
    document: fileObject,
  } as any);

  return { result: res.result, id: fileObject.id };
}
