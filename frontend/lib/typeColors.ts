/**
 * Colors for entity types that are stable AND clearly different from each other.
 *
 * `stableTypeColor` is a pure function of the type name: a type's preferred
 * color, the same in every session and on every page.
 *
 * Two types must not look alike, though, and similar-looking hues are common
 * among light pastel colors (several greens or blues 20 degrees apart are hard
 * to tell apart). So colors are compared by how different they LOOK - distance
 * in the OKLab color space, which is built to match perception - not by hue
 * angle, and a type whose preferred color is too close to one already in use
 * moves to the nearest candidate that is far enough (other hues, then other
 * lightness levels):
 *  - `pickTypeColor(type, used)`: one color, clear of `used` (the upload step
 *    stores it in `collection.config.typeColors`, where the user can edit it);
 *  - `assignTypeColors(types, fixed)`: colors for a whole set of types at
 *    once, keeping the `fixed` (stored or user-chosen) ones as they are.
 * Both are deterministic for a given input.
 */

const SATURATION = 70;
const LIGHTNESS = 82; // pastel: tag text is a darkened shade of the color
const GOLDEN_ANGLE = 137.508;
/**
 * Candidate (saturation, lightness) levels, tried in this order once every hue
 * of the previous level is taken. All stay light enough for dark tag text.
 */
const LEVELS: [number, number][] = [
  [SATURATION, LIGHTNESS],
  [75, 72],
  [60, 90],
  [55, 65],
];
/** Hues tried per level (golden-angle steps from the type's own hue). */
const HUES_PER_LEVEL = 24;
/**
 * Minimum OKLab distance between two type colors: about 3x the "just
 * noticeable" difference, so different at a glance even on small tags.
 * Light pastels leave little room: 0.06 is reachable for 20-25 types; with
 * more, pickTypeColor takes the candidate farthest from its nearest neighbour.
 */
export const MIN_COLOR_DISTANCE = 0.06;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

// FNV-1a
const hash = (value: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const hslToHex = (h: number, s: number, l: number) => {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

// sRGB hex -> OKLab (https://bottosson.github.io/posts/oklab/)
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const hexToOklab = (hex: string): [number, number, number] => {
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s,
  ];
};

/** How different two colors look (Euclidean distance in OKLab). */
export const colorDistance = (a: string, b: string) => {
  const [l1, a1, b1] = hexToOklab(a);
  const [l2, a2, b2] = hexToOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

const baseHue = (type: string) => hash(type.trim().toLowerCase()) % 360;

/** Deterministic color for a type name. */
export const stableTypeColor = (type: string) =>
  hslToHex(baseHue(type), SATURATION, LIGHTNESS);

/** The candidate colors of a type, its preferred (stable) color first. */
const candidates = (type: string) => {
  const out: string[] = [];
  const h0 = baseHue(type);
  for (const [sat, light] of LEVELS) {
    for (let i = 0; i < HUES_PER_LEVEL; i++) {
      out.push(hslToHex((h0 + i * GOLDEN_ANGLE) % 360, sat, light));
    }
  }
  return out;
};

/**
 * A color for `type` that looks clearly different from all of `usedColors`:
 * its preferred color if that is far enough from them, otherwise the first
 * candidate that is (other hues, then other lightness levels). With very many
 * types, when no candidate is far enough, the one farthest from its nearest
 * neighbour. Deterministic for a given input.
 */
export const pickTypeColor = (type: string, usedColors: string[]) => {
  const used = usedColors.filter(isHexColor);
  let best = '';
  let bestGap = -1;
  for (const candidate of candidates(type)) {
    const gap = used.length ? Math.min(...used.map((u) => colorDistance(u, candidate))) : Infinity;
    if (gap >= MIN_COLOR_DISTANCE) return candidate;
    if (gap > bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
};

/**
 * Colors for a set of types that all look different from each other. Types
 * in `fixed` (e.g. the collection's stored colors) keep their color; the
 * others get one with `pickTypeColor`, in alphabetical order, avoiding every
 * color assigned before them. A type keeps its preferred color unless an
 * earlier one is too close, so colors stay stable as types come and go.
 */
export const assignTypeColors = (
  types: string[],
  fixed: Record<string, string | undefined> = {}
): Record<string, string> => {
  const out: Record<string, string> = {};
  const unique = Array.from(new Set(types.filter(Boolean)));
  for (const type of unique) {
    const color = fixed[type];
    if (isHexColor(color)) out[type] = color;
  }
  const used = Object.values(out);
  const rest = unique
    .filter((t) => !(t in out))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || a.localeCompare(b));
  for (const type of rest) {
    out[type] = pickTypeColor(type, used);
    used.push(out[type]);
  }
  return out;
};

// Mongo field names can't contain '.' or start with '$'
export const isStorableTypeKey = (type: string) =>
  !!type && !type.includes('.') && !type.startsWith('$');
