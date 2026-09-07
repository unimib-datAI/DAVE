// Taxonomy specialization payload shapes. Moved out of
// server/routers/taxonomy.ts.

/**
 * A taxonomy specialization candidate (zero-shot / few-shot output).
 *
 * Renamed from `Candidate` during the type extraction — `document.ts` had an
 * unrelated entity-linking type by the same name (now `LinkingCandidate`).
 */
export type SpecializationCandidate = {
  mention: string;
  mention_type: string;
  text: string;
  offset_doc_start: number;
  offset_doc_end: number;
  offset_ex_start: number;
  offset_ex_end: number;
  doc_id: number;
  id: number;
  predict_proba?: number;
  type_pred?: string;
};
