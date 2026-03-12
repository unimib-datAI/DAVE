import { atomWithStorage } from 'jotai/utils';

/**
 * A single step in the annotation pipeline.
 * Steps are executed sequentially; the output of one step is passed as input to the next.
 *
 * - `id`: optional reference to a Service document _id
 * - `name`: human-readable label for this step
 * - `uri`: endpoint URI to POST the current document to
 * - `serviceType`: optional free-form label (used for display/grouping only)
 */
export type PipelineStep = {
  id?: string;
  name: string;
  uri: string;
  serviceType?: string;
};

/**
 * @deprecated Use PipelineStep[] instead.
 * Kept only for type-compatibility with any legacy code that may still import it.
 */
export type SelectedService = {
  id: string;
  name: string;
  uri: string;
  serviceType?: string;
};

/**
 * @deprecated Use PipelineStep[] atom instead.
 */
export type AnnotationSelectedServices = Record<string, SelectedService | null>;

/**
 * Persistent atom that stores the ordered pipeline steps in localStorage.
 * Key: 'annotation-pipeline-steps'
 *
 * The atom holds an array of PipelineStep objects in the order they will be
 * called during annotation. Empty array = no pipeline configured.
 */
export const annotationSelectedServicesAtom = atomWithStorage<PipelineStep[]>(
  'annotation-pipeline-steps',
  []
);

/**
 * @deprecated Use annotationSelectedServicesAtom which now stores PipelineStep[].
 */
export const defaultSelectedServices: AnnotationSelectedServices = {};
