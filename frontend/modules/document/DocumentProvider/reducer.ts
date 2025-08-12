import { Annotation } from '@/lib/ner/core/types';
import {
  AdditionalAnnotationProps,
  AnnotationSet,
  Cluster,
  EntityAnnotation,
} from '@/server/routers/document';
import { createImmerReducer } from '@/utils/immerReducer';
import { removeProps } from '@/utils/shared';
import {
  FlatTreeNode,
  getNodeAndChildren,
  mapEntityType,
} from '../../../components/Tree';
import { State, Action } from './types';
import {
  addAnnotation,
  getAnnotationTypes,
  getEntityIndex,
  getTypeFilter,
  isSameAction,
  toggleLeftSidebar,
} from './utils';

export const documentReducer = createImmerReducer<State, Action>({
  setData: (state, payload) => {
    state.data = payload.data;
  },
  highlightAnnotation: (state, payload) => {
    state.ui.highlightAnnotation.entityId = payload.annotationId;
  },
  changeAction: (state, payload) => {
    toggleLeftSidebar(state, payload);
    state.ui.action.value = payload.action;
    state.ui.action.data = undefined;

    // Clear any highlighted annotation when switching to add mode
    if (payload.action === 'add') {
      state.ui.highlightAnnotation.entityId = -1;
    }
  },
  changeActionData: (state, payload) => {
    state.ui.action.data = payload.data;
  },
  createAnnotationSet: (state, payload) => {
    const { name, preset } = payload;

    const keyAnnSet = `entities_${name}`;

    const newAnnSet: AnnotationSet<EntityAnnotation> = {
      name: keyAnnSet,
      annotations: [],
      next_annid: 0,
    };

    if (preset !== '') {
      newAnnSet.annotations = state.data.annotation_sets[preset].annotations;
      newAnnSet.next_annid = state.data.annotation_sets[preset].next_annid;
    }

    state.data.annotation_sets[keyAnnSet] = newAnnSet;
  },
  deleteAnnotationSet: (state, payload) => {
    const { name } = payload;
    const { [name]: omit, ...rest } = state.data.annotation_sets;
    state.data.annotation_sets = rest;
  },
  udpateAnnotationSets: (state, payload) => {
    const { annotationSets } = payload;

    console.log(
      `Updating annotation sets:`,
      annotationSets.map((set) => set.name).join(', ')
    );

    let before = {};
    Object.keys(state.data.annotation_sets).forEach((key) => {
      before[key] = {
        name: state.data.annotation_sets[key].name,
        count: state.data.annotation_sets[key].annotations.length,
        next_annid: state.data.annotation_sets[key].next_annid,
      };
    });

    annotationSets.forEach((set) => {
      console.log(
        `Updating set "${set.name}" with ${
          set.annotations?.length || 0
        } annotations`
      );
      state.data.annotation_sets[set.name] = {
        ...set,
      };
    });

    let after = {};
    Object.keys(state.data.annotation_sets).forEach((key) => {
      after[key] = {
        name: state.data.annotation_sets[key].name,
        count: state.data.annotation_sets[key].annotations.length,
        next_annid: state.data.annotation_sets[key].next_annid,
      };
    });

    console.log('Annotation sets before update:', JSON.stringify(before));
    console.log('Annotation sets after update:', JSON.stringify(after));
  },
  setCurrentEntityId: (state, payload) => {
    const { viewIndex, annotationId } = payload;
    const { views } = state.ui;
    const { activeAnnotationSet } = views[viewIndex];
    const { annotations } = state.data.annotation_sets[activeAnnotationSet];
    const entityIndex = annotations.findIndex((ann) => ann.id === annotationId);
    if (entityIndex !== -1) {
      state.ui.selectedEntity = {
        viewIndex,
        entityIndex,
      };
    } else {
      state.ui.selectedEntity = null;
    }
  },
  nextCurrentEntity: (state) => {
    if (!state.ui.selectedEntity) {
      return state;
    }
    const { views } = state.ui;
    const previousSelectedEntity = state.ui.selectedEntity;
    const { activeAnnotationSet } = views[previousSelectedEntity.viewIndex];
    const { annotations } = state.data.annotation_sets[activeAnnotationSet];
    if (annotations.length - 1 === previousSelectedEntity.entityIndex) {
      state.ui.selectedEntity.entityIndex = 0;
    } else {
      state.ui.selectedEntity.entityIndex =
        previousSelectedEntity.entityIndex + 1;
    }
  },
  previousCurrentEntity: (state) => {
    if (!state.ui.selectedEntity) {
      return state;
    }
    const { views } = state.ui;
    const previousSelectedEntity = state.ui.selectedEntity;
    const { activeAnnotationSet } = views[previousSelectedEntity.viewIndex];
    const { annotations } = state.data.annotation_sets[activeAnnotationSet];
    if (previousSelectedEntity.entityIndex === 0) {
      state.ui.selectedEntity.entityIndex = annotations.length - 1;
    } else {
      state.ui.selectedEntity.entityIndex =
        previousSelectedEntity.entityIndex - 1;
    }
  },
  addAnnotation: (state, payload) => {
    const { views } = state.ui;
    const { viewIndex, type, start, end, text } = payload;
    const { activeAnnotationSet, typeFilter } = views[viewIndex];

    // Clear any highlighted annotation when adding a new one
    state.ui.highlightAnnotation.entityId = -1;

    console.log(
      `Adding annotation: type=${type}, start=${start}, end=${end}, text="${text}"`
    );
    console.log(`Active annotation set: ${activeAnnotationSet}`);

    // Make sure the annotation set exists
    if (!state.data.annotation_sets[activeAnnotationSet]) {
      console.error(`Annotation set "${activeAnnotationSet}" does not exist!`);
      return state;
    }

    const { next_annid, annotations } =
      state.data.annotation_sets[activeAnnotationSet];

    console.log(
      `Current annotations count: ${annotations.length}, next_annid: ${next_annid}`
    );

    // Initialize clusters if they don't exist
    if (!state.data.features.clusters) {
      state.data.features.clusters = {};
    }

    if (!state.data.features.clusters[activeAnnotationSet]) {
      state.data.features.clusters[activeAnnotationSet] = [];
    }

    // Map the annotation type to the proper taxonomy type (e.g., Person -> persona)
    const mappedType = mapEntityType(type);
    console.log(`🔍 Mapped annotation type "${type}" -> "${mappedType}"`);

    // Check if there's a matching cluster by lowercase label within clusters of the same type
    const lowerCaseText = text.toLowerCase();
    const clusters = state.data.features.clusters[activeAnnotationSet];
    console.log(
      `🔍 Searching for cluster matching "${lowerCaseText}" in ${clusters.length} total clusters`
    );

    // First filter clusters by type, then search for matching title
    const clustersOfSameType = clusters.filter(
      (cluster) => cluster.type === mappedType
    );
    console.log(
      `🔍 Found ${clustersOfSameType.length} clusters of type "${mappedType}"`
    );
    console.log(
      `🔍 Clusters of same type:`,
      clustersOfSameType.map((c) => ({ title: c.title, type: c.type }))
    );

    let matchingCluster = clustersOfSameType.find(
      (cluster) => cluster.title.toLowerCase() === lowerCaseText
    );
    console.log(
      `🔍 Matching cluster found:`,
      matchingCluster
        ? `"${matchingCluster.title}" (id: ${matchingCluster.id})`
        : 'none'
    );

    let clusterId: number;

    // If no matching cluster found, create a new one
    if (!matchingCluster) {
      const newClusterId =
        clusters.length > 0 ? Math.max(...clusters.map((c) => c.id)) + 1 : 1;

      clusterId = newClusterId;

      // Create new cluster with mapped type
      const newCluster: Cluster = {
        id: clusterId,
        title: text,
        type: mappedType,
        mentions: [],
      };

      // Add to clusters
      state.data.features.clusters[activeAnnotationSet].push(newCluster);
      matchingCluster = newCluster;
      console.log(
        `Created new cluster "${text}" with id ${clusterId} and mapped type "${mappedType}"`
      );
    } else {
      clusterId = matchingCluster.id;
      console.log(
        `Found matching cluster "${matchingCluster.title}" with id ${clusterId} and type "${mappedType}"`
      );
    }

    const newAnnotation: any = {
      id: next_annid,
      start,
      end,
      type: type,
      features: {
        mention: text,
        cluster: clusterId,
        title: text,
        url: '',
        is_nil: false,
        additional_candidates: [],
        ner: {},
        linking: {},
      },
    };

    console.log(`New annotation created:`, JSON.stringify(newAnnotation));

    state.data.annotation_sets[activeAnnotationSet].annotations = addAnnotation(
      annotations,
      newAnnotation
    );
    state.data.annotation_sets[activeAnnotationSet].next_annid = next_annid + 1;

    // Add the mention to the cluster
    matchingCluster.mentions.push({
      id: next_annid,
      mention: text,
    });

    console.log(
      `Updated annotations count: ${state.data.annotation_sets[activeAnnotationSet].annotations.length}`
    );
    console.log(
      `Updated cluster "${matchingCluster.title}" mentions count: ${matchingCluster.mentions.length}`
    );

    if (typeFilter.indexOf(type) === -1) {
      typeFilter.push(type);
      console.log(`Added type "${type}" to type filter`);
    }
  },
  editAnnotation: (state, payload) => {
    const { views, selectedEntity } = state.ui;
    if (!selectedEntity) {
      return state;
    }

    const { annotationId, types, topCandidate, additional_candidates } =
      payload;
    const { viewIndex } = selectedEntity;

    const { activeAnnotationSet } = views[viewIndex];
    const { annotations } = state.data.annotation_sets[activeAnnotationSet];
    const newAnnotations = annotations.map((ann) => {
      if (ann.id === annotationId) {
        return {
          ...ann,
          type: types[0],
          features: {
            ...ann.features,
            types: types.slice(1),
            ...topCandidate,
            is_nil: false,
            ...(additional_candidates !== undefined && {
              additional_candidates,
            }),
            // linking: {
            //   ...ann.features.linking,
            //   ...(!!topCandidate && {
            //     top_candidate: topCandidate
            //   })
            // }
          },
        } as Annotation<AdditionalAnnotationProps>;
      }
      return ann;
    });
    state.data.annotation_sets[activeAnnotationSet].annotations =
      newAnnotations;
    state.ui.views[viewIndex].typeFilter = getTypeFilter(newAnnotations);
  },
  deleteAnnotation: (state, payload) => {
    const { views } = state.ui;
    const { viewIndex, id } = payload;
    const { activeAnnotationSet } = views[viewIndex];
    const { annotations } = state.data.annotation_sets[activeAnnotationSet];

    // delete annotation
    const indexToDelete = annotations.findIndex((ann) => ann.id === id);

    if (indexToDelete !== -1) {
      const annToDelete = annotations[indexToDelete];
      console.log(
        'deleting annotation',
        JSON.parse(JSON.stringify(annToDelete))
      );
      const newAnnotations = [
        ...annotations.slice(0, indexToDelete),
        ...annotations.slice(indexToDelete + 1, annotations.length),
      ];
      state.data.annotation_sets[activeAnnotationSet].annotations =
        newAnnotations;
      state.ui.views[viewIndex].typeFilter = getTypeFilter(newAnnotations);

      if (
        state.data.features.clusters &&
        state.data.features.clusters[activeAnnotationSet]
      ) {
        const newClusters = state.data.features.clusters[
          activeAnnotationSet
        ].map((cluster) => {
          if (cluster.id === annToDelete.features.cluster) {
            console.log('🗑️ Found cluster to update:', cluster);
            const updatedCluster = {
              ...cluster,
              mentions: cluster.mentions.filter(
                (mention) => mention.id !== annToDelete.id
              ),
            };
            console.log('🗑️ Updated cluster:', updatedCluster);
            return updatedCluster;
          }
          return cluster;
        });

        const filteredClusters = newClusters.filter(
          (cluster) => cluster.mentions.length > 0
        );

        console.log('🗑️ Final clusters after filtering:', filteredClusters);
        state.data.features.clusters[activeAnnotationSet] = filteredClusters;
      }
    } else {
      console.log('🗑️ Annotation not found in annotations array');
    }
  },
  addTaxonomyType: (state, payload) => {
    const { type } = payload;
    const { key, label, parent, ...rest } = type;

    const newType = {
      key,
      label,
      ...(!parent && { ...rest }),
      recognizable: false,
      parent: parent || null,
    } as FlatTreeNode;

    state.taxonomy[key] = newType;
  },
  deleteTaxonomyType: (state, payload) => {
    const { taxonomy } = state;
    const { key } = payload;

    const types = getNodeAndChildren(taxonomy, key, (node) => node.key);

    Object.values(state.data.annotation_sets).forEach((annSet) => {
      if (annSet.name.startsWith('entities')) {
        annSet.annotations = annSet.annotations.filter(
          (ann) => types.indexOf(ann.type) === -1
        );
      }
    });

    state.ui.views.forEach((view) => {
      const indexToRemove = view.typeFilter.indexOf(key);
      if (indexToRemove !== -1) {
        view.typeFilter.splice(indexToRemove, 1);
      }
    });
    state.ui.selectedEntity = null;
    state.taxonomy = removeProps(taxonomy, types);
  },
  changeAnnotationSet: (state, payload) => {
    const { annotationSet, viewIndex } = payload;
    if (annotationSet in state.data.annotation_sets) {
      const { annotations } = state.data.annotation_sets[annotationSet];
      state.ui.views[viewIndex].typeFilter = getTypeFilter(annotations);
      state.ui.views[viewIndex].activeAnnotationSet = annotationSet;
    }
  },
  setView: (state, payload) => {
    const { viewIndex, view } = payload;
    state.ui.views[viewIndex] = {
      ...state.ui.views[viewIndex],
      ...view,
    };
  },
  addView: (state) => {
    state.ui.views = [...state.ui.views, state.ui.views[0]];
  },
  removeView: (state) => {
    state.ui.views.splice(1, 1);
  },
  setUI: (state, payload) => {
    state.ui = {
      ...state.ui,
      ...payload,
    };
  },
});
