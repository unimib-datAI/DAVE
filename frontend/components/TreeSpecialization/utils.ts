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

export const getNode = (obj: FlatTreeObj, key: string): FlatTreeNode => {
  const node = obj[key];
  if (!node) {
    // if there is no node return the 'unknown node'
    return getNode(obj, 'UNK');
    // throw Error(`The key '${key}' doesn't exist in the tree`);
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

  // If the parent is UNK and the original key is different from UNK,
  // assign a random color instead of the gray UNK color
  let color = parentNode.color;
  if (parentNode.key === 'UNK' && key !== 'UNK') {
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
