import mongoose from "mongoose";

/**
 * Collection model
 * - stored in the 'collections' collection
 * - fields: id (string), name, ownerId (string), allowedUserIds (array of strings)
 */
const FacetsCacheSchema = new mongoose.Schema(
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
  },
);

export const FacetsCache = mongoose.model(
  "FacetsCache",
  FacetsCacheSchema,
  "facetscaches",
);
