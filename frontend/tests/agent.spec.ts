import { test, expect } from '@playwright/test';
import { z } from 'zod';
import {
  extractJSON,
  extractJSONArray,
  findCitedSentences,
  parseJSONWithSchema,
  removeCitations,
  summarizeForTrace,
} from '../lib/agentUtils';
import { cleanEntityNames } from '../lib/entityLookup';

/**
 * Browser-less checks (no running app, LLM or Elasticsearch needed) for the
 * pure helpers of the multi-agent pipeline.
 *
 *   npx playwright test agent --project=as-admin
 */

test.describe('JSON extraction and validation', () => {
  test('extracts JSON from plain text, code fences and surrounding prose', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 });
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJSON('Sure! Here it is: {"a":1} Hope it helps')).toEqual({
      a: 1,
    });
    expect(extractJSON('no json here')).toBeNull();
    expect(extractJSONArray('answer: ["x","y"]')).toEqual(['x', 'y']);
  });

  test('parseJSONWithSchema validates and applies defaults', () => {
    const schema = z.object({
      score: z.number().catch(7),
      issues: z.array(z.string()).catch([]),
    });
    expect(parseJSONWithSchema('{"score":3,"issues":["a"]}', schema)).toEqual({
      score: 3,
      issues: ['a'],
    });
    // wrong types fall back to the per-field defaults instead of failing
    expect(parseJSONWithSchema('{"score":"high"}', schema)).toEqual({
      score: 7,
      issues: [],
    });
    expect(parseJSONWithSchema('not json', schema)).toBeNull();
  });

  test('parseJSONWithSchema rejects a reply of the wrong shape', () => {
    const schema = z.object({ strategy: z.enum(['dense', 'hybrid']) });
    expect(parseJSONWithSchema('{"strategy":"nope"}', schema)).toBeNull();
    expect(parseJSONWithSchema('["a","b"]', z.array(z.string()), true)).toEqual(
      ['a', 'b']
    );
    expect(
      parseJSONWithSchema('{"a":1}', z.array(z.string()), true)
    ).toBeNull();
  });

  test('summarizeForTrace caps the length', () => {
    expect(summarizeForTrace(undefined)).toBe('');
    expect(summarizeForTrace({ a: 1 })).toBe('{"a":1}');
    expect(summarizeForTrace('x'.repeat(50), 10)).toBe('xxxxxxxxxx…');
  });
});

test.describe('citation helpers', () => {
  const answer =
    'Rome is the capital [1]. It has 2.8 million people [2][3].\nThe river is the Tiber [4].';

  test('finds the sentences that carry markers', () => {
    const cited = findCitedSentences(answer);
    expect(cited.map((c) => c.markers)).toEqual([[1], [2, 3], [4]]);
    expect(cited[0].text).toContain('Rome is the capital');
  });

  test('removes only the flagged marker of the flagged sentence', () => {
    const cited = findCitedSentences(answer);
    const valid = new Set([1, 2, 3, 4]);
    const out = removeCitations(
      answer,
      [{ sentence: cited[1].index, marker: 3 }],
      valid
    );
    expect(out).toContain('Rome is the capital [1].');
    expect(out).toContain('million people [2].');
    expect(out).not.toContain('[3]');
    expect(out).toContain('Tiber [4]');
  });

  test('removes markers that point at no chunk, leaving the text alone', () => {
    const out = removeCitations(answer, [], new Set([1, 2]));
    expect(out).toContain('[1]');
    expect(out).toContain('[2]');
    expect(out).not.toContain('[3]');
    expect(out).not.toContain('[4]');
    expect(out.replace(/\s?\[\d+\]/g, '')).toBe(
      answer.replace(/\s?\[\d+\]/g, '')
    );
  });

  test('an answer without markers is returned unchanged', () => {
    const plain = 'No citations here. Just text.';
    expect(findCitedSentences(plain)).toEqual([]);
    expect(removeCitations(plain, [], new Set())).toBe(plain);
  });
});

test.describe('entity names', () => {
  test('cleans, de-duplicates and caps the names', () => {
    expect(
      cleanEntityNames(['  Mario Rossi ', 'mario rossi', '', 5, 'Roma'])
    ).toEqual(['Mario Rossi', 'Roma']);
    expect(cleanEntityNames('not an array')).toEqual([]);
    expect(
      cleanEntityNames(Array.from({ length: 20 }, (_, i) => `n${i}`))
    ).toHaveLength(5);
    expect(cleanEntityNames(['x'.repeat(200)])[0]).toHaveLength(80);
  });
});
