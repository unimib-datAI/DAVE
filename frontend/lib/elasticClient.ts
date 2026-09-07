import { Client } from '@elastic/elasticsearch';
import { serverConfig } from '@/lib/config/server';

let client: Client | null = null;

export function getElasticClient(): Client {
  if (!client) {
    client = new Client({
      node: serverConfig.elastic.node,
      requestTimeout: 60000,
    });
  }
  return client;
}
