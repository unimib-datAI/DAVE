import { Collection } from "../models/collection";
import { Document } from "../models/document";
import { User } from "../models/user";
import crypto from "crypto";

export const CollectionController = {
  /**
   * Get all documents main info, like title and preview, to be displayed in the single collection page on the frontend
   * @param {string} collectionId
   */
  async getCollectionDocumentInfo(collectionId) {
    if (!collectionId) {
      throw new Error("Collection id is required");
    }
    let docsInCollection = await Document.find({ collectionId })
      .select("id name preview")
      .lean();
    return docsInCollection;
  },
  /**
   * Create a new collection
   */
  async create({ name, ownerId, allowedUserIds = [] }) {
    const collection = new Collection({
      id: crypto.randomUUID(),
      name,
      ownerId,
      allowedUserIds,
    });
    await collection.save();
    return collection;
  },

  /**
   * Get all collections accessible by a user (owned or allowed)
   */
  async findByUserId(userId) {
    const collections = await Collection.find({
      $or: [{ ownerId: userId }, { allowedUserIds: userId }],
    }).sort({ createdAt: -1 });
    return collections;
  },

  /**
   * Get collection by ID
   */
  async findById(collectionId) {
    const collection = await Collection.findOne({ id: collectionId });
    return collection;
  },

  /**
   * Update a collection
   */
  async update(collectionId, userId, { name, allowedUserIds }) {
    const collection = await Collection.findOne({ id: collectionId });

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Only owner can update
    if (collection.ownerId !== userId) {
      throw new Error("Only the owner can update this collection");
    }

    if (name !== undefined) {
      collection.name = name;
    }
    if (allowedUserIds !== undefined) {
      collection.allowedUserIds = allowedUserIds;
    }

    await collection.save();
    return collection;
  },

  /**
   * Delete a collection
   */
  async delete(collectionId, userId) {
    const collection = await Collection.findOne({ id: collectionId });

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Only owner can delete
    if (collection.ownerId !== userId) {
      throw new Error("Only the owner can delete this collection");
    }

    await Collection.deleteOne({ id: collectionId });
    return collection;
  },

  /**
   * Check if user has access to collection
   */
  async hasAccess(collectionId, userId) {
    const collection = await Collection.findOne({
      id: collectionId,
      $or: [{ ownerId: userId }, { allowedUserIds: userId }],
    });
    return !!collection;
  },

  /**
   * Get all users (for selection dropdown)
   */
  async getAllUsers() {
    const users = await User.find({}, { userId: 1, email: 1, name: 1 }).lean();
    return users;
  },
};
