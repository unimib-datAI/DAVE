import { Cluster } from '@/server/routers/document';
import { beautifyString, groupBy, isEmptyObject } from '@/utils/shared';
import { useContext, useMemo } from 'react';
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
import {
  DocumentContext,
  DocumentStateContext,
  DocumentDispatchContext,
} from './DocumentContext';
import { ProcessedCluster, State } from './types';
import { getAnnotationTypes, getCandidateId, getEntityIndex } from './utils';

/**
 * Access the document state within the DocumentProvider.
 */
export const useDocumentState = () => {
  const context = useContext(DocumentStateContext);

  if (context === undefined) {
    throw new Error('useDocumentState must be used within a DocumentProvider');
  }

  return context;
};

/**
 * Access the document disptach within the DocumentProvider.
 */
export const useDocumentDispatch = () => {
  const context = useContext(DocumentDispatchContext);

  if (context === undefined) {
    throw new Error(
      'useDocumentDispatch must be used within a DocumentProvider'
    );
  }

  return context;
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
  const _state = useDocumentState();
  return cb(_state);
}

// input selectors just select part of the state
export const selectDocumentId = (state: State) => state.data.id;
export const selectDocumentData = (state: State) => state.data;
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
    const { annotations } = annotationSets[activeAnnotationSet];
    return annotations[entityIndex];
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
    return annSet.name;
  }
);
export const selectDocumentClusters = createSelector(
  selectDocumentData,
  selectViews,
  // current annotation set
  (doc, views) => {
    console.log(
      '🔍 selectDocumentClusters called with doc:',
      doc,
      'views:',
      views
    );

    if (views.length > 1) {
      return null;
    }

    const { activeAnnotationSet } = views[0];

    const { text, annotation_sets, features } = doc;
    console.log('🔍 activeAnnotationSet:', activeAnnotationSet);
    console.log('🔍 annotation_sets:', annotation_sets);
    console.log('🔍 features.clusters:', features.clusters);

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
    if (!features.clusters) {
      return null;
    }

    const annSetClusters = features.clusters[activeAnnotationSet];
    if (!annSetClusters) {
      return null;
    }

    console.log('🔍 annSetClusters before processing:', annSetClusters);
    console.log('🔍 annSet.annotations:', annSet.annotations);

    const clusters = annSetClusters
      .map((cluster) => {
        console.log(
          '🔍 Processing cluster:',
          cluster.title,
          'with mentions:',
          cluster.mentions
        );

        const mentions = cluster.mentions
          .map((mention, index) => {
            console.log(`🔍 Processing mention ${index}:`, mention);
            const ann = annSet.annotations.find((ann) => ann.id === mention.id);

            if (!ann) {
              // If annotation is not found, return null to filter it out later
              console.log('🔍 Annotation not found for mention:', mention);
              return null;
            }

            console.log(`🔍 Found annotation for mention ${index}:`, ann);

            const startOffset = ann.start - 10 < 0 ? 0 : ann.start - 10;
            const endOffset =
              ann.end + 10 > text.length ? text.length : ann.end + 10;

            const processedMention = {
              id: mention.id, // Keep original mention ID
              mention: mention.mention, // Keep original mention text
              mentionText: `...${text.slice(startOffset, endOffset)}...`,
            };

            console.log(`🔍 Processed mention ${index}:`, processedMention);
            return processedMention;
          })
          .filter((mention) => mention !== null); // Filter out null mentions

        console.log('🔍 Final mentions for cluster:', cluster.title, mentions);

        // Normalize cluster type using robust case-insensitive mapping
        // Ensure the normalized type is consistently cased
        const normalizedType = getNormalizedEntityType(cluster.type);

        return {
          ...cluster,
          type: normalizedType,
          mentions,
        } as ProcessedCluster;
      })
      .filter((cluster) => cluster.mentions.length > 0); // Filter out empty clusters

    console.log('🔍 clusters after processing:', clusters);

    const clusterGroups = groupBy(clusters, (cluster) => cluster.type);

    console.log('🔍 final clusterGroups:', clusterGroups);
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
      const normalizedType = getNormalizedEntityType(ann.type);

      // Check both the original type and the normalized type (case insensitive)
      return (
        lowerFilterTypes.has(normalizedType.toLowerCase()) ||
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
    // Debug logging for specific document
    const targetDocId =
      '841ff7342f6ebf228b6e9eb1c5616441b7e36dc971cd78a480c5a461be3b937a';

    if (!searchTerm) {
      return annotations;
    }

    // Log only when actively filtering with search term on our target document
    if (searchTerm && documentId.toString() === targetDocId) {
      console.log(
        'DEBUG - APPLYING SEARCH FILTER for document:',
        documentId,
        'with search term:',
        searchTerm
      );
    }

    // Apply the filter
    const filteredResults = annotations.filter((ann) => {
      // Also check the normalized type for matching
      const normalizedType = getNormalizedEntityType(ann.type);
      if (normalizedType.toLowerCase().includes(searchTerm)) {
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

    // Log filtered results for our target document
    if (searchTerm && documentId.toString() === targetDocId) {
      const debugFilteredResults = filteredResults.map((ann) => ({
        id: ann.id,
        type: ann.type,
        start: ann.start,
        end: ann.end,
        features: {
          mention: ann.features.mention,
          title: ann.features.title,
          type: ann.type,
        },
      }));

      console.log(
        'DEBUG - FILTERED RESULTS for document:',
        documentId,
        'filtered count:',
        filteredResults.length,
        'filtered annotations:',
        debugFilteredResults
      );
    }

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
