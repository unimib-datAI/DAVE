// Ported from backend/documents/src/models/facetsCache.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFacetsCache extends Document {
  collectionId: string;
  facets: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

const FacetsCacheSchema = new Schema<IFacetsCache>(
  {
    collectionId: {
      type: String,
      required: true,
    },
    facets: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const FacetsCacheModel: Model<IFacetsCache> =
  mongoose.models.FacetsCache ||
  mongoose.model<IFacetsCache>('FacetsCache', FacetsCacheSchema, 'facetscaches');
