/**
 * Stable colors for entity types.
 *
 * `stableTypeColor` is a pure function of the type name, so a type gets the
 * same color in every session and on every page, even before a collection has
 * persisted anything. When documents are uploaded, `pickTypeColor` assigns
 * each new type of a collection a color that also keeps clear of the colors
 * the collection already uses; that choice is stored in
 * `collection.config.typeColors`, where the user can edit it.
 */

const SATURATION = 70;
const LIGHTNESS = 82; // pastel: tag text is a darkened shade of the color
const GOLDEN_ANGLE = 137.508;
const MIN_HUE_DISTANCE = 18;

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

const hexToHue = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return -1; // grey: no hue
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

const baseHue = (type: string) => hash(type.trim().toLowerCase()) % 360;

/** Deterministic color for a type name. */
export const stableTypeColor = (type: string) =>
  hslToHex(baseHue(type), SATURATION, LIGHTNESS);

/**
 * Like `stableTypeColor`, but steps around the hue wheel until the color is
 * not too close to any of `usedColors`. Deterministic for a given input.
 */
export const pickTypeColor = (type: string, usedColors: string[]) => {
  const usedHues = usedColors.filter(isHexColor).map(hexToHue);
  let hue = baseHue(type);
  for (let attempt = 0; attempt < 24; attempt++) {
    if (usedHues.every((u) => u < 0 || hueDistance(u, hue) >= MIN_HUE_DISTANCE)) {
      break;
    }
    hue = (hue + GOLDEN_ANGLE) % 360;
  }
  return hslToHex(hue, SATURATION, LIGHTNESS);
};

// Mongo field names can't contain '.' or start with '$'
export const isStorableTypeKey = (type: string) =>
  !!type && !type.includes('.') && !type.startsWith('$');
