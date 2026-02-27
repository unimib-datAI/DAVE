import mongoose from "mongoose";

const FacetEntrySchema = new mongoose.Schema(
  {
    collectionId: { type: String, required: true, index: true },
    facetType: { type: String, required: true, index: true },
    displayNameLower: { type: String, required: true, index: true },
    display_name: { type: String },
    is_linked: { type: Boolean, default: false },
    ids_ER: { type: [String], default: [] },
    doc_ids: { type: [String], default: [] },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

// Unique compound index to allow safe upserts per collection/facet/display
FacetEntrySchema.index(
  { collectionId: 1, facetType: 1, displayNameLower: 1 },
  { unique: true },
);

export const FacetEntry = mongoose.model(
  "FacetEntry",
  FacetEntrySchema,
  "facetentries",
);
