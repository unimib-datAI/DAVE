import axios from "axios";

const endpoint = process.env.ANONYMIZATION_ENDPOINT || "http://10.0.0.108:8081";

async function makeEncryptionRequest(valueToEncrypt) {
  try {
    const res = await axios({
      method: "post",
      url: `${endpoint}/transit/encrypt`,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        fieldToEncrypt: valueToEncrypt,
      },
    });
    return res.data;
  } catch (error) {
    console.error("Error encrypting value:", valueToEncrypt, error);
    return {
      fieldToEncrypt: valueToEncrypt,
      vaultKey: null,
      error: error.message,
    };
  }
}

export async function makeDecryptionRequest(valueToDecrypt) {
  try {
    const res = await axios({
      method: "post",
      url: `${endpoint}/transit/decrypt`,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        fieldToDecrypt: valueToDecrypt,
      },
    });
    return res.data;
  } catch (error) {
    console.error("Error decrypting value:", valueToDecrypt, error);
    return {
      fieldToDecrypt: valueToDecrypt,
      decryptedData: null,
      error: error.message,
    };
  }
}

/**
 * Extract the annotation text from a document text using exclusive end index.
 * Returns UNKNOWN_ANNOTATION_TEXT if indexes out of range.
 */
function getAnnotationDisplayText(annotationStart, annotationEnd, text) {
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
    return "UNKNOWN_ANNOTATION_TEXT";
  }
}

/**
 * Replace a substring defined by exclusive `end` index.
 */
function replaceSubstring(str, start, end, replacement) {
  console.log(`*** replacing ${str.slice(start, end)} with ${replacement}`);
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
export async function decode(doc) {
  if (!doc || typeof doc !== "object") {
    throw new TypeError("decode: doc must be an object");
  }

  if (
    !(
      doc.annotation_sets &&
      doc.features?.clusters &&
      typeof doc.text === "string"
    )
  ) {
    // Nothing to do, return doc unchanged (but still mark if name present)
    if (typeof doc.name === "string") doc.name += "_ANNOTATED";
    return doc;
  }

  // First, decrypt all cluster titles (unchanged behaviour)
  for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
    for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
      const cluster = doc.features.clusters[clusterAnnSet][i];
      const encryptedTitle = cluster.title;
      const result = await makeDecryptionRequest(encryptedTitle);
      if (result?.decryptedData) {
        cluster.title = result.decryptedData;
      }
    }
  }

  // Helper: shift all annotations starting at or after fromPosition by delta.
  function shiftAllAnnotations(fromPosition, delta) {
    for (const annsetName of Object.keys(doc.annotation_sets)) {
      const anns = doc.annotation_sets[annsetName].annotations ?? [];
      for (const annotation of anns) {
        if (
          Number.isInteger(annotation.start) &&
          annotation.start >= fromPosition
        ) {
          annotation.start += delta;
          annotation.end += delta;
        }
      }
    }
  }

  // Build a global list of annotations across all annotation sets and sort by start.
  const globalAnns = [];
  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    for (let idx = 0; idx < anns.length; idx++) {
      globalAnns.push({ annsetName, annotation: anns[idx] });
    }
  }
  globalAnns.sort(
    (a, b) => (a.annotation.start || 0) - (b.annotation.start || 0),
  );

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
      console.log(
        `[DECODE] skipping malformed annotation annset=${annsetName} idx=${i}`,
      );
      continue;
    }

    // If this annotation overlaps a previously processed one, skip it.
    if (annotation.start < lastProcessedEnd) {
      console.log(
        `[DECODE] skipping overlapping annotation annset=${annsetName} start=${annotation.start} < lastProcessedEnd=${lastProcessedEnd}`,
      );
      continue;
    }

    const extracted = getAnnotationDisplayText(
      annotation.start,
      annotation.end,
      doc.text,
    );

    // Use ONLY `annotation.originalKey` as the single source of truth for decryption.
    // Do not attempt to extract tokens from other fields or from the document text.
    const originalKey = annotation.originalKey;
    if (!originalKey || typeof originalKey !== "string") {
      console.error(
        `[DECODE] missing originalKey for annset=${annsetName} idx=${i} start=${annotation.start} end=${annotation.end}`,
      );
      // Do not attempt fallback decryption; leave the annotation as-is.
      continue;
    }

    console.log(
      `[DECODE] annset=${annsetName} idx=${i} using originalKey='${String(originalKey).slice(0, 120)}'`,
    );

    let deAnonymized = null;
    if (originalKey.startsWith("vault:")) {
      const result = await makeDecryptionRequest(originalKey);
      if (result?.decryptedData && typeof result.decryptedData === "string") {
        deAnonymized = result.decryptedData;
      } else {
        console.error(
          `[DECODE] Vault failed to decrypt for annset=${annsetName} idx=${i} key='${String(originalKey).slice(0, 120)}' result=${JSON.stringify(result)}`,
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
    doc.text = replaceSubstring(
      doc.text,
      originalStart,
      originalEnd,
      deAnonymized,
    );

    // Update the current annotation end (exclusive)
    annotation.end = originalStart + newLen;

    // Shift ALL annotations across ALL sets that start at or after originalEnd
    if (delta !== 0) {
      shiftAllAnnotations(originalEnd, delta);
    }

    // Mark last processed end
    lastProcessedEnd = annotation.end;
  }

  if (typeof doc.name === "string") {
    doc.name += "_ANNOTATED";
  } else {
    doc.name = (doc.name ?? "") + "_ANNOTATED";
  }

  return doc;
}

/**
 * Encode (anonymize) a document in-place and return it.
 * - Uses exclusive `end` indexes.
 * - Encrypts using API.
 * - Adjusts subsequent annotations correctly ACROSS ALL ANNOTATION SETS.
 */
export async function encode(doc) {
  if (!doc || typeof doc !== "object") {
    throw new TypeError("encode: doc must be an object");
  }

  if (
    !(
      doc.annotation_sets &&
      doc.features?.clusters &&
      typeof doc.text === "string"
    )
  ) {
    if (typeof doc.name === "string") doc.name += "_ANNOTATED";
    return doc;
  }

  const encryptedTitles = {};

  // Encrypt all cluster titles and store mapping
  for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
    encryptedTitles[clusterAnnSet] = [];
    for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
      const cluster = doc.features.clusters[clusterAnnSet][i];
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

  // Helper function to shift all annotations that start at or after a given position
  // This is critical to prevent index mismatches across annotation sets
  function shiftAllAnnotations(fromPosition, delta) {
    for (const annsetName of Object.keys(doc.annotation_sets)) {
      const anns = doc.annotation_sets[annsetName].annotations ?? [];
      for (const annotation of anns) {
        if (
          Number.isInteger(annotation.start) &&
          annotation.start >= fromPosition
        ) {
          annotation.start += delta;
          annotation.end += delta;
        }
      }
    }
  }

  // Process annotations in global document order to keep encode/decode symmetric
  // Build a global list of annotations across all annotation sets and sort by start.
  const globalAnns = [];
  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    for (let idx = 0; idx < anns.length; idx++) {
      globalAnns.push({ annsetName, annotation: anns[idx] });
    }
  }
  globalAnns.sort(
    (a, b) => (a.annotation.start || 0) - (b.annotation.start || 0),
  );

  // Track the last processed end to avoid overlapping replacements
  let lastProcessedEnd = -1;

  for (let i = 0; i < globalAnns.length; i++) {
    const { annsetName, annotation } = globalAnns[i];

    // Validate annotation indexes
    if (
      !Number.isInteger(annotation.start) ||
      !Number.isInteger(annotation.end) ||
      annotation.start < 0 ||
      annotation.end < annotation.start
    ) {
      console.warn(
        `[ENCODE] Skipping malformed annotation annset=${annsetName} idx=${i}`,
      );
      continue;
    }

    // Skip overlapping annotations - keep behavior consistent with decode
    if (annotation.start < lastProcessedEnd) {
      console.warn(
        `[ENCODE] Skipping overlapping annotation annset=${annsetName} start=${annotation.start} < lastProcessedEnd=${lastProcessedEnd}`,
      );
      continue;
    }

    const text = getAnnotationDisplayText(
      annotation.start,
      annotation.end,
      doc.text,
    );

    console.log(`[ENCODE] Ann ${i}/${globalAnns.length} in ${annsetName}:`);
    console.log(
      `  Position: ${annotation.start}-${annotation.end} (len=${annotation.end - annotation.start})`,
    );
    console.log(
      `  Extracted: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
    );

    // Find the cluster that contains this annotation's ID in its mentions
    let clusterIndex = -1;
    const annotationId = annotation.id;
    if (doc.features.clusters[annsetName]) {
      for (let j = 0; j < doc.features.clusters[annsetName].length; j++) {
        const cluster = doc.features.clusters[annsetName][j];
        if (
          cluster.mentions &&
          cluster.mentions.some((mention) => mention.id === annotationId)
        ) {
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
      const titleResult = await makeEncryptionRequest(
        annotation.features.title,
      );
      annotation.features.title =
        titleResult.vaultKey || annotation.features.title;
    }

    console.log(
      `  Encrypted mention: "${encryptedMention.substring(0, 50)}${encryptedMention.length > 50 ? "..." : ""}"`,
    );
    console.log(`  Cluster index: ${clusterIndex}`);

    // Use the encrypted cluster title as replacement text when applicable
    const replacement =
      (clusterIndex >= 0 &&
        encryptedTitles[annsetName] &&
        encryptedTitles[annsetName][clusterIndex]) ||
      encryptedMention;

    console.log(
      `  Replacement (cluster title or mention): "${replacement.substring(0, 50)}${replacement.length > 50 ? "..." : ""}"`,
    );

    const originalStart = annotation.start;
    const originalEnd = annotation.end; // exclusive
    const oldLen = originalEnd - originalStart;
    const newLen = replacement.length;
    const delta = newLen - oldLen;

    console.log(`  Delta: ${delta} (old=${oldLen}, new=${newLen})`);

    // Replace the substring in the canonical doc.text using exclusive end
    doc.text = replaceSubstring(
      doc.text,
      originalStart,
      originalEnd,
      replacement,
    );

    // Update the annotation end (exclusive)
    annotation.end = originalStart + newLen;

    // Shift ALL annotations across ALL sets that start at or after originalEnd
    if (delta !== 0) {
      console.log(
        `  Shifting all annotations starting >= ${originalEnd} by ${delta}`,
      );
      shiftAllAnnotations(originalEnd, delta);
    }

    // Update last processed end position
    lastProcessedEnd = annotation.end;
  }

  if (typeof doc.name === "string") {
    doc.name += "_ANNOTATED";
  } else {
    doc.name = (doc.name ?? "") + "_ANNOTATED";
  }

  doc.features.anonymized = true;
  return doc;
}

/**
 * Convenience wrapper used by external code
 */
export async function processDocument(doc, toEncode = true) {
  try {
    return toEncode ? await encode(doc) : await decode(doc);
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
}
