// Ported from backend/documents/src/utils/anonymization.js
import axios from 'axios';

const endpoint = (process.env.ANONYMIZATION_ENDPOINT || '').trim();
// Anonymization is optional. When ANONYMIZATION_ENDPOINT is not configured we
// must NOT fall back to some default host: previously the default was an
// unroutable internal IP, so every encrypt/decrypt call hung until the axios
// timeout fired ("timeout of 8000ms exceeded" / ECONNABORTED) and spammed the
// logs with "Error encrypting value". Instead, when no endpoint is set we skip
// the network calls entirely and treat values as pass-through (not anonymized).
const anonymizationEnabled = endpoint.length > 0;

let warnedDisabled = false;
function warnAnonymizationDisabled(): void {
  if (warnedDisabled) return;
  warnedDisabled = true;
  console.info(
    'ANONYMIZATION_ENDPOINT is not set - skipping anonymization service calls (values are left unencrypted).'
  );
}

// None of the axios calls in this file had a timeout configured (neither
// here nor in the original backend/documents/src/utils/anonymization.js),
// so when the anonymization service is unreachable a request hangs for the
// OS's TCP connect timeout - which can be minutes or effectively indefinite
// depending on network config - and nothing ever resolves the caller's
// loading state. Fail fast instead.
const REQUEST_TIMEOUT_MS = 8000;

async function makeEncryptionRequest(valueToEncrypt: string): Promise<any> {
  if (!anonymizationEnabled) {
    warnAnonymizationDisabled();
    // Pass-through: callers use `result.vaultKey || originalValue`.
    return { fieldToEncrypt: valueToEncrypt, vaultKey: null, error: null };
  }
  try {
    const res = await axios({
      method: 'post',
      url: `${endpoint}/transit/encrypt`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        fieldToEncrypt: valueToEncrypt,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return res.data;
  } catch (error: any) {
    console.error('Error encrypting value:', valueToEncrypt, error);
    return {
      fieldToEncrypt: valueToEncrypt,
      vaultKey: null,
      error: error.message,
    };
  }
}

export async function makeDecryptionRequest(
  valueToDecrypt: string,
  retries = 3
): Promise<any> {
  let lastError: any;
  if (!anonymizationEnabled) {
    warnAnonymizationDisabled();
    return {
      fieldToDecrypt: valueToDecrypt,
      decryptedData: null,
      error: null,
    };
  }
  if (valueToDecrypt.startsWith('vault:v1')) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(
          `${endpoint}/transit/decrypt`,
          { fieldToDecrypt: valueToDecrypt },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQUEST_TIMEOUT_MS,
          }
        );

        return res.data;
      } catch (error: any) {
        lastError = error;
        console.error(
          `Decrypt attempt ${attempt} failed for value:`,
          valueToDecrypt,
          error.message
        );

        // If this was the last attempt, fall through
        if (attempt === retries) break;
      }
    }
  }

  return {
    fieldToDecrypt: valueToDecrypt,
    decryptedData: null,
    error: lastError?.message ?? 'Unknown error',
  };
}

/**
 * Attempt to decrypt multiple values in a single batch request.
 * Falls back to per-key decryption if the anonymization service doesn't support batch.
 * Returns an array of results matching the input order where each item is
 * { fieldToDecrypt, decryptedData, error? }
 */
export async function makeBatchDecryptionRequest(
  valuesToDecrypt: string[],
  retries = 1
): Promise<any[]> {
  if (!Array.isArray(valuesToDecrypt) || valuesToDecrypt.length === 0) {
    return [];
  }

  if (!anonymizationEnabled) {
    warnAnonymizationDisabled();
    return valuesToDecrypt.map((v) => ({
      fieldToDecrypt: v,
      decryptedData: null,
      error: null,
    }));
  }

  // Only attempt batch for values that look like vault tokens; non-vault tokens
  // will be returned unchanged as decryptedData.
  const results = valuesToDecrypt.map((v) => ({
    fieldToDecrypt: v,
    decryptedData: null as any,
    error: null as any,
  }));

  const vaultValues = valuesToDecrypt.filter(
    (v) => typeof v === 'string' && v.startsWith('vault:')
  );
  if (vaultValues.length === 0) {
    // no vault values to call the service for
    return results.map((r) => ({ ...r, decryptedData: r.fieldToDecrypt }));
  }

  // Try the anonymization service batch endpoint. Many deployments expose
  // a batch decrypt route; we try /transit/decrypt/batch but fall back to
  // individual calls if it's not available.
  try {
    // The anonymization service expects a plain JSON array of strings
    // (see OpenAPI: request body is [ "string" ]). It returns a map
    // of original->decrypted values. Send the array directly.
    const res = await axios.post(`${endpoint}/transit/decrypt/batch`, vaultValues, {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const data = res.data;
    // Normalize response: accept either an array of { fieldToDecrypt, decryptedData }
    // or an object map { [field]: decryptedValue }.
    const map = new Map<string, any>();
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item && item.fieldToDecrypt)
          map.set(item.fieldToDecrypt, item.decryptedData ?? null);
      }
    } else if (data && typeof data === 'object') {
      // map values: if data has keys equal to fields
      for (const k of Object.keys(data)) {
        map.set(k, data[k]);
      }
    }

    return valuesToDecrypt.map((v) => {
      if (!v || typeof v !== 'string') return { fieldToDecrypt: v, decryptedData: v };
      if (!v.startsWith('vault:')) return { fieldToDecrypt: v, decryptedData: v };
      const decrypted = map.has(v) ? map.get(v) : null;
      return {
        fieldToDecrypt: v,
        decryptedData: decrypted,
        error: decrypted ? null : 'Not decrypted',
      };
    });
  } catch (err: any) {
    // If the batch endpoint is not available (404, 405) or fails, fall back
    // to individual decryption requests to preserve existing behavior.
    console.warn('Batch decryption failed, falling back to per-key decryption', err.message);
    const perKey = await Promise.all(valuesToDecrypt.map((v) => makeDecryptionRequest(v)));
    return perKey;
  }
}

/**
 * Extract the annotation text from a document text using exclusive end index.
 * Returns UNKNOWN_ANNOTATION_TEXT if indexes out of range.
 */
function getAnnotationDisplayText(
  annotationStart: number,
  annotationEnd: number,
  text: string
): string {
  // annotationEnd is exclusive; slice end is exclusive so we use annotationEnd
  if (
    Number.isInteger(annotationStart) &&
    Number.isInteger(annotationEnd) &&
    annotationStart >= 0 &&
    annotationEnd > annotationStart &&
    annotationEnd <= text.length
  ) {
    return text.slice(annotationStart, annotationEnd);
  } else {
    return 'UNKNOWN_ANNOTATION_TEXT';
  }
}

/**
 * Replace a substring defined by exclusive `end` index.
 */
function replaceSubstring(str: string, start: number, end: number, replacement: string) {
  const before = str.substring(0, start);
  const after = str.substring(end);
  return before + replacement + after;
}

/**
 * Decode (de-anonymize) a document in-place and return it.
 * - Handles exclusive `end` indexes.
 * - Decrypts using API.
 * - Adjusts subsequent annotations correctly ACROSS ALL ANNOTATION SETS.
 */
export async function decode(doc: any): Promise<any> {
  if (!doc || typeof doc !== 'object') {
    throw new TypeError('decode: doc must be an object');
  }

  if (
    !(doc.annotation_sets && doc.features?.clusters && typeof doc.text === 'string')
  ) {
    // Nothing to do, return doc unchanged (but still mark if name present)
    if (typeof doc.name === 'string') doc.name += '_ANNOTATED';
    return doc;
  }

  // First, decrypt all cluster titles (unchanged behaviour)
  // Collect all keys that need decryption (cluster titles + annotation originalKeys)
  const keysToDecryptSet = new Set<string>();
  for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
    for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
      const cluster = doc.features.clusters[clusterAnnSet][i];
      const encryptedTitle = cluster.title;
      if (typeof encryptedTitle === 'string' && encryptedTitle.startsWith('vault:')) {
        keysToDecryptSet.add(encryptedTitle);
      }
    }
  }

  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    for (const annotation of anns) {
      const originalKey = annotation.originalKey;
      if (typeof originalKey === 'string' && originalKey.startsWith('vault:')) {
        keysToDecryptSet.add(originalKey);
      }
    }
  }

  const keysToDecrypt = Array.from(keysToDecryptSet);
  let decryptedResultsMap = new Map<string, any>();
  if (keysToDecrypt.length > 0) {
    try {
      const batchResults = await makeBatchDecryptionRequest(keysToDecrypt);
      for (const r of batchResults) {
        if (r && r.fieldToDecrypt) {
          decryptedResultsMap.set(r.fieldToDecrypt, r.decryptedData ?? null);
        }
      }
    } catch (e) {
      console.error('Batch decryption failed in decode():', e);
    }
  }

  // Apply decrypted cluster titles
  for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
    for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
      const cluster = doc.features.clusters[clusterAnnSet][i];

      const encryptedTitle = cluster.title;
      if (typeof encryptedTitle === 'string' && encryptedTitle.startsWith('vault:')) {
        const decrypted = decryptedResultsMap.get(encryptedTitle);
        if (decrypted) cluster.title = decrypted;
      }
    }
  }

  // Helper: shift all annotations starting at or after fromPosition by delta.
  function shiftAllAnnotations(fromPosition: number, delta: number) {
    for (const annsetName of Object.keys(doc.annotation_sets)) {
      const anns = doc.annotation_sets[annsetName].annotations ?? [];
      for (const annotation of anns) {
        if (Number.isInteger(annotation.start) && annotation.start >= fromPosition) {
          annotation.start += delta;
          annotation.end += delta;
        }
      }
    }
  }

  // Build a global list of annotations across all annotation sets and sort by start.
  const globalAnns: { annsetName: string; annotation: any }[] = [];
  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    for (let idx = 0; idx < anns.length; idx++) {
      globalAnns.push({ annsetName, annotation: anns[idx] });
    }
  }
  globalAnns.sort((a, b) => (a.annotation.start || 0) - (b.annotation.start || 0));

  let lastProcessedEnd = -1;

  for (let i = 0; i < globalAnns.length; i++) {
    const { annsetName, annotation } = globalAnns[i];

    // Validate annotation indexes
    if (
      !Number.isInteger(annotation.start) ||
      !Number.isInteger(annotation.end) ||
      annotation.start < 0 ||
      annotation.end <= annotation.start
    ) {
      continue;
    }

    // If this annotation overlaps a previously processed one, skip it.
    if (annotation.start < lastProcessedEnd) {
      continue;
    }

    // Use ONLY `annotation.originalKey` as the single source of truth for decryption.
    // Do not attempt to extract tokens from other fields or from the document text.
    const originalKey = annotation.originalKey;
    if (!originalKey || typeof originalKey !== 'string') {
      console.error(
        `[DECODE] missing originalKey for annset=${annsetName} idx=${i} start=${annotation.start} end=${annotation.end}`
      );
      // Do not attempt fallback decryption; leave the annotation as-is.
      continue;
    }

    let deAnonymized: string | null = null;
    if (originalKey.startsWith('vault:')) {
      const decrypted = decryptedResultsMap.get(originalKey);
      if (decrypted && typeof decrypted === 'string') {
        deAnonymized = decrypted;
      } else {
        console.error(
          `[DECODE] Vault failed to decrypt for annset=${annsetName} idx=${i} key='${String(
            originalKey
          ).slice(0, 120)}' decrypted=${String(decrypted)}`
        );
        continue;
      }
    } else {
      // originalKey is not a vault token; treat it as plaintext (this handles any legacy cases
      // where the originalKey was stored as plaintext). We still use only this field.
      deAnonymized = originalKey;
    }

    if (!annotation.features) annotation.features = {};
    annotation.features.mention = deAnonymized;

    const originalStart = annotation.start;
    const originalEnd = annotation.end; // exclusive (current positions)
    const oldLen = originalEnd - originalStart;
    const newLen = deAnonymized.length;
    const delta = newLen - oldLen;

    // Replace the substring in the document text with the decrypted mention text
    doc.text = replaceSubstring(doc.text, originalStart, originalEnd, deAnonymized);

    // Update the current annotation end (exclusive)
    annotation.end = originalStart + newLen;

    // Shift ALL annotations across ALL sets that start at or after originalEnd
    if (delta !== 0) {
      shiftAllAnnotations(originalEnd, delta);
    }

    // Mark last processed end
    lastProcessedEnd = annotation.end;
  }

  if (typeof doc.name === 'string') {
    doc.name += '_ANNOTATED';
  } else {
    doc.name = (doc.name ?? '') + '_ANNOTATED';
  }

  return doc;
}

/**
 * Encode (anonymize) a document in-place and return it.
 * - Uses exclusive `end` indexes.
 * - Encrypts using API.
 * - Adjusts subsequent annotations correctly ACROSS ALL ANNOTATION SETS.
 */
export async function encode(doc: any, anonymizeTypes: string[] | null = null): Promise<any> {
  if (!doc || typeof doc !== 'object') {
    throw new TypeError('encode: doc must be an object');
  }

  if (
    !(doc.annotation_sets && doc.features?.clusters && typeof doc.text === 'string')
  ) {
    if (typeof doc.name === 'string') doc.name += '_ANNOTATED';
    return doc;
  }

  const encryptedTitles: Record<string, any[]> = {};

  // Encrypt all cluster titles and store mapping
  for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
    encryptedTitles[clusterAnnSet] = [];
    for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
      const cluster = doc.features.clusters[clusterAnnSet][i];
      if (anonymizeTypes && anonymizeTypes.includes(cluster.type)) {
        const originalTitle = cluster.title;
        const result = await makeEncryptionRequest(originalTitle);
        const encryptedTitle = result.vaultKey || originalTitle;

        // Update cluster title with encrypted version
        cluster.title = encryptedTitle;
        encryptedTitles[clusterAnnSet][i] = encryptedTitle;

        // For each mention in this cluster, encrypt and store in originalKey
        if (cluster.mentions) {
          for (const mention of cluster.mentions) {
            if (mention.text) {
              const mentionResult = await makeEncryptionRequest(mention.text);
              mention.originalKey = mentionResult.vaultKey || mention.text;
            }
          }
        }
      }
    }
  }

  // Helper function to shift all annotations that start at or after a given position
  // This is critical to prevent index mismatches across annotation sets
  function shiftAllAnnotations(fromPosition: number, delta: number) {
    for (const annsetName of Object.keys(doc.annotation_sets)) {
      const anns = doc.annotation_sets[annsetName].annotations ?? [];
      for (const annotation of anns) {
        if (Number.isInteger(annotation.start) && annotation.start >= fromPosition) {
          annotation.start += delta;
          annotation.end += delta;
        }
      }
    }
  }

  // Process annotations in global document order to keep encode/decode symmetric
  // Build a global list of annotations across all annotation sets and sort by start.
  const globalAnns: { annsetName: string; annotation: any }[] = [];
  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    for (let idx = 0; idx < anns.length; idx++) {
      globalAnns.push({ annsetName, annotation: anns[idx] });
    }
  }
  globalAnns.sort((a, b) => (a.annotation.start || 0) - (b.annotation.start || 0));

  // Track the last processed end to avoid overlapping replacements
  let lastProcessedEnd = -1;

  for (let i = 0; i < globalAnns.length; i++) {
    const { annsetName, annotation } = globalAnns[i];

    // Skip annotation if anonymizeTypes is provided and type is not in the list
    if (anonymizeTypes && !anonymizeTypes.includes(annotation.type)) {
      continue;
    }

    // Validate annotation indexes
    if (
      !Number.isInteger(annotation.start) ||
      !Number.isInteger(annotation.end) ||
      annotation.start < 0 ||
      annotation.end < annotation.start
    ) {
      console.warn(`[ENCODE] Skipping malformed annotation annset=${annsetName} idx=${i}`);
      continue;
    }

    // Skip overlapping annotations - keep behavior consistent with decode
    if (annotation.start < lastProcessedEnd) {
      console.warn(
        `[ENCODE] Skipping overlapping annotation annset=${annsetName} start=${annotation.start} < lastProcessedEnd=${lastProcessedEnd}`
      );
      continue;
    }

    const text = getAnnotationDisplayText(annotation.start, annotation.end, doc.text);

    // Find the cluster that contains this annotation's ID in its mentions
    let clusterIndex = -1;
    const annotationId = annotation.id;
    if (doc.features.clusters[annsetName]) {
      for (let j = 0; j < doc.features.clusters[annsetName].length; j++) {
        const cluster = doc.features.clusters[annsetName][j];
        if (cluster.mentions && cluster.mentions.some((mention: any) => mention.id === annotationId)) {
          clusterIndex = j;
          break;
        }
      }
    }

    // Get the encrypted version of the mention text and store in originalKey
    const encResult = await makeEncryptionRequest(text);
    const encryptedMention = encResult.vaultKey || text;
    annotation.originalKey = encryptedMention;

    // Ensure annotation.features exists. Do NOT write the encrypted key into features.mention;
    // `annotation.originalKey` is the single source of truth for the encrypted mention.
    if (!annotation.features) annotation.features = {};

    // Anonymize the title for linked entities if present (unchanged behaviour)
    if (annotation.features.title) {
      const titleResult = await makeEncryptionRequest(annotation.features.title);
      annotation.features.title = titleResult.vaultKey || annotation.features.title;
    }

    // Use the encrypted cluster title as replacement text when applicable
    const replacement =
      (clusterIndex >= 0 &&
        encryptedTitles[annsetName] &&
        encryptedTitles[annsetName][clusterIndex]) ||
      encryptedMention;

    const originalStart = annotation.start;
    const originalEnd = annotation.end; // exclusive
    const oldLen = originalEnd - originalStart;
    const newLen = replacement.length;
    const delta = newLen - oldLen;

    // Replace the substring in the canonical doc.text using exclusive end
    doc.text = replaceSubstring(doc.text, originalStart, originalEnd, replacement);

    // Update the annotation end (exclusive)
    annotation.end = originalStart + newLen;

    // Shift ALL annotations across ALL sets that start at or after originalEnd
    if (delta !== 0) {
      shiftAllAnnotations(originalEnd, delta);
    }

    // Update last processed end position
    lastProcessedEnd = annotation.end;
  }

  if (typeof doc.name === 'string') {
    doc.name += '_ANNOTATED';
  } else {
    doc.name = (doc.name ?? '') + '_ANNOTATED';
  }

  // Only mark the document as anonymized if the anonymization service actually
  // ran; otherwise values are still plaintext.
  doc.features.anonymized = anonymizationEnabled;
  return doc;
}

/**
 * Convenience wrapper used by external code
 */
export async function processDocument(
  doc: any,
  toEncode = true,
  anonymizeTypes: string[] | null = null
): Promise<any> {
  try {
    return toEncode ? await encode(doc, anonymizeTypes) : await decode(doc);
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
}
