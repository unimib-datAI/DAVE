// Shared Elasticsearch index settings/mapping, ported from qavectorizer's
// `get_index_settings()`. Used both when creating an index explicitly
// (elasticAdmin.ts) and when lazily creating one during document indexing
// (documentIndexer.ts).

export function getIndexSettings() {
  return {
    settings: { 'index.mapping.nested_objects.limit': 20000 },
    mappings: {
      properties: {
        text: { type: 'text' },
        text_deanonymized: { type: 'text' },
        name: { type: 'keyword' },
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
                text: { type: 'text' },
                entities: { type: 'text' },
              },
            },
          },
        },
      },
    },
  };
}
