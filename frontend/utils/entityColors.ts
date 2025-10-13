import {
  clearEntityColorCache as clearTreeColorCache,
  getEntityColorCache as getTreeColorCache
} from '@/components/Tree/utils';
import {
  clearEntityColorCache as clearTreeSpecColorCache,
  getEntityColorCache as getTreeSpecColorCache
} from '@/components/TreeSpecialization/utils';

/**
 * Utility module for managing entity colors across the application.
 * This module provides a centralized interface for working with random colors
 * assigned to entities that fall back to UNKNOWN/UNK nodes.
 */

export interface EntityColorStats {
  totalEntities: number;
  uniqueColors: number;
  colorMap: Record<string, string>;
}

/**
 * Clears all cached entity colors from both Tree and TreeSpecialization components.
 * This will cause new random colors to be generated for entities on next access.
 */
export const clearAllEntityColors = (): void => {
  clearTreeColorCache();
  clearTreeSpecColorCache();
};

/**
 * Gets statistics about currently assigned entity colors.
 * Returns information from both Tree and TreeSpecialization caches.
 */
export const getEntityColorStats = (): EntityColorStats => {
  const treeColors = getTreeColorCache();
  const treeSpecColors = getTreeSpecColorCache();

  // Combine both caches
  const allColors = new Map([...treeColors, ...treeSpecColors]);

  const colorMap: Record<string, string> = {};
  allColors.forEach((color, entityType) => {
    colorMap[entityType] = color;
  });

  return {
    totalEntities: allColors.size,
    uniqueColors: new Set(allColors.values()).size,
    colorMap
  };
};

/**
 * Gets all entity types that currently have assigned random colors.
 */
export const getEntitiesWithRandomColors = (): string[] => {
  const stats = getEntityColorStats();
  return Object.keys(stats.colorMap);
};

/**
 * Checks if a specific entity type has a random color assigned.
 */
export const hasRandomColor = (entityType: string): boolean => {
  const treeColors = getTreeColorCache();
  const treeSpecColors = getTreeSpecColorCache();

  return treeColors.has(entityType) || treeSpecColors.has(entityType);
};

/**
 * Gets the assigned color for a specific entity type, if any.
 * Returns undefined if no random color has been assigned.
 */
export const getEntityColor = (entityType: string): string | undefined => {
  const treeColors = getTreeColorCache();
  const treeSpecColors = getTreeSpecColorCache();

  return treeColors.get(entityType) || treeSpecColors.get(entityType);
};

/**
 * Utility function to export current color assignments as JSON.
 * Useful for debugging or potential persistence features.
 */
export const exportColorAssignments = (): string => {
  const stats = getEntityColorStats();
  return JSON.stringify(stats.colorMap, null, 2);
};

/**
 * Generates a summary report of color usage.
 * Useful for debugging and monitoring color distribution.
 */
export const generateColorReport = (): {
  summary: string;
  details: EntityColorStats;
} => {
  const stats = getEntityColorStats();

  const summary = `
Entity Color Report
==================
Total entity types with random colors: ${stats.totalEntities}
Unique colors generated: ${stats.uniqueColors}
Color reuse rate: ${stats.totalEntities > 0
  ? ((stats.totalEntities - stats.uniqueColors) / stats.totalEntities * 100).toFixed(1)
  : 0}%

Entity Types:
${Object.keys(stats.colorMap).sort().map(entityType =>
  `  ${entityType}: ${stats.colorMap[entityType]}`
).join('\n')}
  `.trim();

  return {
    summary,
    details: stats
  };
};

/**
 * Type guard to check if a color is a hex color.
 */
export const isHexColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
};

/**
 * Converts a hex color to RGB values.
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  if (!isHexColor(hex)) {
    return null;
  }

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return { r, g, b };
};

/**
 * Calculates the luminance of a color for accessibility purposes.
 * Returns a value between 0 (darkest) and 1 (lightest).
 */
export const calculateLuminance = (hex: string): number => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const { r, g, b } = rgb;

  // Convert to relative luminance
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
};

/**
 * Suggests whether white or black text would be more readable on a given background color.
 */
export const getReadableTextColor = (backgroundColor: string): '#000000' | '#ffffff' => {
  const luminance = calculateLuminance(backgroundColor);
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

/**
 * Development helper: Logs current color assignments to console.
 * Only available in development mode.
 */
export const debugColorAssignments = (): void => {
  if (process.env.NODE_ENV === 'development') {
    const report = generateColorReport();
    console.group('🎨 Entity Color Debug');
    console.log(report.summary);
    console.table(report.details.colorMap);
    console.groupEnd();
  }
};
