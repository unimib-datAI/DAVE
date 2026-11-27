// Pure helpers for the multi-agent pipeline (lib/multiAgent.ts): no I/O, so
// they can be unit-tested without an LLM or Elasticsearch.

import type { z } from 'zod';

/** Try to parse JSON from an LLM text response (handles markdown code fences). */
export function extractJSON<T>(text: string): T | null {
  // 1. direct parse
  try {
    return JSON.parse(text) as T;
  } catch {
    /* continue */
  }

  // 2. markdown code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]) as T;
    } catch {
      /* continue */
    }
  }

  // 3. first {...} in the text
  const objMatch = text.match(/\{[\s\S]+\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* continue */
    }
  }

  return null;
}

/** Try to parse a JSON array from an LLM text response. */
export function extractJSONArray(text: string): unknown[] | null {
  const arrMatch = text.match(/\[[\s\S]+\]/);
  if (arrMatch) {
    try {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr)) return arr;
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * Parses an LLM reply as JSON and validates it against a zod schema.
 * Returns null when the reply has no JSON or it does not fit the schema, so
 * the caller can ask the model to repair it or fall back to a default.
 */
export function parseJSONWithSchema<T>(
  text: string,
  schema: z.ZodType<T>,
  expectArray = false
): T | null {
  const raw = expectArray ? extractJSONArray(text) : extractJSON<unknown>(text);
  if (raw === null) return null;
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

/** Compact, length-capped string form of a step's output for the progress UI. */
export function summarizeForTrace(output: unknown, maxChars = 600): string {
  if (output === undefined || output === null) return '';
  let text: string;
  try {
    text = typeof output === 'string' ? output : JSON.stringify(output);
  } catch {
    return '';
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

// ── Citations ────────────────────────────────────────────────────────────────

// One segment is a run of text up to a sentence terminator, the terminator,
// and any citation markers placed after it (". [1][2]"); newlines are their
// own segments so list items stay separate.
// A period between two digits ("2.8") is part of the number, not a terminator.
// Built from a string: the lookbehind needs ES2018, above the project's TS target.
const SEGMENT_RE = new RegExp(
  '(?:[^.!?\\n]|(?<=\\d)\\.(?=\\d))+(?:[.!?]+(?:\\s*\\[\\d+\\])*)?|\\n+',
  'g'
);
const MARKER_RE = /\[(\d+)\]/g;

export interface CitedSentence {
  /** Position among the non-blank segments (the id used by removeCitations). */
  index: number;
  text: string;
  /** Distinct citation numbers appearing in the sentence. */
  markers: number[];
}

function markersIn(segment: string): number[] {
  const re = new RegExp(MARKER_RE.source, 'g');
  const found: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    const n = Number(m[1]);
    if (found.indexOf(n) === -1) found.push(n);
  }
  return found;
}

/** Sentences of an answer that carry at least one [n] citation marker. */
export function findCitedSentences(answer: string): CitedSentence[] {
  const out: CitedSentence[] = [];
  const re = new RegExp(SEGMENT_RE.source, 'g');
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer))) {
    const segment = match[0];
    if (!segment.trim()) continue;
    const markers = markersIn(segment);
    if (markers.length > 0) {
      out.push({ index, text: segment.trim(), markers });
    }
    index++;
  }
  return out;
}

export interface CitationRemoval {
  sentence: number;
  marker: number;
}

/**
 * Removes the given [n] markers from the given sentences (ids as returned by
 * findCitedSentences) and, in every sentence, any marker whose number is not
 * in `validMarkers`. All other text is left untouched.
 */
export function removeCitations(
  answer: string,
  removals: CitationRemoval[],
  validMarkers: Set<number>
): string {
  const bySentence = new Map<number, Set<number>>();
  for (const { sentence, marker } of removals) {
    if (!bySentence.has(sentence)) bySentence.set(sentence, new Set());
    bySentence.get(sentence)!.add(marker);
  }

  let index = 0;
  return answer.replace(SEGMENT_RE, (segment) => {
    if (!segment.trim()) return segment;
    const drop = bySentence.get(index);
    index++;
    // the space in front of a removed marker goes with it ("Tiber [4]." -> "Tiber.")
    return segment.replace(/\s?\[(\d+)\]/g, (whole, n) => {
      const marker = Number(n);
      return !validMarkers.has(marker) || drop?.has(marker) ? '' : whole;
    });
  });
}
