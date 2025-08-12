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
  getNode,
  mapEntityType,
} from '../../../components/Tree';
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

export const getAnnotationTypes = (
  taxonomy: FlattenedTaxonomy,
  annotations: EntityAnnotation[]
) => {
  let map = {} as Record<
    string,
    {
      key: string;
      label: string;
      n: number;
    }
  >;

  for (const ann of annotations) {
    const node = getNode(taxonomy, ann.type);

    if (!map[node.key]) {
      map[node.key] = {
        key: node.key,
        label: node.label,
        n: 1,
      };
    } else {
      map[node.key] = {
        ...map[node.key],
        n: map[node.key].n + 1,
      };
    }
  }

  return Object.values(map).sort((a, b) => b.n - a.n);
};

// Cache for getTypeFilter to avoid recreating the array on every call
const typeFilterCache = new WeakMap<EntityAnnotation[], string[]>();

export const getTypeFilter = (annotations: EntityAnnotation[]) => {
  // Return cached result if available
  if (typeFilterCache.has(annotations)) {
    return typeFilterCache.get(annotations)!;
  }

  const typeFilter = new Set<string>();
  annotations.forEach((ann) => {
    // Add both the original type and the mapped type to ensure filtering works
    typeFilter.add(ann.type);
    const mappedType = mapEntityType(ann.type);
    if (mappedType !== ann.type) {
      typeFilter.add(mappedType);
    }
  });

  const result = Array.from(typeFilter);
  // Cache the result
  typeFilterCache.set(annotations, result);
  return result;
};

export const getEntityIndex = (id: string) => {
  const [viewIndex, index] = id.split('/');
  return [parseInt(viewIndex), parseInt(index)] as const;
};

export const createTaxonomy = (
  taxonomy: Taxonomy,
  annotationSets: AnnotationSet<EntityAnnotation>[]
) => {
  const flatTaxonomy = flattenTree(taxonomy);
  const unknownNodes: Record<string, FlatTreeNode> = {};

  annotationSets.forEach((annSet) => {
    annSet.annotations.forEach((ann) => {
      if (!unknownNodes[ann.type] && !flatTaxonomy[ann.type]) {
        const node: ChildNode = {
          key: ann.type,
          label: `${ann.type[0].toUpperCase()}${ann.type
            .slice(1)
            .toLowerCase()}`,
          parent: 'UNKNOWN',
          recognizable: false,
        };
        unknownNodes[ann.type] = node;
      }
    });
  });

  return {
    ...flatTaxonomy,
    ...unknownNodes,
  };
};
