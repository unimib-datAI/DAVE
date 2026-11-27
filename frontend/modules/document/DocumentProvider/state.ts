import { Taxonomy, UIState } from './types';

// No predefined entity types: the document view shows exactly the types its
// annotations carry, under their own names (see createTaxonomy in utils.ts).
// Kept as an export so pages that build a taxonomy from it keep working.
export const baseTaxonomy: Taxonomy = [];

/**
 * Initial state
 */
export const initialUIState: Omit<UIState, 'taxonomy'> = {
  // data: undefined,
  /**
   * The idea is to let the user provide the taxonomy as a tree structure, then it is converted to an internal representation (a "flattened tree").
   */
  // taxonomy: flattenTree(baseTaxonomy),
  ui: {
    action: {
      value: 'clusters',
    },
    leftActionBarOpen: true,
    newAnnotationModalOpen: false,
    selectedEntity: null,
    highlightAnnotation: {
      entityId: null,
    },
    views: [
      {
        typeFilter: [],
        activeAnnotationSet: '',
        activeSection: undefined,
      },
    ],
  },
};
