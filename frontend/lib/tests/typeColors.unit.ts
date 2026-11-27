// Unit tests of the entity type colors (lib/typeColors.ts).
// Run with `npm run test:unit`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assignTypeColors,
  colorDistance,
  MIN_COLOR_DISTANCE,
  pickTypeColor,
  stableTypeColor,
} from '../typeColors';

// The entity types of a real collection (NER labels and older translated names).
const REAL_TYPES = [
  'PERSON', 'ORG', 'GPE', 'LAW', 'CARDINAL', 'DATE', 'UNKNOWN', 'WORK_OF_ART',
  'ORDINAL', 'FAC', 'NORP', 'QUANTITY', 'EVENT', 'PERCENT', 'case', 'LOC',
  'MONEY', 'PRODUCT', 'persona', 'data', 'norma', 'organizzazione',
];

const closestPair = (colors: Record<string, string>) => {
  const keys = Object.keys(colors);
  let min = Infinity;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      min = Math.min(min, colorDistance(colors[keys[i]], colors[keys[j]]));
    }
  }
  return min;
};

describe('assignTypeColors', () => {
  it('gives a real set of types colors that all look clearly different', () => {
    const colors = assignTypeColors(REAL_TYPES);
    assert.equal(Object.keys(colors).length, REAL_TYPES.length);
    assert.ok(closestPair(colors) >= MIN_COLOR_DISTANCE, `closest pair ${closestPair(colors)}`);
  });

  it('beats the plain per-name colors, which can be near-identical', () => {
    const plain = Object.fromEntries(REAL_TYPES.map((t) => [t, stableTypeColor(t)]));
    assert.ok(closestPair(plain) < 0.01); // e.g. CARDINAL and norma
    assert.ok(closestPair(assignTypeColors(REAL_TYPES)) > 10 * closestPair(plain));
  });

  it('keeps fixed (stored) colors and keeps the others away from them', () => {
    const fixed = { PERSON: '#b1f1ba', ORG: '#f1e5b1' };
    const colors = assignTypeColors(REAL_TYPES, fixed);
    assert.equal(colors.PERSON, '#b1f1ba');
    assert.equal(colors.ORG, '#f1e5b1');
    for (const t of REAL_TYPES.filter((t) => !(t in fixed))) {
      assert.ok(colorDistance(colors[t], fixed.PERSON) >= MIN_COLOR_DISTANCE, t);
    }
  });

  it('is deterministic and does not depend on input order', () => {
    const a = assignTypeColors(REAL_TYPES);
    const b = assignTypeColors([...REAL_TYPES].reverse());
    assert.deepEqual(a, b);
  });

  it('gives a single type its stable color', () => {
    assert.deepEqual(assignTypeColors(['PERSON']), { PERSON: stableTypeColor('PERSON') });
  });

  it('degrades gracefully with very many types', () => {
    const many = Array.from({ length: 60 }, (_, i) => `TYPE_${i}`);
    const colors = assignTypeColors(many);
    assert.equal(new Set(Object.values(colors)).size, many.length); // no duplicates
    assert.ok(closestPair(colors) > 0.02); // still distinguishable
  });
});

describe('pickTypeColor', () => {
  it('returns the stable color when nothing is close to it', () => {
    assert.equal(pickTypeColor('PERSON', []), stableTypeColor('PERSON'));
  });

  it('moves away from a color already in use', () => {
    const used = [stableTypeColor('PERSON')];
    const c = pickTypeColor('PERSON', used);
    assert.ok(colorDistance(c, used[0]) >= MIN_COLOR_DISTANCE);
  });
});
