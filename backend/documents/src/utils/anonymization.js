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

async function makeDecryptionRequest(valueToDecrypt) {
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
 * Extract the annotation text from a document text using inclusive end index.
 * Returns UNKNOWN_ANNOTATION_TEXT if indexes out of range.
 */
function getAnnotationDisplayText(annotationStart, annotationEnd, text) {
    // annotationEnd is inclusive; slice end is exclusive so we add +1
    if (
        Number.isInteger(annotationStart) &&
        Number.isInteger(annotationEnd) &&
        annotationStart >= 0 &&
        annotationEnd >= annotationStart &&
        annotationEnd < text.length
    ) {
        return text.slice(annotationStart, annotationEnd + 1);
    } else {
        return "UNKNOWN_ANNOTATION_TEXT";
    }
}

/**
 * Replace a substring defined by inclusive `end` index.
 */
function replaceSubstring(str, start, end, replacement) {
    // console.log(`*** replacing ${str.slice(start, end)} with ${replacement}`);
    const before = str.substring(0, start);
    const after = str.substring(end);
    if ((before + replacement).length < 200)
        console.log(
            `*** replaced ${replacement}: ${before + replacement} ---- ${after.substring(0, 10)}`,
        );

    return before + replacement + after;
}

/**
 * Decode (de-anonymize) a document in-place and return it.
 * - Handles inclusive `end` indexes.
 * - Decrypts using API.
 * - Adjusts subsequent annotations correctly (off-by-one fixes included).
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
        if (typeof doc.name === "string") doc.name += " de-anonymized";
        return doc;
    }

    // First, decrypt all cluster titles
    let clusterMap = {};
    for (const clusterAnnSet of Object.keys(doc.features.clusters)) {
        for (let i = 0; i < doc.features.clusters[clusterAnnSet].length; i++) {
            const cluster = doc.features.clusters[clusterAnnSet][i];
            const encryptedTitle = cluster.title;
            const result = await makeDecryptionRequest(encryptedTitle);
            if (result?.decryptedData) {
                cluster.title = result.decryptedData;
                clusterMap[cluster.id] = result.decryptedData;
            }
        }
    }

    for (const annsetName of Object.keys(doc.annotation_sets)) {
        const anns = doc.annotation_sets[annsetName].annotations ?? [];
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
                    `Error decrypting originalKey. annset=${annsetName} index=${i} start=${annotation.start} end=${annotation.end} extracted='${extracted}' docId=${doc.id ?? "unknown"}`,
                );
                // Skip replacement; do not mutate doc.text or annotation indexes for this entry.
                continue;
            }

            const originalStart = annotation.start;
            const originalEnd = annotation.end; // inclusive
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

            // Update the current annotation. Because `end` is inclusive:
            annotation.end = originalStart + newLen - 1;

            // If length changed, shift later annotations that come after the originalEnd.
            if (delta !== 0) {
                for (let j = i + 1; j < anns.length; j++) {
                    const other = anns[j];
                    if (
                        !Number.isInteger(other.start) ||
                        !Number.isInteger(other.end)
                    )
                        continue;

                    other.start += delta;
                    other.end += delta;
                }
            }
        }
    }

    if (typeof doc.name === "string") {
        doc.name += " de-anonymized";
    } else {
        doc.name = (doc.name ?? "unknown") + " de-anonymized";
    }

    return doc;
}

/**
 * Encode (anonymize) a document in-place and return it.
 * - Uses inclusive `end` indexes.
 * - Encrypts using API.
 * - Fixes off-by-one when updating annotation.end.
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
        if (typeof doc.name === "string") doc.name += " de-anonymized";
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
                        const mentionResult = await makeEncryptionRequest(
                            mention.text,
                        );
                        mention.originalKey =
                            mentionResult.vaultKey || mention.text;
                    }
                }
            }
        }
    }

    for (const annsetName of Object.keys(doc.annotation_sets)) {
        const anns = doc.annotation_sets[annsetName].annotations ?? [];
        for (let i = 0; i < anns.length; i++) {
            const annotation = anns[i];
            if (
                !Number.isInteger(annotation.start) ||
                !Number.isInteger(annotation.end) ||
                annotation.start < 0 ||
                annotation.end < annotation.start
            ) {
                continue;
            }

            const text = getAnnotationDisplayText(
                annotation.start,
                annotation.end,
                doc.text,
            );

            // Find the cluster that contains this annotation's ID in its mentions
            let clusterIndex = -1;
            const annotationId = annotation.id;
            if (doc.features.clusters[annsetName]) {
                for (
                    let j = 0;
                    j < doc.features.clusters[annsetName].length;
                    j++
                ) {
                    const cluster = doc.features.clusters[annsetName][j];
                    if (
                        cluster.mentions &&
                        cluster.mentions.some(
                            (mention) => mention.id === annotationId,
                        )
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

            // Use the encrypted cluster title as replacement text
            const replacement =
                (clusterIndex >= 0 &&
                    encryptedTitles[annsetName] &&
                    encryptedTitles[annsetName][clusterIndex]) ||
                encryptedMention;

            const originalStart = annotation.start;
            const originalEnd = annotation.end; // inclusive
            const oldLen = originalEnd - originalStart + 1;
            const newLen = replacement.length;
            const delta = newLen - oldLen;

            // Replace the substring
            doc.text = replaceSubstring(
                doc.text,
                originalStart,
                originalEnd,
                replacement,
            );

            // Update the current annotation end (inclusive)
            annotation.end = originalStart + newLen - 1;

            // Shift subsequent annotations if needed (only those starting after originalEnd)
            if (delta !== 0) {
                for (let j = i + 1; j < anns.length; j++) {
                    const other = anns[j];
                    if (
                        !Number.isInteger(other.start) ||
                        !Number.isInteger(other.end)
                    )
                        continue;
                    other.start += delta;
                    other.end += delta;
                }
            }
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
        console.error(
            `error processing document ${doc?.id ?? "undefined"}`,
            error,
        );
        throw error;
    }
}
