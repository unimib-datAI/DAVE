import mongoose from "mongoose";

const FacetEntrySchema = new mongoose.Schema(
  {
    collectionId: { type: String, required: true, index: true },
    facetType: { type: String, required: true, index: true },
    displayNameLower: { type: String, required: true, index: true },
    display_name: String,
    is_linked: Boolean,
    ids_ER: { type: [String], default: [] },
    doc_ids: { type: [String], default: [] },
    metadata: Object,
  },
  { timestamps: true },
);

// unique compound index to allow upserts
FacetEntrySchema.index(
  { collectionId: 1, facetType: 1, displayNameLower: 1 },
  { unique: true },
);

export const FacetEntry = mongoose.model(
  "FacetEntry",
  FacetEntrySchema,
  "facetEntries",
);
