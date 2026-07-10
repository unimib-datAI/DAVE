import { Client } from '@elastic/elasticsearch';

let client: Client | null = null;

export function getElasticClient(): Client {
  if (!client) {
    const host = process.env.ELASTIC_HOST || 'es';
    const port = process.env.ELASTIC_PORT || '9200';
    client = new Client({
      node: `http://${host}:${port}`,
      requestTimeout: 60000,
    });
  }
  return client;
}
