import { isTopLevelItem } from './Node';
import { TreeItem, ChildTreeItem } from './Tree';

// Cache for random colors assigned to entity types
const entityColorCache = new Map<string, string>();

// Existing taxonomy colors to avoid when generating random colors
const existingColors = [
  '#FCE7F3', // persona - light pink
  '#ffdebf', // data - light orange
  '#FAE8FF', // luogo - light purple
  '#8d9c1a', // norma - olive green
  '#a63c22', // id - dark red
  '#baf2e6', // organizzazione - light teal
  '#a05c72', // money - dark pink
  '#7cb9e8', // case - light blue
  '#4a90e2', // REGULATION - blue
  '#f5a623', // ROLE - orange
  '#d0021b', // AUTHORITY - red
  '#7ed321', // DATA.CAT - green
  '#bd10e0', // DATA.OP - purple
  '#9013fe', // RIGHT - purple-blue
  '#ff6b35', // RISK/IMPACT - orange-red
  '#e2e2e2', // UNKNOWN - gray
];

/**
 * Converts hex color to HSL for color comparison
 */
const hexToHsl = (hex: string): [number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
};

/**
 * Checks if a color is too similar to existing taxonomy colors
 */
const isColorTooSimilar = (newColor: string): boolean => {
  const [newH, newS, newL] = hexToHsl(newColor);

  return existingColors.some((existingColor) => {
    const [existingH, existingS, existingL] = hexToHsl(existingColor);

    // Check if colors are too similar in hue, saturation, and lightness
    const hueDiff = Math.min(
      Math.abs(newH - existingH),
      360 - Math.abs(newH - existingH)
    );
    const satDiff = Math.abs(newS - existingS);
    const lightDiff = Math.abs(newL - existingL);

    // Consider colors too similar if they're close in all three dimensions
    return hueDiff < 30 && satDiff < 20 && lightDiff < 20;
  });
};

/**
 * Generates a random color in hex format that doesn't conflict with existing taxonomy colors
 */
const generateRandomColor = (): string => {
  let attempts = 0;
  const maxAttempts = 50;

  while (attempts < maxAttempts) {
    // Generate bright, vibrant colors by ensuring good saturation and lightness
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(Math.random() * 40) + 60; // 60-100%
    const lightness = Math.floor(Math.random() * 35) + 45; // 45-80%

    // Convert HSL to RGB
    const c = (1 - Math.abs(2 * (lightness / 100) - 1)) * (saturation / 100);
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness / 100 - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (0 <= hue && hue < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (60 <= hue && hue < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (120 <= hue && hue < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (180 <= hue && hue < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (240 <= hue && hue < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (300 <= hue && hue < 360) {
      r = c;
      g = 0;
      b = x;
    }

    const rHex = Math.round((r + m) * 255)
      .toString(16)
      .padStart(2, '0');
    const gHex = Math.round((g + m) * 255)
      .toString(16)
      .padStart(2, '0');
    const bHex = Math.round((b + m) * 255)
      .toString(16)
      .padStart(2, '0');

    const color = `#${rHex}${gHex}${bHex}`;

    // Check if this color is sufficiently different from existing ones
    if (!isColorTooSimilar(color)) {
      return color;
    }

    attempts++;
  }

  // Fallback: return a color even if it might be similar (shouldn't happen often)
  const fallbackHue = Math.floor(Math.random() * 360);
  return `hsl(${fallbackHue}, 75%, 65%)`;
};

/**
 * Gets or generates a random color for an entity type
 */
const getRandomColorForEntityType = (entityType: string): string => {
  if (!entityColorCache.has(entityType)) {
    entityColorCache.set(entityType, generateRandomColor());
  }
  return entityColorCache.get(entityType)!;
};

/**
 * Clears the entity color cache - useful for resetting random colors
 */
export const clearEntityColorCache = (): void => {
  entityColorCache.clear();
};

/**
 * Gets all cached entity colors
 */
export const getEntityColorCache = (): Map<string, string> => {
  return new Map(entityColorCache);
};

export type ParentNode = Omit<TreeItem, 'children'> & { parent: string | null };
export type ChildNode = Omit<ChildTreeItem, 'children'> & { parent: string };
export type ChildNodeWithColor = Omit<ChildNode, 'parent'> & { color: string };
export type FlatTreeNode = ParentNode | ChildNode;
export type FlatTreeObj = Record<string, FlatTreeNode>;

export function isParentNode(
  value: TreeItem | ChildTreeItem
): value is TreeItem {
  return Object.hasOwn(value, 'color');
}

export const getParents = (obj: FlatTreeObj) => {
  return Object.values(obj).reduce((acc, item) => {
    const { parent, ...rest } = item;
    if (parent === null) {
      acc.push(rest as TreeItem);
    }
    return acc;
  }, [] as TreeItem[]);
};

export const getChildren = (obj: FlatTreeObj, key: string) => {
  return Object.values(obj).reduce((acc, item) => {
    const { parent, ...childProps } = item;
    if (parent === key) {
      const child = {
        ...childProps,
        children: getChildren(obj, childProps.key),
      } as ChildTreeItem;

      acc.push(child);
    }
    return acc;
  }, [] as ChildTreeItem[]);
};

export const buildTreeFromFlattenedObject = (obj: FlatTreeObj) => {
  const tree = getParents(obj).map((parent) => {
    return {
      ...parent,
      children: getChildren(obj, parent.key),
    };
  });
  return tree;
};

export const transformChildrenToFlatObject = (
  objAccumulator: FlatTreeObj,
  parent: string,
  children: ChildTreeItem[] | undefined
): FlatTreeObj => {
  if (!children) {
    return objAccumulator;
  }
  return children.reduce((acc, child) => {
    const { children, ...childProps } = child;
    acc[childProps.key] = {
      ...childProps,
      parent,
    };
    return transformChildrenToFlatObject(acc, childProps.key, children);
  }, objAccumulator);
};

export const flattenTree = (items: TreeItem[]): FlatTreeObj => {
  return items.reduce((acc, item) => {
    const { children, ...itemProps } = item;
    acc[itemProps.key] = {
      ...itemProps,
      parent: null,
    };
    return transformChildrenToFlatObject(acc, itemProps.key, children);
  }, {} as FlatTreeObj);
};

export const insertNodeFlat = (obj: FlatTreeObj, node: FlatTreeNode) => {
  return {
    ...obj,
    [node.key]: node,
  };
};

// Entity type mapping from English to Italian and grouping similar types
// Using a case-insensitive approach to avoid TypeScript object key conflicts
const entityTypeMapping: Record<string, string> = {};

// Helper function to add mappings safely
const addMapping = (key: string, value: string) => {
  entityTypeMapping[key] = value;
};

// Person types
// addMapping('person', 'persona');
// addMapping('PER', 'persona');
// addMapping('PERSON', 'persona');
// addMapping('people', 'persona');
// addMapping('individual', 'persona');

// // Location types
// addMapping('location', 'luogo');
// addMapping('LOC', 'luogo');
// addMapping('LOCATION', 'luogo');
// addMapping('place', 'luogo');
// addMapping('gpe', 'luogo'); // Geo-political entity
// addMapping('GPE', 'luogo');

// // Organization types
// addMapping('organization', 'organizzazione');
// addMapping('ORG', 'organizzazione');
// addMapping('ORGANIZATION', 'organizzazione');
// addMapping('org', 'organizzazione');
// addMapping('company', 'organizzazione');
// addMapping('institution', 'organizzazione');

// // Date types
// addMapping('date', 'data');
// addMapping('DATE', 'data');
// addMapping('time', 'data');
// addMapping('TIME', 'data');
// addMapping('temporal', 'data');

// // Money types
// addMapping('money', 'money');
// addMapping('MONEY', 'money');
// addMapping('MONETARY', 'money');
// addMapping('currency', 'money');
// addMapping('financial', 'money');
// addMapping('denaro', 'money');

// // Legal/Document specific types
// addMapping('law', 'norma');
// addMapping('LAW', 'norma');
// addMapping('legal', 'norma');
// addMapping('statute', 'norma');

// // Identifier types
// addMapping('id', 'id');
// addMapping('ID', 'id');
// addMapping('identifier', 'id');
// addMapping('code', 'id');

// // Facility types
// addMapping('FAC', 'facility');
// addMapping('fac', 'facility');
// addMapping('facility', 'facility');
// addMapping('building', 'facility');
// addMapping('structure', 'facility');

// // Nationality/Religion/Political types
// addMapping('NORP', 'norp');
// addMapping('norp', 'norp');
// addMapping('nationality', 'norp');
// addMapping('religion', 'norp');
// addMapping('political', 'norp');

// // Numeric types
// addMapping('CARDINAL', 'numeric');
// addMapping('cardinal', 'numeric');
// addMapping('ORDINAL', 'numeric');
// addMapping('ordinal', 'numeric');
// addMapping('QUANTITY', 'numeric');
// addMapping('quantity', 'numeric');
// addMapping('PERCENT', 'numeric');
// addMapping('percent', 'numeric');
// addMapping('number', 'numeric');
// addMapping('NUM', 'numeric');

// // Creative work types
// addMapping('WORK_OF_ART', 'creative_work');
// addMapping('work_of_art', 'creative_work');
// addMapping('artwork', 'creative_work');
// addMapping('creative', 'creative_work');

// // Event types
// addMapping('EVENT', 'event');
// addMapping('event', 'event');

// // Product types
// addMapping('PRODUCT', 'product');
// addMapping('product', 'product');

// // Case types (newly added)
// addMapping('CASE', 'case');
// addMapping('case', 'case');
// addMapping('case_number', 'case');
// addMapping('CASE_NUMBER', 'case');
// addMapping('lawsuit', 'case');
// addMapping('LAWSUIT', 'case');

// // Language types
// addMapping('LANGUAGE', 'language');
// addMapping('language', 'language');

// // Miscellaneous types
// addMapping('misc', 'UNKNOWN');
// addMapping('MISC', 'UNKNOWN');
// addMapping('miscellaneous', 'UNKNOWN');
// addMapping('other', 'UNKNOWN');
// addMapping('OTHER', 'UNKNOWN');

// // Default mapping for other unknown types
// addMapping('unknown', 'UNKNOWN');
// addMapping('UNK', 'UNKNOWN');
// addMapping('UNKNOWN', 'UNKNOWN');

/**
 * mapEntityType
 *
 * Mapping to localized keys has been disabled. Return the original
 * entity type unchanged so downstream code works with the raw types
 * coming from the data source.
 */
export const mapEntityType = (type: string): string => {
  // Mapping intentionally disabled - return original type
  return type;
};

/**
 * Checks if an entity type represents a person
 *
 * This now performs a case-insensitive check against standard English
 * person type tokens and avoids relying on localized mappings.
 */
export const isPersonType = (type: string): boolean => {
  if (!type) return false;
  const lower = type.toLowerCase();
  return /^(person|per|people|individual)s?$/i.test(lower);
};

export const getNode = (obj: FlatTreeObj, key: string): FlatTreeNode => {
  // First try the original key
  let node = obj[key];

  // NOTE: Previously we attempted a secondary lookup using localized mappings
  // (entityTypeMapping). That mapping is intentionally disabled now and we
  // will not perform alternate mapped lookups. This ensures we always use the
  // raw type keys present in the taxonomy/object.
  //
  // If not found, fall back to UNKNOWN
  if (!node) {
    // Avoid infinite recursion by checking if we're already looking for UNKNOWN
    if (key === 'UNKNOWN') {
      throw new Error(`UNKNOWN node not found in taxonomy`);
    }
    // if there is no node return the 'unknown node'
    return getNode(obj, 'UNKNOWN');
  }
  return node;
};

export const ascend = (obj: FlatTreeObj, key: string): FlatTreeNode => {
  const node = getNode(obj, key);
  if (!node.parent) {
    return node;
  }
  return ascend(obj, node.parent);
};

export const getAllNodeData = (
  obj: FlatTreeObj,
  key: string
): ChildNodeWithColor => {
  const node = getNode(obj, key);
  const parentNode = ascend(obj, key) as ParentNode;
  const { parent, ...nodeProps } = node;

  // If the parent is UNKNOWN and the original key is different from UNKNOWN,
  // assign a random color instead of the gray UNKNOWN color
  let color = parentNode.color;
  if (parentNode.key === 'UNKNOWN' && key !== 'UNKNOWN') {
    color = getRandomColorForEntityType(key);
  }

  return {
    color,
    ...nodeProps,
  };
};

export const getNodesPath = (
  obj: FlatTreeObj,
  key: string,
  nodes: FlatTreeNode[] = []
): FlatTreeNode[] => {
  const node = getNode(obj, key);

  nodes = [node, ...nodes];

  if (!node.parent) {
    return nodes;
  }
  return getNodesPath(obj, node.parent, nodes);
};

export const getChildrenFromFlatTaxonomy = <T = FlatTreeNode>(
  obj: FlatTreeObj,
  key: string,
  nodes: T[] = [],
  transformFn?: (node: FlatTreeNode) => T
): T[] => {
  if (!(key in obj)) {
    return [];
  }
  return [
    ...nodes,
    ...Object.values(obj).reduce((acc, node) => {
      if (node.parent === key) {
        const value = (transformFn ? transformFn(node) : node) as T;
        acc.push(
          value,
          ...getChildrenFromFlatTaxonomy(obj, node.key, nodes, transformFn)
        );
      }
      return acc;
    }, [] as T[]),
  ];
};

export const getNodeAndChildren = <T = FlatTreeNode>(
  obj: FlatTreeObj,
  key: string,
  transformFn?: (node: FlatTreeNode) => T
): T[] => {
  const node = getNode(obj, key);
  const value = (transformFn ? transformFn(node) : node) as T;
  return [
    value,
    ...getChildrenFromFlatTaxonomy<T>(obj, node.key, [], transformFn),
  ];
};

export const countChildren = (
  item: TreeItem | ChildTreeItem,
  accumulator: number = 0
) => {
  if (!item.children || item.children.length === 0) {
    return accumulator;
  }
  return item.children.reduce((acc, child) => {
    acc = 1 + countChildren(child, acc);
    return acc;
  }, accumulator);
};
