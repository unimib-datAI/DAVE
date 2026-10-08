import { Cluster } from '@/server/routers/document';
import { beautifyString, groupBy, isEmptyObject } from '@/utils/shared';
import { useContext, useMemo, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { createSelector } from 'reselect';
import {
  buildTreeFromFlattenedObject,
  FlatTreeNode,
  FlatTreeObj,
  getAllNodeData,
  mapEntityType,
} from '../../../components/Tree';
import { getNormalizedEntityType } from './utils';
import SelectAnnotationSet from '../Toolsbar/SelectAnnotationSet';
import { DocumentContext, documentStateAtom } from './DocumentContext';
import { ProcessedCluster, State, Action } from './types';
import { getAnnotationTypes, getCandidateId, getEntityIndex } from './utils';
import { documentReducer } from './reducer';

/**
 * Access the document state within the DocumentProvider.
 */
export const useDocumentState = (): State => {
  const state = useAtomValue(documentStateAtom);
  if (state === undefined) {
    throw new Error('useDocumentState must be used within a DocumentProvider');
  }
  return state;
};

/**
 * Access the document dispatch within the DocumentProvider.
 */
export const useDocumentDispatch = () => {
  const setAtom = useSetAtom(documentStateAtom);
  return useCallback(
    (action: Action) =>
      setAtom((prev) => {
        if (prev === undefined)
          throw new Error(
            'useDocumentDispatch must be used within a DocumentProvider'
          );
        return documentReducer(prev, action);
      }),
    [setAtom]
  );
};

/**
 * Access the document context within the DocumentProvider.
 */
export const useDocumentContext = () => {
  const context = useContext(DocumentContext);

  if (context === undefined) {
    throw new Error(
      'useDocumentContext must be used within a DocumentProvider'
    );
  }

  return context;
};

/**
 * An hook to select the state partially
 */
export function useSelector<T>(cb: (state: State) => T) {
  const state = useDocumentState();
  return cb(state);
}

// input selectors just select part of the state
export const selectDocumentId = (state: State) => state.data.id;
export const selectDocumentData = (state: State) => state.data;
export const selectDocumentDirty = (state: State) => state.dirty;
export const selectDocumentText = (state: State) => state.data.text;
export const selectDocumentAnnotationSets = (state: State) =>
  state.data.annotation_sets;
export const selectDocumentSectionAnnotations = (state: State) =>
  state.data.annotation_sets.Sections?.annotations;
export const selectDocumentTaxonomy = (state: State) => state.taxonomy;
export const selectDocumentAction = (state: State) => state.ui.action;
export const selectDocumentActiveType = (state: State) => state.ui.action.data;
export const selectDocumentCurrentEntity = (state: State) =>
  state.ui.selectedEntity;
export const selectDocumentLeftSidebarOpen = (state: State) =>
  state.ui.leftActionBarOpen;
export const selectNewAnnotationModalOpen = (state: State) =>
  state.ui.newAnnotationModalOpen;
export const selectViews = (state: State) => state.ui.views;
export const selectHighlightAnnotationId = (state: State) =>
  state.ui.highlightAnnotation.entityId;

// selector which receives an input
const selectViewIndex = (state: State, viewIndex: number) => viewIndex;

export const selectDocumentTagTypeFilter = createSelector(
  [selectViews, selectViewIndex],
  (views, viewIndex) => views[viewIndex].typeFilter
);

export const selectDocumentActiveAnnotationSet = createSelector(
  [selectViews, selectViewIndex],
  (views, viewIndex) => views[viewIndex].activeAnnotationSet
);

export const selectActiveEntityAnnotations = createSelector(
  selectDocumentActiveAnnotationSet,
  selectDocumentAnnotationSets,
  (activeAnnotationSet, annotationSets) => {
    if (annotationSets[activeAnnotationSet]) {
      return annotationSets[activeAnnotationSet].annotations;
    }
    return [];
  }
);

export const selectAllEntityAnnotationSets = createSelector(
  selectDocumentAnnotationSets,
  (annotationSets) =>
    Object.values(annotationSets).filter((set) =>
      set.name.startsWith('entities')
    )
);

// For expensive selectors memoize them with createSelector (e.g. array operations)
export const selectTaxonomyTree = createSelector(
  selectDocumentTaxonomy,
  (taxonomy) => buildTreeFromFlattenedObject(taxonomy)
);
export const selectCurrentEntity = createSelector(
  selectViews,
  selectDocumentAnnotationSets,
  selectDocumentCurrentEntity,
  (views, annotationSets, currentEntity) => {
    if (currentEntity == null) {
      return undefined;
    }
    const { viewIndex, entityIndex } = currentEntity;
    const { activeAnnotationSet } = views[viewIndex];
    const annSet = annotationSets[activeAnnotationSet];
    if (!annSet) {
      return undefined;
    }
    return annSet.annotations[entityIndex];
  }
);
export const selectCurrentAnnotationSetName = createSelector(
  selectDocumentData,
  selectViews,
  // current annotation set
  (doc, views) => {
    if (views.length > 1) {
      return null;
    }

    const { activeAnnotationSet } = views[0];

    const { annotation_sets } = doc;
    const annSet = annotation_sets[activeAnnotationSet];
    return annSet ? annSet.name : null;
  }
);
/**
 * Find where an orphaned cluster mention (one whose annotation id doesn't
 * exist) occurs in the text. Prefers occurrences inside an existing annotation
 * and skips offsets already taken. Returns null if the text isn't found.
 */
const findOrphanMentionOffset = (
  text: string,
  mentionText: string,
  annotations: { start: number; end: number }[],
  used: Set<number>
): number | null => {
  if (!mentionText) {
    return null;
  }
  let firstFree: number | null = null;
  let idx = text.indexOf(mentionText);
  while (idx !== -1) {
    if (!used.has(idx)) {
      if (firstFree === null) {
        firstFree = idx;
      }
      const inside = annotations.some(
        (a) => a.start <= idx && idx + mentionText.length <= a.end
      );
      if (inside) {
        return idx;
      }
    }
    idx = text.indexOf(mentionText, idx + 1);
  }
  return firstFree;
};

export const selectDocumentClusters = createSelector(
  selectDocumentData,
  selectViews,
  // current annotation set
  (doc, views) => {

    if (views.length > 1) {
      return null;
    }

    const { activeAnnotationSet } = views[0];

    const { text, annotation_sets, features } = doc;

    if (!features?.clusters) {
      return null;
    }

    let annSet = annotation_sets[activeAnnotationSet];
    if (!annSet) {
      // Handle the case where annotation_sets might be a Record/object - convert to array first
      const setsArray = Object.values(annotation_sets);
      const foundSet = setsArray.find(
        (set) => set.name === activeAnnotationSet
      );
      if (foundSet) {
        annSet = foundSet;
      }
    }
    if (!annSet) {
      return null;
    }

    const annSetClusters = features.clusters[activeAnnotationSet];
    if (!annSetClusters) {
      return null;
    }


    const clusters = annSetClusters
      .map((cluster) => {

        // Offsets already used by orphaned mentions of this cluster, so that
        // repeated mentions with the same text get distinct snippets
        const usedOrphanOffsets = new Set<number>();
        let orphanCount = 0;

        const mentions = cluster.mentions.map((mention) => {
          const ann = annSet.annotations.find((ann) => ann.id === mention.id);

          let start: number | null = null;
          let end: number | null = null;

          if (ann) {
            start = ann.start;
            end = ann.end;
          } else {
            // The mention points to an annotation that doesn't exist (e.g.
            // replaced by a larger span). Keep the mention and locate it in
            // the text, preferring an occurrence inside an existing annotation.
            orphanCount += 1;
            const found = findOrphanMentionOffset(
              text,
              mention.mention,
              annSet.annotations,
              usedOrphanOffsets
            );
            if (found !== null) {
              usedOrphanOffsets.add(found);
              start = found;
              end = found + mention.mention.length;
            }
          }

          const mentionText =
            start === null || end === null
              ? mention.mention
              : `...${text.slice(
                  Math.max(start - 10, 0),
                  Math.min(end + 10, text.length)
                )}...`;

          return {
            id: mention.id, // Keep original mention ID
            mention: mention.mention, // Keep original mention text
            mentionText,
          };
        });

        if (orphanCount > 0) {
          console.warn(
            `Cluster "${cluster.title}": ${orphanCount} mention(s) without a matching annotation`
          );
        }

        // Normalize cluster type using robust case-insensitive mapping
        // Ensure the normalized type is consistently cased
        const normalizedType = cluster.type;

        return {
          ...cluster,
          type: normalizedType,
          mentions,
          title: cluster.title.replace('vault:v1:', ''),
        } as ProcessedCluster;
      })
      .filter((cluster) => cluster.mentions.length > 0); // Filter out empty clusters


    const clusterGroups = groupBy(clusters, (cluster) => cluster.type);

    return clusterGroups;
  }
);

/**
 * Select linking features for the current entity
 */
export const selectAnnotationFeatures = createSelector(
  selectCurrentEntity,
  (annotation) => {
    if (!annotation) {
      return undefined;
    }
    return annotation.features;
    // const { candidates, top_candidate, ...rest } =
    //   annotation.features.linking || {};

    // if (!candidates) {
    //   return undefined;
    // }
    // // order candidates
    // const orderedCandidates = candidates.sort((a, b) => {
    //   if (getCandidateId(a) === getCandidateId(top_candidate)) {
    //     return -1;
    //   }
    //   if (getCandidateId(b) === getCandidateId(top_candidate)) {
    //     return 1;
    //   }
    //   return b.score - a.score;
    // });
    // return {
    //   candidates: orderedCandidates,
    //   top_candidate,
    //   ...rest,
    // };
  }
);

/**
 * Get entities filtered by the current type filter
 */
export const selectFilteredEntityAnnotations = createSelector(
  selectActiveEntityAnnotations,
  selectDocumentTagTypeFilter,
  (annotations, typeFilter) => {
    // Create a set of lowercase filter types for faster lookup
    const lowerFilterTypes = new Set(typeFilter.map((t) => t.toLowerCase()));

    return annotations.filter((ann) => {
      // Use case-insensitive mapping for better matching

      // Check both the original type and the normalized type (case insensitive)
      return (
        lowerFilterTypes.has(ann.type.toLowerCase()) ||
        lowerFilterTypes.has(ann.type.toLowerCase())
      );
    });
  }
);

/**
 * Filter entity annotations by type and search term (if provided).
 * Search matches against type, features.mention, and features.title fields.
 * All comparisons are case-insensitive.
 */
export const selectFilteredEntityAnnotationsWithSearch = createSelector(
  selectFilteredEntityAnnotations,
  selectDocumentId,
  (state: State, viewIndex: number, searchTerm?: string) =>
    searchTerm?.toLowerCase() || '',
  (annotations, documentId, searchTerm) => {
    if (!searchTerm) {
      return annotations;
    }

    // Apply the filter
    const filteredResults = annotations.filter((ann) => {
      // Also check the normalized type for matching
      if (ann.type.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // Original type matching
      if (ann.type.toLowerCase().includes(searchTerm)) {
        return true;
      }

      // features.mention matching
      if (
        ann.features.mention &&
        ann.features.mention.toLowerCase().includes(searchTerm)
      ) {
        return true;
      }

      // features.title matching
      if (
        ann.features.title &&
        ann.features.title.toLowerCase().includes(searchTerm)
      ) {
        return true;
      }

      return false;
    });

    return filteredResults;
  }
);

/**
 * Get add selection color based on the taxonomy type selected
 */
export const selectAddSelectionColor = createSelector(
  selectDocumentTaxonomy,
  selectDocumentAction,
  (taxonomy, action) => {
    if (!action.data) {
      return '';
    }
    try {
      return getAllNodeData(taxonomy, action.data).color;
    } catch (err) {
      // trying to access a node that doesn't exist
      return '';
    }
  }
);

export const selectSectionsSidebar = createSelector(
  selectDocumentSectionAnnotations,
  (sectionAnnotations) => {
    if (!sectionAnnotations) {
      return [];
    }
    return sectionAnnotations.map((section) => ({
      id: section.type,
      label: beautifyString(section.type),
    }));
  }
);
