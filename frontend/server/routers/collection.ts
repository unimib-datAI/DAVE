import { z } from 'zod';
import { router, authedProcedure, TRPCError } from '../trpc';
import {
  requirePermission,
  PermissionDeniedError,
} from '@/lib/documentsBackend/permission';
import { CollectionController } from '@/lib/documentsBackend/collectionController';
import { DocumentController } from '@/lib/documentsBackend/documentController';
import { FacetEntryModel } from '@/lib/db/models/FacetEntry';
import { dbConnect } from '@/lib/db/connection';
import { serverConfig } from '@/lib/config/server';

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

  const docInfos = await CollectionController.getCollectionDocumentInfo(
    collectionId
  );
  for (const docInfo of docInfos || []) {
    try {
      const fullDocument: any = await DocumentController.getFullDocById(
        String((docInfo as any).id)
      );
      const perDocPayload: Record<string, any[]> = {};
      const entityList =
        fullDocument.annotation_sets?.['entities_']?.annotations || [];
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
          await CollectionController.updateCache(
            { toAdd: perDocPayload },
            collectionId
          );
        } catch (updErr) {
          console.warn(
            `Warning: failed to update facets cache for document ${fullDocument.id}`,
            updErr
          );
        }
      }
    } catch (outerErr) {
      console.warn(
        `Error fetching/processing document ${(docInfo as any)?.id} for cache`,
        outerErr
      );
    }
  }

  entries = await FacetEntryModel.find({ collectionId }).lean();
  if (!entries || entries.length === 0) {
    throw new Error('Failed to build facets cache');
  }
  return entries;
}

/** Shared guard: 404 if the collection is missing, 403 if the caller lacks access. */
async function assertCollectionAccess(id: string, userId: string) {
  const collection = await CollectionController.findById(id);
  if (!collection) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
  }
  const hasAccess = await CollectionController.hasAccess(id, userId);
  if (!hasAccess) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
  }
  return collection;
}

const facetsCachePipeline = (id: string): any[] => [
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

export const collectionsRouter = router({
  // All collections accessible by the current user.
  getAll: authedProcedure.query(async ({ ctx }) => {
    try {
      await requirePermission(ctx.user, 'collections', 'view');
      return (await CollectionController.findByUserId(ctx.user.sub)) as any;
    } catch (error: any) {
      throw toCollectionTRPCError(error, 'Failed to fetch collections');
    }
  }),

  getById: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        await requirePermission(ctx.user, 'collections', 'view');
        return (await assertCollectionAccess(input.id, ctx.user.sub)) as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch collection');
      }
    }),

  getCollectionInfo: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        await requirePermission(ctx.user, 'collections', 'view');
        await assertCollectionAccess(input.id, ctx.user.sub);
        return (await CollectionController.getCollectionDocumentInfo(
          input.id
        )) as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch collection info');
      }
    }),

  // Aggregated facets cache, grouped by facet type.
  facetsCache: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        await requirePermission(ctx.user, 'collections', 'view');
        await assertCollectionAccess(input.id, ctx.user.sub);
        await buildFacetsCacheIfEmpty(input.id);

        return (await FacetEntryModel.aggregate(facetsCachePipeline(input.id))
          .allowDiskUse(false)
          .exec()) as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch facets cache');
      }
    }),

  facetsCachePaginated: authedProcedure
    .input(
      z.object({
        id: z.string(),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const page = Math.max(input.page, 1);
      const limit = Math.min(Math.max(input.limit, 1), 100);
      try {
        await requirePermission(ctx.user, 'collections', 'view');
        await assertCollectionAccess(input.id, ctx.user.sub);
        await buildFacetsCacheIfEmpty(input.id);

        const skip = (page - 1) * limit;
        const basePipeline = facetsCachePipeline(input.id);

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

        return {
          facets,
          pagination: { page, limit, total, totalPages },
        } as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw toCollectionTRPCError(error, 'Failed to fetch paginated facets');
      }
    }),

  // Search facets by display_name within a specific facet type.
  facetsCacheSearch: authedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string(),
        query: z.string(),
        page: z.number().optional().default(1),
        limit: z.number().optional().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const { id, key } = input;
      const searchQuery = input.query || '';
      const limit = Math.min(input.limit, 100);
      const page = Math.max(input.page, 1);
      const skip = (page - 1) * limit;

      try {
        await requirePermission(ctx.user, 'collections', 'view');
        await assertCollectionAccess(id, ctx.user.sub);

        const escapeRegex = (str: string) =>
          str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

        const result = await FacetEntryModel.aggregate(pipeline)
          .allowDiskUse(false)
          .exec();
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
    }),

  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        allowedUserIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await requirePermission(ctx.user, 'collections', 'create');
        return (await CollectionController.create({
          name: input.name,
          ownerId: ctx.user.sub,
          allowedUserIds: input.allowedUserIds || [],
        })) as any;
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to create collection');
      }
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        allowedUserIds: z.array(z.string()).optional(),
        config: z
          .object({
            typesToHide: z.array(z.string()).optional(),
            typesOrder: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, name, allowedUserIds, config } = input;
      try {
        await requirePermission(ctx.user, 'collections', 'update');
        return (await CollectionController.update(id, ctx.user.sub, {
          name,
          allowedUserIds,
          config,
        })) as any;
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to update collection');
      }
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const elasticIndex = serverConfig.elastic.index;
        await requirePermission(ctx.user, 'collections', 'delete');
        const collection = await CollectionController.delete(
          input.id,
          ctx.user.sub,
          elasticIndex
        );
        return { message: 'Collection deleted', collection };
      } catch (error: any) {
        throw toCollectionTRPCError(error, 'Failed to delete collection');
      }
    }),

  // All users (for the sharing dropdown). No permission gate in the old
  // backend either — preserved.
  getAllUsers: authedProcedure.query(async () => {
    try {
      return (await CollectionController.getAllUsers()) as any;
    } catch (error: any) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to fetch users',
      });
    }
  }),

  // Proxy URL that streams the collection zip. The download route authenticates
  // via the NextAuth server session, so no token needs to travel in the URL.
  download: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return {
        url: `/api/collection/${encodeURIComponent(input.id)}/download`,
      };
    }),
});
