import { atomWithStorage } from 'jotai/utils';

/**
 * Selected service stored in the pipeline configuration.
 * - `id`: database id of the service (string, e.g. Mongo ObjectId)
 * - `name`: service name (human readable / unique identifier like 'NER', 'NEL', etc)
 * - `uri`: endpoint URI to call the service
 */
export type SelectedService = {
  id: string;
  name: string;
  uri: string;
  serviceType?: string;
};

/**
 * Top-level annotation configuration mapping.
 * Keys are pipeline slots/service types (e.g. 'NER', 'NEL', 'CLUSTERING', 'CONSOLIDATION', ...)
 * Values are either a `SelectedService` or null if not selected.
 */
export type AnnotationSelectedServices = Record<string, SelectedService | null>;

/**
 * Default mapping for pipeline slots. Initially no service is selected for each slot.
 * Extend the keys below if you want other default slots to appear in the UI.
 */
export const defaultSelectedServices: AnnotationSelectedServices = {
  NER: null,
  NEL: null,
  INDEXER: null,
  NILPREDICTION: null,
  CLUSTERING: null,
  CONSOLIDATION: null,
};

/**
 * Persistent atom that stores the selected service mapping in localStorage.
 * Key: 'annotation-selected-services'
 *
 * The atom contains a mapping from pipeline slot name -> selected service (id,name,uri)
 * Consumers should write the selected service's id/name/uri into the atom when a user
 * picks a service for a slot. Storing the id allows resolving the service entry against
 * the list of available services fetched from the documents endpoint.
 */
export const annotationSelectedServicesAtom =
  atomWithStorage<AnnotationSelectedServices>(
    'annotation-selected-services',
    defaultSelectedServices
  );
