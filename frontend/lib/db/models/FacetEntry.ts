// Ported from backend/documents/src/models/facetEntry.js
// (Note: there is also an unused duplicate, facetCacheEntry.js, with a
// different collection name ("facetEntries") - this ports the one actually
// imported by the documents backend's controllers/collection.js.)
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFacetEntry extends Document {
  collectionId: string;
  facetType: string;
  displayNameLower: string;
  display_name?: string;
  is_linked?: boolean;
  ids_ER: string[];
  doc_ids: string[];
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const FacetEntrySchema = new Schema<IFacetEntry>(
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
  { timestamps: true }
);

// Unique compound index to allow safe upserts per collection/facet/display
FacetEntrySchema.index(
  { collectionId: 1, facetType: 1, displayNameLower: 1 },
  { unique: true }
);

export const FacetEntryModel: Model<IFacetEntry> =
  mongoose.models.FacetEntry ||
  mongoose.model<IFacetEntry>('FacetEntry', FacetEntrySchema, 'facetentries');
