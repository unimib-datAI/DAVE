import { Collection } from "../models/collection";
import { Document } from "../models/document";
import { User } from "../models/user";
import crypto from "crypto";
import { DocumentController } from "./document";
import { type } from "os";
import { FacetsCache } from "../models/facetsCache";
import { FacetEntry } from "../models/facetEntry";
const deepEqual = (a, b) => {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;
  }
};
export const CollectionController = {
  async deleteCacheForDoc(docId, collectionId) {
    // Remove references to the document from all FacetEntry documents
    // Pull the doc id from doc_ids arrays
    await FacetEntry.updateMany(
      { collectionId },
      { $pull: { doc_ids: docId } },
    );
    // Pull any synthetic ids_ER that are prefixed with the doc id (unlinked ids)
    try {
      const re = new RegExp(`^${docId}_`);
      await FacetEntry.updateMany(
        { collectionId, ids_ER: { $regex: re } },
        { $pull: { ids_ER: re } },
      );
    } catch (e) {
      // best-effort; continue
    }

    // Cleanup any entries now empty (no doc_ids and no ids_ER)
    try {
      await FacetEntry.deleteMany({
        collectionId,
        $and: [
          { $or: [{ doc_ids: { $exists: false } }, { doc_ids: { $size: 0 } }] },
          { $or: [{ ids_ER: { $exists: false } }, { ids_ER: { $size: 0 } }] },
        ],
      });
    } catch (e) {
      // ignore cleanup errors
    }
  },
  async updateCache(updateCachePayload, collectionId, initialize = false) {
    if (typeof updateCachePayload !== "object") {
      throw new Error("Cache payload must be a dictionary");
    }
    const payload = updateCachePayload || {};
    // If initialize is requested, wipe existing per-facet entries for collection
    if (initialize && payload.toAdd) {
      await FacetEntry.deleteMany({ collectionId });
    }

    const bulkOps = [];

    // Handle deletions: remove matching display names / ids
    if (payload.toDelete) {
      for (const [facetType, itemsToDelete] of Object.entries(
        payload.toDelete,
      )) {
        if (!Array.isArray(itemsToDelete))
          throw new Error(`toDelete for "${facetType}" must be an array`);
        for (const it of itemsToDelete) {
          const display = it.displayName || it.display_name || "";
          const id = it.id || it.id_ER || null;
          const filter = {
            collectionId,
            facetType,
            displayNameLower: String(display || "").toLowerCase(),
          };
          // pull doc_ids and ids_ER matching the provided id/display
          const pull = {};
          if (it.doc_id) pull.doc_ids = it.doc_id;
          if (id) pull.ids_ER = id;
          if (Object.keys(pull).length > 0) {
            bulkOps.push({
              updateOne: {
                filter,
                update: { $pull: pull },
              },
            });
          }
        }
      }
    }

    // Handle additions: upsert entries and add doc_ids / ids_ER
    if (payload.toAdd) {
      for (const [facetType, itemsToAdd] of Object.entries(payload.toAdd)) {
        if (!Array.isArray(itemsToAdd))
          throw new Error(`toAdd for "${facetType}" must be an array`);
        for (const it of itemsToAdd) {
          if (!it || typeof it !== "object") continue;
          const display = it.displayName || it.display_name || "";
          const displayNameLower = String(display).toLowerCase();
          const idsER = it.id_ER
            ? Array.isArray(it.id_ER)
              ? it.id_ER
              : [it.id_ER]
            : [];
          const docIds = it.doc_id
            ? Array.isArray(it.doc_id)
              ? it.doc_id
              : [it.doc_id]
            : [];
          const filter = { collectionId, facetType, displayNameLower };
          const update = {
            $setOnInsert: {
              collectionId,
              facetType,
              displayNameLower,
              display_name: it.display_name || it.displayName || display,
              is_linked: !!it.is_linked,
              metadata: it.metadata || {},
            },
            $addToSet: {},
          };
          if (idsER.length) update.$addToSet.ids_ER = { $each: idsER };
          if (docIds.length) update.$addToSet.doc_ids = { $each: docIds };
          bulkOps.push({
            updateOne: {
              filter,
              update,
              upsert: true,
            },
          });
        }
      }
    }

    if (bulkOps.length > 0) {
      try {
        await FacetEntry.bulkWrite(bulkOps, { ordered: false });
        // Cleanup any entries that became empty (no doc_ids and no ids_ER)
        try {
          const delRes = await FacetEntry.deleteMany({
            collectionId,
            $and: [
              {
                $or: [
                  { doc_ids: { $exists: false } },
                  { doc_ids: { $size: 0 } },
                ],
              },
              {
                $or: [{ ids_ER: { $exists: false } }, { ids_ER: { $size: 0 } }],
              },
            ],
          });
          if (delRes && delRes.deletedCount) {
            console.log(
              `[updateCache] cleaned up ${delRes.deletedCount} empty facet entries for collection ${collectionId}`,
            );
          }
        } catch (e) {
          console.error(
            "[updateCache] error cleaning up empty facet entries",
            e,
          );
        }
      } catch (e) {
        console.error("Error bulk writing facet entries", e);
        throw e;
      }
    }
  },
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
  async create({ name, ownerId, allowedUserIds = [], config = {} }) {
    const collection = new Collection({
      id: crypto.randomUUID(),
      name,
      ownerId,
      allowedUserIds,
      config,
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

    // attach collectionTypes (unique facet types) to each collection
    const results = [];
    for (const coll of collections) {
      let collObj = coll;
      try {
        const types = await FacetEntry.distinct("facetType", {
          collectionId: coll.id,
        });
        // convert to plain object and attach
        collObj = coll.toObject ? coll.toObject() : coll;
        collObj.collectionTypes = Array.isArray(types) ? types : [];
      } catch (e) {
        collObj = coll.toObject ? coll.toObject() : coll;
        collObj.collectionTypes = [];
      }
      results.push(collObj);
    }
    return results;
  },

  /**
   * Get collection by ID
   */
  async findById(collectionId) {
    const collection = await Collection.findOne({ id: collectionId });
    if (!collection) return collection;
    try {
      const types = await FacetEntry.distinct("facetType", {
        collectionId,
      });
      const collObj = collection.toObject ? collection.toObject() : collection;
      collObj.collectionTypes = Array.isArray(types) ? types : [];
      return collObj;
    } catch (e) {
      const collObj = collection.toObject ? collection.toObject() : collection;
      collObj.collectionTypes = [];
      return collObj;
    }
  },

  /**
   * Update a collection
   */
  async update(collectionId, userId, { name, allowedUserIds, config }) {
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
    if (config !== undefined) {
      collection.config = config;
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
    //delete collection facets cache
    try {
      await FacetsCache.deleteOne({ collectionId });
    } catch (error) {
      console.error(
        `Error deleting old single-doc cache for collection ${collectionId}`,
      );
    }
    try {
      await FacetEntry.deleteMany({ collectionId });
    } catch (error) {
      console.error(
        `Error deleting facet entries for collection ${collectionId}`,
      );
    }
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
  async getAllDocumentsEfficient(collectionId) {
    if (!collectionId) {
      throw new Error("Collection id is required");
    }
    return CollectionController.streamAllDocuments(collectionId);
  },
};
