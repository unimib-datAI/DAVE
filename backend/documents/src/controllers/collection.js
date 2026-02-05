import { Collection } from "../models/collection";
import { Document } from "../models/document";
import { User } from "../models/user";
import crypto from "crypto";
import { DocumentController } from "./document";

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
  async delete(collectionId, userId, elasticIndex) {
    const collection = await Collection.findOne({ id: collectionId });

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Only owner can delete
    if (collection.ownerId !== userId) {
      throw new Error("Only the owner can delete this collection");
    }
    //delete all docs referenced to the collection
    await DocumentController.deleteDocumentsByCollectionId(
      collectionId,
      userId,
      elasticIndex,
    );
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
  /**
   *
   * @param {String} collectionId
   *
   * Async generator that streams full documents one-by-one. This avoids
   * loading all IDs or full documents into memory for very large collections.
   *
   * Usage:
   *   for await (const doc of CollectionController.streamAllDocuments(id)) { ... }
   */
  async *streamAllDocuments(collectionId) {
    if (!collectionId) {
      throw new Error("Collection id is required");
    }

    // Use a mongoose cursor to stream document identifiers to keep memory usage low.
    // Document.find(...).lean().cursor() returns an async iterator.
    const cursor = Document.find({ collectionId }).lean().cursor();

    try {
      for await (const docMeta of cursor) {
        // For each document metadata entry, fetch the full document payload.
        // getFullDocById may fetch related annotation sets and perform processing.
        // Yield the full document to the caller.
        const fullDoc = await DocumentController.getFullDocById(docMeta.id);
        yield fullDoc;
      }
    } finally {
      // Ensure cursor is closed if the consumer stops early
      try {
        if (typeof cursor.close === "function") await cursor.close();
      } catch (e) {
        // best-effort; don't rethrow
      }
    }
  },

  /**
   *
   * @param {String} collectionId
   *
   * Collect all documents using the streaming generator above. This preserves
   * the original API while benefiting from low-memory streaming internally.
   */
  async getAllDocuments(collectionId) {
    if (!collectionId) {
      throw new Error("Collection id is required");
    }

    const results = [];
    for await (const doc of CollectionController.streamAllDocuments(
      collectionId,
    )) {
      results.push(doc);
    }
    return results;
  },
};
