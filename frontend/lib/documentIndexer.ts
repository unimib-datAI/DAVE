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
import { getIndexSettings } from './elasticIndexSettings';

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
  }

  // Chunk and embed - use de-anonymized text for embeddings if available
  const textForChunking = textDeanonymized;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const chunks = await splitter.splitText(textForChunking);
  // Also chunk the anonymized text for preview purposes
  const chunksAnonymized = await splitter.splitText(fileObject.text);

  if (chunks.length > 0) {
    const embeddings = await embedMain(chunks);

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
  await client.indices.refresh({ index: elasticIndex });

  return { result: res.result, id: fileObject.id };
}
