// Shared Elasticsearch index settings/mapping, ported from qavectorizer's
// `get_index_settings()`. Used both when creating an index explicitly
// (elasticAdmin.ts) and when lazily creating one during document indexing
// (documentIndexer.ts).

// `name` is a keyword (exact match, sorting) and file-name-like titles
// ("EtonPharmaceuticalsInc_20191114_10-Q_EX-10.1") don't tokenize into
// words anyway, so the RAG full-text query matches against `name_text`:
// the title rewritten as plain words by humanizeDocumentName.
const NAME_TEXT_MAPPING = { type: 'text' };

export function humanizeDocumentName(name?: string | null): string {
  let decoded = name ?? '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // not URL-encoded
  }
  return decoded
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-~|,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stemmed variants of the chunk text, so the RAG full-text query matches
// inflected forms ("contratti" / "contratto", "agreements" / "agreement").
const CHUNK_TEXT_MAPPING = {
  type: 'text',
  fields: {
    it: { type: 'text', analyzer: 'italian' },
    en: { type: 'text', analyzer: 'english' },
  },
};

// Sub-fields added to the mapping after the first indexes were created.
// Elasticsearch accepts new multi-fields on an existing field, but only
// documents indexed afterwards populate them. Each entry is applied on its
// own so one conflict (e.g. an old index mapping chunk text as `binary`)
// doesn't block the others.
export function getAdditiveMappings() {
  return [
    { properties: { name_text: NAME_TEXT_MAPPING } },
    {
      properties: {
        chunks: {
          type: 'nested',
          properties: {
            vectors: {
              type: 'nested',
              properties: { text: CHUNK_TEXT_MAPPING },
            },
          },
        },
      },
    },
  ];
}

export function getIndexSettings() {
  return {
    settings: { 'index.mapping.nested_objects.limit': 20000 },
    mappings: {
      properties: {
        text: { type: 'text' },
        text_deanonymized: { type: 'text' },
        name: { type: 'keyword' },
        name_text: NAME_TEXT_MAPPING,
        preview: { type: 'keyword' },
        id: { type: 'keyword' },
        metadata: {
          type: 'nested',
          properties: {
            type: { type: 'keyword' },
            value: { type: 'keyword' },
          },
        },
        annotations: {
          type: 'nested',
          properties: {
            mention: { type: 'keyword' },
            start: { type: 'integer' },
            end: { type: 'integer' },
            display_name: { type: 'keyword' },
            id: { type: 'integer' },
            type: { type: 'keyword' },
            is_linked: { type: 'boolean' },
            id_ER: { type: 'keyword' },
          },
        },
        chunks: {
          type: 'nested',
          properties: {
            vectors: {
              type: 'nested',
              properties: {
                predicted_value: {
                  type: 'dense_vector',
                  index: true,
                  dims: 768,
                  similarity: 'cosine',
                },
                text: CHUNK_TEXT_MAPPING,
                entities: { type: 'text' },
              },
            },
          },
        },
      },
    },
  };
}
