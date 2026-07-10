// Ported from backend/documents/src/controllers/collection.js
import crypto from 'crypto';
import { CollectionModel } from '../db/models/Collection';
import { DocumentModel } from '../db/models/Document';
import { UserModel } from '../db/models/User';
import { FacetsCacheModel } from '../db/models/FacetsCache';
import { FacetEntryModel } from '../db/models/FacetEntry';
import { DocumentController } from './documentController';
import { dbConnect } from '../db/connection';

export const CollectionController = {
  async deleteCacheForDoc(docId: string, collectionId: string) {
    await dbConnect();
    // Remove references to the document from all FacetEntry documents
    // Pull the doc id from doc_ids arrays
    await FacetEntryModel.updateMany({ collectionId }, { $pull: { doc_ids: docId } } as any);
    // Pull any synthetic ids_ER that are prefixed with the doc id (unlinked ids)
    try {
      const re = new RegExp(`^${docId}_`);
      await FacetEntryModel.updateMany(
        { collectionId, ids_ER: { $regex: re } } as any,
        { $pull: { ids_ER: re } } as any
      );
    } catch (e) {
      // best-effort; continue
    }

    // Cleanup any entries now empty (no doc_ids and no ids_ER)
    try {
      await FacetEntryModel.deleteMany({
        collectionId,
        $and: [
          { $or: [{ doc_ids: { $exists: false } }, { doc_ids: { $size: 0 } }] },
          { $or: [{ ids_ER: { $exists: false } }, { ids_ER: { $size: 0 } }] },
        ],
      } as any);
    } catch (e) {
      // ignore cleanup errors
    }
  },

  async updateCache(updateCachePayload: any, collectionId: string, initialize = false) {
    await dbConnect();
    if (typeof updateCachePayload !== 'object') {
      throw new Error('Cache payload must be a dictionary');
    }
    const payload = updateCachePayload || {};
    // If initialize is requested, wipe existing per-facet entries for collection
    if (initialize && payload.toAdd) {
      await FacetEntryModel.deleteMany({ collectionId });
    }

    const bulkOps: any[] = [];

    // Handle deletions: remove matching display names / ids
    if (payload.toDelete) {
      for (const [facetType, itemsToDelete] of Object.entries<any>(payload.toDelete)) {
        if (!Array.isArray(itemsToDelete))
          throw new Error(`toDelete for "${facetType}" must be an array`);
        for (const it of itemsToDelete) {
          const display = it.displayName || it.display_name || '';
          const id = it.id || it.id_ER || null;
          const filter = {
            collectionId,
            facetType,
            displayNameLower: String(display || '').toLowerCase(),
          };
          // pull doc_ids and ids_ER matching the provided id/display
          const pull: Record<string, any> = {};
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
      for (const [facetType, itemsToAdd] of Object.entries<any>(payload.toAdd)) {
        if (!Array.isArray(itemsToAdd))
          throw new Error(`toAdd for "${facetType}" must be an array`);
        for (const it of itemsToAdd) {
          if (!it || typeof it !== 'object') continue;
          const display = it.displayName || it.display_name || '';
          const displayNameLower = String(display).toLowerCase();
          const idsER = it.id_ER ? (Array.isArray(it.id_ER) ? it.id_ER : [it.id_ER]) : [];
          const docIds = it.doc_id ? (Array.isArray(it.doc_id) ? it.doc_id : [it.doc_id]) : [];
          const filter = { collectionId, facetType, displayNameLower };
          const update: any = {
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
        await FacetEntryModel.bulkWrite(bulkOps, { ordered: false });
        // Cleanup any entries that became empty (no doc_ids and no ids_ER)
        try {
          const delRes = await FacetEntryModel.deleteMany({
            collectionId,
            $and: [
              { $or: [{ doc_ids: { $exists: false } }, { doc_ids: { $size: 0 } }] },
              { $or: [{ ids_ER: { $exists: false } }, { ids_ER: { $size: 0 } }] },
            ],
          } as any);
          if (delRes && delRes.deletedCount) {
            console.log(
              `[updateCache] cleaned up ${delRes.deletedCount} empty facet entries for collection ${collectionId}`
            );
          }
        } catch (e) {
          console.error('[updateCache] error cleaning up empty facet entries', e);
        }
      } catch (e) {
        console.error('Error bulk writing facet entries', e);
        throw e;
      }
    }
  },

  /**
   * Get all documents main info, like title and preview, to be displayed in the single collection page on the frontend
   */
  async getCollectionDocumentInfo(collectionId: string) {
    await dbConnect();
    if (!collectionId) {
      throw new Error('Collection id is required');
    }
    return DocumentModel.find({ collectionId }).select('id name preview').lean();
  },

  /** Create a new collection */
  async create({
    name,
    ownerId,
    allowedUserIds = [],
    config = {},
  }: {
    name: string;
    ownerId: string;
    allowedUserIds?: string[];
    config?: Record<string, any>;
  }) {
    await dbConnect();
    const collection = new CollectionModel({
      id: crypto.randomUUID(),
      name,
      ownerId,
      allowedUserIds,
      config,
    });
    await collection.save();
    return collection;
  },

  /** Get all collections accessible by a user (owned or allowed) */
  async findByUserId(userId: string) {
    await dbConnect();
    const collections = await CollectionModel.find({
      $or: [{ ownerId: userId }, { allowedUserIds: userId }],
    }).sort({ createdAt: -1 });

    // attach collectionTypes (unique facet types) to each collection
    const results = [];
    for (const coll of collections) {
      let collObj: any;
      try {
        const types = await FacetEntryModel.distinct('facetType', {
          collectionId: coll.id,
        });
        collObj = (coll as any).toObject ? (coll as any).toObject() : coll;
        collObj.collectionTypes = Array.isArray(types) ? types : [];
      } catch (e) {
        collObj = (coll as any).toObject ? (coll as any).toObject() : coll;
        collObj.collectionTypes = [];
      }
      results.push(collObj);
    }
    return results;
  },

  /** Get collection by ID */
  async findById(collectionId: string) {
    await dbConnect();
    const collection = await CollectionModel.findOne({ id: collectionId });
    if (!collection) return collection;
    try {
      const types = await FacetEntryModel.distinct('facetType', { collectionId });
      const collObj: any = (collection as any).toObject
        ? (collection as any).toObject()
        : collection;
      collObj.collectionTypes = Array.isArray(types) ? types : [];
      return collObj;
    } catch (e) {
      const collObj: any = (collection as any).toObject
        ? (collection as any).toObject()
        : collection;
      collObj.collectionTypes = [];
      return collObj;
    }
  },

  /** Update a collection */
  async update(
    collectionId: string,
    userId: string,
    {
      name,
      allowedUserIds,
      config,
    }: { name?: string; allowedUserIds?: string[]; config?: Record<string, any> }
  ) {
    await dbConnect();
    const collection = await CollectionModel.findOne({ id: collectionId });

    if (!collection) {
      throw new Error('Collection not found');
    }

    // Only owner can update
    if (collection.ownerId !== userId) {
      throw new Error('Only the owner can update this collection');
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

  /** Delete a collection */
  async delete(collectionId: string, userId: string, elasticIndex: string) {
    await dbConnect();
    const collection = await CollectionModel.findOne({ id: collectionId });

    if (!collection) {
      throw new Error('Collection not found');
    }

    // Only owner can delete
    if (collection.ownerId !== userId) {
      throw new Error('Only the owner can delete this collection');
    }
    // delete all docs referenced to the collection
    await DocumentController.deleteDocumentsByCollectionId(collectionId, userId, elasticIndex);
    await CollectionModel.deleteOne({ id: collectionId });
    // delete collection facets cache
    try {
      await FacetsCacheModel.deleteOne({ collectionId });
    } catch (error) {
      console.error(`Error deleting old single-doc cache for collection ${collectionId}`);
    }
    try {
      await FacetEntryModel.deleteMany({ collectionId });
    } catch (error) {
      console.error(`Error deleting facet entries for collection ${collectionId}`);
    }
    return collection;
  },

  /** Check if user has access to collection */
  async hasAccess(collectionId: string, userId: string) {
    await dbConnect();
    const collection = await CollectionModel.findOne({
      id: collectionId,
      $or: [{ ownerId: userId }, { allowedUserIds: userId }],
    });
    return !!collection;
  },

  /** Get all users (for selection dropdown) */
  async getAllUsers() {
    await dbConnect();
    return UserModel.find({}, { userId: 1, email: 1, name: 1 }).lean();
  },

  /**
   * Async generator that streams full documents one-by-one. This avoids
   * loading all IDs or full documents into memory for very large collections.
   *
   * Usage:
   *   for await (const doc of CollectionController.streamAllDocuments(id)) { ... }
   */
  async *streamAllDocuments(collectionId: string): AsyncGenerator<any> {
    await dbConnect();
    if (!collectionId) {
      throw new Error('Collection id is required');
    }

    // Use a mongoose cursor to stream document identifiers to keep memory usage low.
    const cursor = DocumentModel.find({ collectionId }).lean().cursor();

    try {
      for await (const docMeta of cursor) {
        // For each document metadata entry, fetch the full document payload.
        const fullDoc = await DocumentController.getFullDocById((docMeta as any).id);
        yield fullDoc;
      }
    } finally {
      // Ensure cursor is closed if the consumer stops early
      try {
        if (typeof cursor.close === 'function') await cursor.close();
      } catch (e) {
        // best-effort; don't rethrow
      }
    }
  },

  /**
   * Collect all documents using the streaming generator above. This preserves
   * the original API while benefiting from low-memory streaming internally.
   */
  async getAllDocuments(collectionId: string) {
    if (!collectionId) {
      throw new Error('Collection id is required');
    }

    const results = [];
    for await (const doc of CollectionController.streamAllDocuments(collectionId)) {
      results.push(doc);
    }
    return results;
  },

  async getAllDocumentsEfficient(collectionId: string) {
    if (!collectionId) {
      throw new Error('Collection id is required');
    }
    return CollectionController.streamAllDocuments(collectionId);
  },

  /**
   * Same as streamAllDocuments but fetches BATCH_SIZE documents concurrently,
   * replacing the sequential one-at-a-time DB round trips with parallel fetches.
   * Yields each document in order as batches complete.
   */
  async *streamAllDocumentsConcurrent(
    collectionId: string,
    batchSize = 10
  ): AsyncGenerator<any> {
    await dbConnect();
    if (!collectionId) {
      throw new Error('Collection id is required');
    }
    const docInfos = await DocumentModel.find({ collectionId }).select('id').lean();
    for (let i = 0; i < docInfos.length; i += batchSize) {
      const batch = docInfos.slice(i, i + batchSize);
      const docs = await Promise.all(
        batch.map((d: any) => DocumentController.getFullDocById(d.id))
      );
      for (const doc of docs) yield doc;
    }
  },
};
