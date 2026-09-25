// Deterministic keyed hash for exact-match search/grouping without storing
// the real value. Used in place of embedding a raw entity name inside an
// Elasticsearch keyword field (e.g. the synthetic `id_ER` used for entities
// that aren't linked to a resolved real-world identity) - same real name
// always hashes to the same value, so facet grouping/filtering keeps
// working, but the name itself is never stored.
//
// Not reversible by design (unlike fieldEncryption.ts) - only use this for
// values that only ever need equality comparison, never display.
import { createHmac } from 'crypto';

function getSecret(): string {
  const secret = process.env.BLIND_INDEX_SECRET;
  if (!secret) {
    throw new Error(
      'BLIND_INDEX_SECRET is not set - cannot compute blind index. ' +
        'Generate one with `openssl rand -base64 32`.'
    );
  }
  return secret;
}

// NFKC + trim + collapse whitespace + lowercase, so visually/functionally
// equivalent names (extra spaces, case, Unicode composition differences)
// hash identically - matching the case-insensitive grouping already done
// elsewhere for display names.
function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Deterministic HMAC-SHA256(secret, normalize(value)), hex-encoded. */
export function blindIndex(value: string): string {
  return createHmac('sha256', getSecret())
    .update(normalize(value))
    .digest('hex');
}
