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

  // First, decrypt all cluster titles
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

  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    // Sort annotations by start position to ensure correct shifting
    anns.sort((a, b) => a.start - b.start);

    // Track the last processed end position to detect overlapping annotations
    let lastProcessedEnd = -1;

    // Walk annotations by index so we can update subsequent annotations safely
    for (let i = 0; i < anns.length; i++) {
      const annotation = anns[i];
      if (
        !Number.isInteger(annotation.start) ||
        !Number.isInteger(annotation.end) ||
        annotation.start < 0 ||
        annotation.end < annotation.start
      ) {
        // skip malformed annotation

        continue;
      }

      // Skip overlapping annotations - if this annotation starts before the last one ended,
      // it means it overlaps and would cause boundary corruption
      if (annotation.start < lastProcessedEnd) {
        continue;
      }

      const extracted = getAnnotationDisplayText(
        annotation.start,
        annotation.end,
        doc.text,
      );

      // Use originalKey instead of encryptionKey
      const originalKey = annotation.originalKey;

      const result = originalKey
        ? await makeDecryptionRequest(originalKey)
        : null;
      const deAnonymized = result?.decryptedData;

      if (typeof deAnonymized !== "string") {
        // Log detailed diagnostic information
        console.error(
          `[DECODE] FAILED to decrypt! annset=${annsetName} index=${i} start=${annotation.start} end=${annotation.end} extracted='${extracted.substring(0, 30)}' hasOriginalKey=${!!originalKey}`,
        );
        // Skip replacement; do not mutate doc.text or annotation indexes for this entry.
        continue;
      }

      const originalStart = annotation.start;
      const originalEnd = annotation.end; // exclusive
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

      // Update the current annotation. Because `end` is exclusive:
      annotation.end = originalStart + newLen;

      // If length changed, shift ALL annotations across ALL sets that come after originalEnd
      // This fixes the index mismatch bug where annotations in other sets were not shifted
      if (delta !== 0) {
        shiftAllAnnotations(originalEnd, delta);
      }

      // Update last processed end position
      lastProcessedEnd = annotation.end;
    }
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

  for (const annsetName of Object.keys(doc.annotation_sets)) {
    const anns = doc.annotation_sets[annsetName].annotations ?? [];
    // Sort annotations by start position to ensure correct shifting
    anns.sort((a, b) => a.start - b.start);
    console.log(
      `[ENCODE] Processing annotation set: ${annsetName}, count: ${anns.length}`,
    );

    // Track the last processed end position to detect overlapping annotations
    let lastProcessedEnd = -1;

    for (let i = 0; i < anns.length; i++) {
      const annotation = anns[i];
      if (
        !Number.isInteger(annotation.start) ||
        !Number.isInteger(annotation.end) ||
        annotation.start < 0 ||
        annotation.end < annotation.start
      ) {
        console.warn(
          `[ENCODE] Skipping malformed annotation ${i} in ${annsetName}`,
        );
        continue;
      }

      // Skip overlapping annotations - if this annotation starts before the last one ended,
      // it means it overlaps and would cause boundary corruption
      if (annotation.start < lastProcessedEnd) {
        console.warn(
          `[ENCODE] Skipping overlapping annotation ${i} in ${annsetName}: start=${annotation.start} < lastProcessedEnd=${lastProcessedEnd}`,
        );
        continue;
      }

      const text = getAnnotationDisplayText(
        annotation.start,
        annotation.end,
        doc.text,
      );

      console.log(`[ENCODE] Ann ${i}/${anns.length} in ${annsetName}:`);
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
      const result = await makeEncryptionRequest(text);
      const encryptedMention = result.vaultKey || text;
      annotation.originalKey = encryptedMention;

      console.log(
        `  Encrypted mention: "${encryptedMention.substring(0, 50)}${encryptedMention.length > 50 ? "..." : ""}"`,
      );
      console.log(`  Cluster index: ${clusterIndex}`);

      // Use the encrypted cluster title as replacement text
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

      // Replace the substring
      doc.text = replaceSubstring(
        doc.text,
        originalStart,
        originalEnd,
        replacement,
      );

      // Update the current annotation end (exclusive)
      annotation.end = originalStart + newLen;

      // Shift ALL annotations across ALL sets that start at or after originalEnd
      // This fixes the index mismatch bug where annotations in other sets were not shifted
      if (delta !== 0) {
        console.log(
          `  Shifting all annotations starting >= ${originalEnd} by ${delta}`,
        );
        shiftAllAnnotations(originalEnd, delta);
      }

      // Update last processed end position
      lastProcessedEnd = annotation.end;
    }
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
