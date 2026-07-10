import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requirePermission, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { CollectionController } from '@/lib/documentsBackend/collectionController';
import { DocumentController } from '@/lib/documentsBackend/documentController';
import { FacetEntryModel } from '@/lib/db/models/FacetEntry';
import { dbConnect } from '@/lib/db/connection';

export type collectionDocInfo = {
  name: string;
  preview?: string;
  id: string;
};
export type Collection = {
  id: string;
  name: string;
  ownerId: string;
  allowedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type User = {
  userId: string;
  email: string;
  name?: string;
};

/**
 * Maps errors thrown by CollectionController.update/delete (plain Error
 * objects with no status code - see collectionController.ts) onto TRPC error
 * codes, mirroring the old backend's requirePermission (403) / 404 semantics.
 */
function toCollectionTRPCError(error: any, fallbackMessage: string): TRPCError {
  if (error instanceof PermissionDeniedError) {
    return new TRPCError({ code: 'FORBIDDEN', message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    return new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (/only the owner/i.test(message)) {
    return new TRPCError({ code: 'FORBIDDEN', message });
  }
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: message || fallbackMessage,
  });
}

/**
 * Faithful port of the identical "build facets cache if empty" block
 * duplicated across the old backend's /facetsCache/:id and
 * /facetsCachePaginated/:id routes: lazily (re)builds FacetEntry rows for a
 * collection by walking every document's `entities_` annotations, the first
 * time anyone asks for its facets.
 */
async function buildFacetsCacheIfEmpty(collectionId: string) {
  await dbConnect();
  let entries = await FacetEntryModel.find({ collectionId }).lean();
  if (entries && entries.length > 0) return entries;

  const docInfos = await CollectionController.getCollectionDocumentInfo(collectionId);
  for (const docInfo of docInfos || []) {
    try {
      const fullDocument: any = await DocumentController.getFullDocById(String((docInfo as any).id));
      const perDocPayload: Record<string, any[]> = {};
      const entityList = fullDocument.annotation_sets?.['entities_']?.annotations || [];
      for (const entity of entityList) {
        const mention = fullDocument.text.substring(entity.start, entity.end);
        const annObject: Record<string, any> = {
          mention,
          start: entity['start'],
          end: entity['end'],
          id: entity['id'],
          type: entity['type'],
          doc_id: fullDocument.id,
        };
        const linking = entity.features?.linking;
        if (linking && linking.is_nil === false) {
          annObject['display_name'] = entity.features?.title || mention;
          annObject['is_linked'] = true;
          annObject['id_ER'] = linking?.top_candidate?.url || '';
        } else {
          annObject['display_name'] = entity.originalKey || mention;
          annObject['is_linked'] = false;
          annObject['id_ER'] = `${fullDocument.id}_${mention}`;
        }
        if (entity['type'] in perDocPayload) {
          perDocPayload[entity['type']].push(annObject);
        } else {
          perDocPayload[entity['type']] = [annObject];
        }
      }
      if (Object.keys(perDocPayload).length > 0) {
        try {
          await CollectionController.updateCache({ toAdd: perDocPayload }, collectionId);
        } catch (updErr) {
          console.warn(`Warning: failed to update facets cache for document ${fullDocument.id}`, updErr);
        }
      }
    } catch (outerErr) {
      console.warn(`Error fetching/processing document ${(docInfo as any)?.id} for cache`, outerErr);
    }
  }

  entries = await FacetEntryModel.find({ collectionId }).lean();
  if (!entries || entries.length === 0) {
    throw new Error('Failed to build facets cache');
  }
  return entries;
}

export const collections = createRouter()
  // Get all collections accessible by the current user
  .query('getAll', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied and auth is enabled, avoid hitting the DB and
      // return an empty collection list early (defensive: avoids a noisy
      // error on initial page load before the client has a token yet).
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return [] as Collection[];
      }

      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');
        return (await CollectionController.findByUserId(user.sub)) as any;
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to fetch collections');
      }
    },
  })

  // Get a specific collection by ID
  .query('getById', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');

        const collection = await CollectionController.findById(id);
        if (!collection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
        }
        const hasAccess = await CollectionController.hasAccess(id, user.sub);
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        return collection as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch collection');
      }
    },
  })
  .query('getCollectionInfo', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');

        const collection = await CollectionController.findById(id);
        if (!collection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
        }
        const hasAccess = await CollectionController.hasAccess(id, user.sub);
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }
        return (await CollectionController.getCollectionDocumentInfo(id)) as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch collection info');
      }
    },
  })
  // Get facets cache for a collection (aggregated, grouped by facet type)
  .query('facetsCache', {
    input: z.object({ id: z.string(), token: z.string().optional() }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');

        const collection = await CollectionController.findById(id);
        if (!collection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
        }
        const hasAccess = await CollectionController.hasAccess(id, user.sub);
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await buildFacetsCacheIfEmpty(id);

        const pipeline: any[] = [
          { $match: { collectionId: id } },
          {
            $addFields: {
              doc_count: { $size: { $ifNull: ['$doc_ids', []] } },
              ids_ER: { $ifNull: ['$ids_ER', []] },
            },
          },
          {
            $project: {
              facetType: 1,
              display_name: 1,
              is_linked: 1,
              ids_ER: 1,
              doc_count: 1,
              doc_ids: 1,
            },
          },
          { $sort: { facetType: 1, doc_count: -1 } },
          {
            $group: {
              _id: '$facetType',
              children: {
                $push: {
                  key: {
                    $cond: [
                      { $gt: [{ $size: { $ifNull: ['$ids_ER', []] } }, 0] },
                      { $arrayElemAt: ['$ids_ER', 0] },
                      '$display_name',
                    ],
                  },
                  display_name: '$display_name',
                  is_linked: '$is_linked',
                  ids_ER: '$ids_ER',
                  doc_count: '$doc_count',
                  doc_ids: '$doc_ids',
                },
              },
              doc_count: { $sum: '$doc_count' },
            },
          },
          { $project: { key: '$_id', doc_count: 1, children: 1, _id: 0 } },
          { $sort: { key: 1 } },
        ];

        return (await FacetEntryModel.aggregate(pipeline).allowDiskUse(false).exec()) as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch facets cache');
      }
    },
  })
  // Get paginated facets cache for a collection
  .query('facetsCachePaginated', {
    input: z.object({
      id: z.string(),
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      const page = Math.max(input.page, 1);
      const limit = Math.min(Math.max(input.limit, 1), 100);
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');

        const collection = await CollectionController.findById(id);
        if (!collection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
        }
        const hasAccess = await CollectionController.hasAccess(id, user.sub);
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        await buildFacetsCacheIfEmpty(id);

        const skip = (page - 1) * limit;
        const basePipeline: any[] = [
          { $match: { collectionId: id } },
          {
            $addFields: {
              doc_count: { $size: { $ifNull: ['$doc_ids', []] } },
              ids_ER: { $ifNull: ['$ids_ER', []] },
            },
          },
          {
            $project: {
              facetType: 1,
              display_name: 1,
              is_linked: 1,
              ids_ER: 1,
              doc_count: 1,
              doc_ids: 1,
            },
          },
          { $sort: { facetType: 1, doc_count: -1 } },
          {
            $group: {
              _id: '$facetType',
              children: {
                $push: {
                  key: {
                    $cond: [
                      { $gt: [{ $size: { $ifNull: ['$ids_ER', []] } }, 0] },
                      { $arrayElemAt: ['$ids_ER', 0] },
                      '$display_name',
                    ],
                  },
                  display_name: '$display_name',
                  is_linked: '$is_linked',
                  ids_ER: '$ids_ER',
                  doc_count: '$doc_count',
                  doc_ids: '$doc_ids',
                },
              },
              doc_count: { $sum: '$doc_count' },
            },
          },
          { $project: { key: '$_id', doc_count: 1, children: 1, _id: 0 } },
          { $sort: { key: 1 } },
        ];

        const totalResult = await FacetEntryModel.aggregate([
          ...basePipeline,
          { $count: 'total' },
        ])
          .allowDiskUse(false)
          .exec();
        const total = totalResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);

        const facets = await FacetEntryModel.aggregate([
          ...basePipeline,
          { $skip: skip },
          { $limit: limit },
        ])
          .allowDiskUse(false)
          .exec();

        return { facets, pagination: { page, limit, total, totalPages } } as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch paginated facets');
      }
    },
  })
  // Search facets by display_name within a specific facet type
  .query('facetsCacheSearch', {
    input: z.object({
      id: z.string(),
      key: z.string(), // facet type (e.g., 'PERSON', 'ORGANIZATION')
      query: z.string(), // search string
      page: z.number().optional().default(1),
      limit: z.number().optional().default(20),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, key, token } = input;
      const searchQuery = input.query || '';
      const limit = Math.min(input.limit, 100);
      const page = Math.max(input.page, 1);
      const skip = (page - 1) * limit;

      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'view');

        const collection = await CollectionController.findById(id);
        if (!collection) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
        }
        const hasAccess = await CollectionController.hasAccess(id, user.sub);
        if (!hasAccess) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
        }

        const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = escapeRegex(searchQuery);

        const pipeline: any[] = [
          { $match: { collectionId: id, facetType: key } },
          {
            $addFields: {
              doc_count: { $size: { $ifNull: ['$doc_ids', []] } },
              ids_ER: { $ifNull: ['$ids_ER', []] },
            },
          },
          {
            $project: {
              facetType: 1,
              display_name: 1,
              is_linked: 1,
              ids_ER: 1,
              doc_count: 1,
              doc_ids: 1,
            },
          },
          { $match: { display_name: { $regex: pattern, $options: 'i' } } },
          { $sort: { doc_count: -1, display_name: 1 } },
          {
            $facet: {
              metadata: [{ $count: 'total' }],
              results: [{ $skip: skip }, { $limit: limit }],
            },
          },
        ];

        const result = await FacetEntryModel.aggregate(pipeline).allowDiskUse(false).exec();
        const metadata = result[0]?.metadata[0] || { total: 0 };
        const results = result[0]?.results || [];
        const total = metadata.total;
        const totalPages = Math.ceil(total / limit);

        return {
          facets: results,
          facetType: key,
          query: input.query,
          pagination: { page, limit, total, totalPages },
        };
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to search facets');
      }
    },
  })
  // Create a new collection
  .mutation('create', {
    input: z.object({
      name: z.string().min(1),
      allowedUserIds: z.array(z.string()).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { name, allowedUserIds, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'create');
        return (await CollectionController.create({
          name,
          ownerId: user.sub,
          allowedUserIds: allowedUserIds || [],
        })) as any;
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to create collection');
      }
    },
  })

  // Update a collection
  .mutation('update', {
    input: z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      allowedUserIds: z.array(z.string()).optional(),
      config: z
        .object({
          typesToHide: z.array(z.string()).optional(),
          typesOrder: z.array(z.string()).optional(),
        })
        .optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, name, allowedUserIds, config, token } = input;
      try {
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'update');
        return (await CollectionController.update(id, user.sub, {
          name,
          allowedUserIds,
          config,
        })) as any;
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to update collection');
      }
    },
  })

  // Delete a collection
  .mutation('delete', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const elasticIndex = process.env.ELASTIC_INDEX || '';
        const user = await getRequestUser(token);
        await requirePermission(user, 'collections', 'delete');
        const collection = await CollectionController.delete(id, user.sub, elasticIndex);
        return { message: 'Collection deleted', collection };
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to delete collection');
      }
    },
  })

  // Get all users for sharing
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      // If no token supplied and auth is enabled, do not hit the DB and
      // return an empty users list early (same defensive guard as `getAll`).
      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return [] as User[];
      }

      try {
        // The old backend's GET /collection/users/all had no permission
        // gate at all - preserved as-is here.
        return (await CollectionController.getAllUsers()) as any;
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to fetch users',
        });
      }
    },
  })

  // Download collection as zip (direct stream from /collection/:id/download)
  .query('download', {
    input: z.object({ id: z.string(), token: z.string().optional() }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const authHeader = token ? `Bearer ${token}` : '';
        // Return a proxy URL that streams the backend zip directly to the browser.
        // If we have an auth header, append it as `auth` so the proxy can forward it.
        const proxyPath = `/api/collection/${encodeURIComponent(id)}/download`;
        const url = authHeader
          ? `${proxyPath}?auth=${encodeURIComponent(authHeader)}`
          : proxyPath;
        return { url };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to prepare download',
        });
      }
    },
  });
