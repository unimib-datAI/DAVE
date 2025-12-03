import mongoose from "mongoose";

/**
 * Collection model
 * - stored in the 'collections' collection
 * - fields: id (string), name, ownerId (string), allowedUserIds (array of strings)
 */
const CollectionSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            required: true,
            unique: true,
        },
        name: {
            type: String,
            required: true,
        },
        ownerId: {
            type: String,
            required: true,
        },
        allowedUserIds: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

export const Collection = mongoose.model(
    "Collection",
    CollectionSchema,
    "collections",
);
