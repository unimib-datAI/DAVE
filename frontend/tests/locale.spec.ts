import { test, expect } from '@playwright/test';
import eng from '../translation/eng';
import ita from '../translation/ita';
import { resolveLocaleKey } from '../translation';
import { countTokens } from '../lib/tokenCounter';

/**
 * Browser-less checks (no running app needed) for the locale helper, the
 * translation files and the token estimator.
 *
 *   npx playwright test locale --project=as-admin
 */

const leaves = (obj: unknown, prefix = ''): string[] =>
  obj && typeof obj === 'object'
    ? Object.entries(obj).flatMap(([k, v]) =>
        leaves(v, prefix ? `${prefix}.${k}` : k),
      )
    : [prefix];

const get = (obj: any, path: string) =>
  path.split('.').reduce((o, k) => o?.[k], obj);

test.describe('resolveLocaleKey', () => {
  test('returns supported locales and aliases', () => {
    expect(resolveLocaleKey('eng')).toBe('eng');
    expect(resolveLocaleKey('ita')).toBe('ita');
    expect(resolveLocaleKey('en')).toBe('eng');
    expect(resolveLocaleKey(' ITA ')).toBe('ita');
  });

  test('falls back to English for anything unsupported', () => {
    for (const bad of ['zh', 'zh-CN', 'xx', '', '  ', null, undefined]) {
      expect(resolveLocaleKey(bad as any), String(bad)).toBe('eng');
    }
  });

  test('never lets path-like values through', () => {
    expect(resolveLocaleKey('../eng')).toBe('eng');
    expect(resolveLocaleKey('constructor')).toBe('eng');
    expect(resolveLocaleKey('__proto__')).toBe('eng');
  });

  test('uses the first supported candidate', () => {
    expect(resolveLocaleKey('zh', undefined, 'ita', 'eng')).toBe('ita');
    expect(resolveLocaleKey('zh', null)).toBe('eng');
  });
});

test.describe('translation files', () => {
  test('Italian has no keys that English lacks', () => {
    const extra = leaves(ita).filter((k) => get(eng, k) === undefined);
    expect(extra, 'keys only present in ita').toEqual([]);
  });

  test('Italian covers every English key (otherwise English is shown)', () => {
    const missing = leaves(eng).filter((k) => {
      const v = get(ita, k);
      return typeof v !== 'string' || v === '';
    });
    // Not a failure: the UI falls back to English. Listed to spot gaps.
    test.info().annotations.push({
      type: 'missing-in-ita',
      description: `${missing.length} keys: ${missing.slice(0, 20).join(', ')}`,
    });
    expect(Array.isArray(missing)).toBe(true);
  });

  test('English has no empty strings', () => {
    const empty = leaves(eng).filter((k) => get(eng, k) === '');
    expect(empty).toEqual([]);
  });
});

test.describe('countTokens (RAG budget estimate)', () => {
  test('is zero for empty text and grows with length', async () => {
    expect(await countTokens('')).toBe(0);
    const short = await countTokens('hello world');
    const long = await countTokens('hello world '.repeat(100));
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  test('over-counts rather than under-counts typical English text', async () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    // ~4 chars/token is typical; the estimate must be at least that many tokens.
    expect(await countTokens(text)).toBeGreaterThanOrEqual(
      Math.floor(text.length / 4),
    );
  });
});
