// App-level field encryption for content that must be recoverable in full
// (unlike blindIndex.ts, which is for exact-match-only values). Used for
// Elasticsearch fields that used to be stored as plaintext PII - see
// documentIndexer.ts's `chunks.vectors.text`.
//
// Independent of the external Vault anonymization service: this always
// encrypts, regardless of whether ANONYMIZATION_ENDPOINT is configured.
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const encoded = process.env.FIELD_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is not set - cannot encrypt/decrypt field data. ' +
        'Generate one with `openssl rand -base64 32`.'
    );
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        'Generate one with `openssl rand -base64 32`.'
    );
  }
  return key;
}

/** Encrypts `plaintext`. Output: base64(iv[12] || authTag[16] || ciphertext). */
export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Inverse of `encryptField`. Throws if the value is malformed or tampered with. */
export function decryptField(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Returns `value` decrypted if it is an `encryptField` payload, otherwise
 * `value` unchanged - for data where encrypted and plaintext values coexist
 * (e.g. chunk texts indexed before/after chunk encryption was dropped).
 * AES-GCM authenticates, so plaintext is never mistaken for ciphertext.
 */
export function decryptFieldIfEncrypted(value: string): string {
  if (
    !value ||
    !process.env.FIELD_ENCRYPTION_KEY ||
    value.length < 40 ||
    !/^[A-Za-z0-9+/]+=*$/.test(value)
  ) {
    return value;
  }
  try {
    return decryptField(value);
  } catch {
    return value;
  }
}
