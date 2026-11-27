import {
  AnnotationSet,
  Candidate,
  EntityAnnotation,
} from '@/server/routers/document';
import { deepEqual } from '@/utils/shared';
import { Draft } from 'immer';
import {
  ChildNode,
  flattenTree,
  FlatTreeNode,
  FlatTreeObj,
  getNode,
} from '../../../components/Tree';
import { assignTypeColors, stableTypeColor } from '@/lib/typeColors';
import { Action, FlattenedTaxonomy, State, Taxonomy } from './types';

/**
 * Add a new annotation - optimized for performance
 */
export const addAnnotation = (
  annotation: EntityAnnotation[],
  newAnnotation: EntityAnnotation
) => {
  if (annotation.length === 0) {
    return [newAnnotation];
  }

  // Use binary search for faster insertion point - O(log n) instead of O(n)
  let start = 0;
  let end = annotation.length - 1;
  let insIndex = -1;

  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    if (newAnnotation.start < annotation[mid].start) {
      insIndex = mid;
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }

  if (insIndex === -1) {
    // Add to the end if we didn't find an insertion point
    return [...annotation, newAnnotation];
  }

  // Create a new array with minimal copying
  const result = new Array(annotation.length + 1);

  // Copy elements before insertion point
  for (let i = 0; i < insIndex; i++) {
    result[i] = annotation[i];
  }

  // Insert the new annotation
  result[insIndex] = newAnnotation;

  // Copy elements after insertion point
  for (let i = insIndex; i < annotation.length; i++) {
    result[i + 1] = annotation[i];
  }

  return result;
};

export const getAnnotations = (
  annotations: EntityAnnotation[],
  index: number
) => {
  const mainAnnotation = annotations[index];

  const multiTypeIndex = annotations
    .slice(index + 1, annotations.length)
    .findIndex(
      (ann) =>
        ann.start !== mainAnnotation.start || ann.end !== mainAnnotation.end
    );

  const multiTypeAnnotations = annotations.slice(index + 1, multiTypeIndex);

  return {
    main: mainAnnotation,
    multi: multiTypeAnnotations,
  };
};

/**
 // Scroll to an entity position in the document (with improved throttling)
*/
let scrollThrottle: NodeJS.Timeout | null = null;
let lastScrolledId: number | null = null;

export const scrollEntityIntoView = (id: number) => {
  // Skip if we're already scrolling to this entity
  if (lastScrolledId === id) return;

  if (scrollThrottle) {
    clearTimeout(scrollThrottle);
  }

  lastScrolledId = id;

  scrollThrottle = setTimeout(() => {
    const element = document.getElementById(`entity-tag-${id}`);
    if (!element) {
      lastScrolledId = null;
      return;
    }

    // Check if element is already visible in viewport before scrolling
    const rect = element.getBoundingClientRect();
    const isVisible =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth);

    // Only scroll if not already visible
    if (!isVisible) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }

    scrollThrottle = null;
    // Reset last scrolled ID after a delay
    setTimeout(() => {
      lastScrolledId = null;
    }, 500);
  }, 100);
};

/**
 * Compose unique id given a candidate id and indexer
 */
export const getCandidateId = (candidate: Candidate | undefined) => {
  if (!candidate) {
    return '';
  }
  return `${candidate.indexer}/${candidate.id}`;
};

export const toggleLeftSidebar = (
  state: Draft<State>,
  payload: (Action & { type: 'changeAction' })['payload']
) => {
  if (state.ui.action.value === payload.action) {
    state.ui.leftActionBarOpen = !state.ui.leftActionBarOpen;
  } else {
    state.ui.leftActionBarOpen = true;
  }
};

export const isSameAction = (
  oldAction: State['ui']['action'],
  newAction: State['ui']['action']
) => deepEqual(oldAction, newAction);

/**
 * The entity types of some annotations, for the type filters: one item per
 * type, as named by the annotations, with its count (most frequent first).
 * `types` is the list of raw types the item stands for (just its own).
 */
export const getAnnotationTypes = (
  taxonomy: FlattenedTaxonomy,
  annotations: EntityAnnotation[]
) => {
  const groups = new Map<string, { key: string; label: string; n: number; types: string[] }>();
  for (const ann of annotations) {
    const node = getNode(taxonomy, ann.type);
    let group = groups.get(node.key);
    if (!group) {
      group = { key: node.key, label: node.label, n: 0, types: [] };
      groups.set(node.key, group);
    }
    group.n += 1;
    if (!group.types.includes(ann.type)) group.types.push(ann.type);
  }
  return Array.from(groups.values()).sort((a, b) => b.n - a.n);
};

// Cache for getTypeFilter to avoid recreating the array on every call
const typeFilterCache = new WeakMap<EntityAnnotation[], string[]>();

export const getTypeFilter = (annotations: EntityAnnotation[]) => {
  // Return cached result if available
  if (typeFilterCache.has(annotations)) {
    return typeFilterCache.get(annotations)!;
  }

  // Use a Map to track both normalized types and their original values
  const typeMap = new Map<string, string>();

  annotations.forEach((ann) => {
    // Always normalize the entity type for consistent grouping
    const normalizedType = ann.type;

    // Store with the original casing from the first occurrence
    if (!typeMap.has(normalizedType.toLowerCase())) {
      typeMap.set(normalizedType.toLowerCase(), normalizedType);
    }
  });

  // Convert to array of normalized types with consistent casing
  const result = Array.from(typeMap.values());

  // Cache the result
  typeFilterCache.set(annotations, result);
  return result;
};

export const getEntityIndex = (id: string) => {
  const [viewIndex, index] = id.split('/');
  return [parseInt(viewIndex), parseInt(index)] as const;
};

/**
 * Returns the taxonomy with a color for every type, all clearly different from
 * each other (see assignTypeColors in lib/typeColors.ts): the collection's
 * stored per-type colors are kept as they are, the other types get the
 * nearest color to their usual one that does not look like any color in use.
 */
export const applyTypeColors = (
  taxonomy: FlatTreeObj,
  typeColors: Record<string, string> | undefined
): FlatTreeObj => {
  const colors = assignTypeColors(Object.keys(taxonomy), typeColors ?? {});
  let next: FlatTreeObj | null = null;
  for (const [type, color] of Object.entries(colors)) {
    const node = taxonomy[type];
    if (node && (node as { color?: string }).color !== color) {
      next ??= { ...taxonomy };
      next[type] = { ...node, color } as FlatTreeNode;
    }
  }
  return next ?? taxonomy;
};

/**
 * The taxonomy of a document: exactly the entity types its annotations carry,
 * each a top-level node named as the annotations name it (PERSON, ORG,
 * persona...), with a stable color. No predefined types, no renaming, no
 * grouping: `taxonomy` only adds types that are not already present (e.g. kept
 * empty, see baseTaxonomy).
 */
export const createTaxonomy = (
  taxonomy: Taxonomy,
  annotationSets: AnnotationSet<EntityAnnotation>[]
) => {
  const flat = flattenTree(taxonomy);
  annotationSets.forEach((annSet) => {
    annSet.annotations.forEach((ann) => {
      if (!ann.type || flat[ann.type]) return;
      flat[ann.type] = {
        key: ann.type,
        label: ann.type,
        color: stableTypeColor(ann.type),
        parent: null,
      } as FlatTreeNode;
    });
  });
  return flat;
};
