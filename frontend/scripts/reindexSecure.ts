// ── One-off migration: reindex every document into a fresh Elasticsearch  ──
// ── index that no longer holds plaintext PII.                             ──
//
// Before this fix, `documentIndexer.ts` wrote several fields to
// Elasticsearch as raw plaintext regardless of anonymization settings
// (`text_deanonymized`, unencrypted `chunks.vectors.text`, raw
// `annotations.mention`/`display_name`/`id_ER`). Patching the write code
// does nothing for documents already indexed - this script re-indexes every
// document, sourced fresh from MongoDB (the actual, already-safe source of
// truth), through the SAME `indexDocument()` write path the app now uses,
// via `reindexDocumentFromMongo()` (see lib/documentIndexer.ts) - so there
// is exactly one code path for "how a document gets indexed," and it can
// never drift between "new document" and "migrated document".
//
// This is an OPERATOR-RUN SCRIPT AGAINST A REAL CLUSTER. It is never run
// automatically (not from app startup, not from CI). It writes into a new
// `--target-index`, never the live `ELASTIC_INDEX` - switching the app over
// is a manual, separate step (see the runbook at the bottom of this file).
//
// Usage:
//   cd frontend
//   npm run reindex:secure -- --target-index=dave_v2
//
// Requires (in frontend/.env or the shell environment): MONGO, ELASTIC_HOST,
// ELASTIC_PORT, API_INDEXER, FIELD_ENCRYPTION_KEY, BLIND_INDEX_SECRET.

import 'dotenv/config';
import { DocumentModel } from '../lib/db/models/Document';
import { dbConnect } from '../lib/db/connection';
import { createOrGetElasticIndex } from '../lib/elasticAdmin';
import { reindexDocumentFromMongo } from '../lib/documentIndexer';
import { serverConfig } from '../lib/config/server';

const BATCH_SIZE = 50;

function parseTargetIndex(): string {
  const arg = process.argv.find((a) => a.startsWith('--target-index='));
  const fromArg = arg?.split('=')[1];
  const target = fromArg || process.env.REINDEX_TARGET_INDEX;
  if (!target) {
    console.error(
      'Missing target index. Pass --target-index=<name> or set REINDEX_TARGET_INDEX.'
    );
    process.exit(1);
  }
  if (target === serverConfig.elastic.index) {
    console.error(
      `--target-index (${target}) must not be the live ELASTIC_INDEX. ` +
        'Reindex into a new index, then cut over by changing ELASTIC_INDEX ' +
        'once you have verified it.'
    );
    process.exit(1);
  }
  return target;
}

function requireConfig() {
  const missing: string[] = [];
  if (!serverConfig.mongo.uri) missing.push('MONGO');
  if (!serverConfig.embeddings.baseUrl) missing.push('API_INDEXER');
  if (!serverConfig.crypto.fieldEncryptionKey) missing.push('FIELD_ENCRYPTION_KEY');
  if (!serverConfig.crypto.blindIndexSecret) missing.push('BLIND_INDEX_SECRET');
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function main() {
  requireConfig();
  const targetIndex = parseTargetIndex();

  await dbConnect();
  await createOrGetElasticIndex(targetIndex);

  const total = await DocumentModel.countDocuments({});
  console.log(`Reindexing ${total} document(s) into "${targetIndex}"...`);

  let processed = 0;
  let succeeded = 0;
  const failures: Array<{ id: string; error: string }> = [];

  const cursor = DocumentModel.find({}, { id: 1, collectionId: 1 })
    .lean()
    .cursor({ batchSize: BATCH_SIZE });

  for await (const doc of cursor) {
    const id = String((doc as any).id);
    const collectionId = (doc as any).collectionId as string | undefined;
    processed += 1;
    try {
      await reindexDocumentFromMongo(targetIndex, id, collectionId);
      succeeded += 1;
    } catch (error: any) {
      failures.push({ id, error: error?.message ?? String(error) });
      console.error(`Failed to reindex document ${id}:`, error?.message ?? error);
    }
    if (processed % BATCH_SIZE === 0 || processed === total) {
      console.log(`  ${processed}/${total} processed (${succeeded} succeeded)`);
    }
  }

  console.log('\n── Reindex summary ──────────────────────────────────────');
  console.log(`Target index: ${targetIndex}`);
  console.log(`Total: ${total}, succeeded: ${succeeded}, failed: ${failures.length}`);
  if (failures.length) {
    console.log('Failed document ids:');
    for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
  }
  console.log(`
Next steps (manual, do not automate):
  1. Compare counts: GET ${targetIndex}/_count vs GET ${serverConfig.elastic.index}/_count
  2. Spot-check a few documents in "${targetIndex}": confirm no
     "text_deanonymized" field, "chunks.vectors.text" is an opaque base64
     blob, "annotations" has no "mention" field, and "id_ER"/"display_name"
     look like hex/vault:/aesgcm: strings rather than real names.
  3. Once satisfied, update ELASTIC_INDEX to "${targetIndex}" and restart
     the app.
  4. Restrict access to (or delete) the old index - it still holds
     plaintext PII from before this fix; reindexing does not scrub it.
`);

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Reindex script failed:', error);
  process.exit(1);
});
