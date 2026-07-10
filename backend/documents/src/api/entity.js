import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { FacetEntry } from "../models/facetEntry.js";
import { CollectionController } from "../controllers/collection.js";
import { DocumentController } from "../controllers/document.js";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import axios from "axios";



const route = Router();
export default (app) => {
  app.use("/entity", route);



  /**

   * GET /:collectionId

   * List entities for a collection with filtering, sorting, and optional pagination.

   * Query params: page, limit, type, is_linked, q (text search), sort (doc_count|display_name)

   */

  route.get(
    "/:collectionId",
    asyncRoute(async (req, res) => {
      const { collectionId } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const collection = await CollectionController.findById(collectionId);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });

      }

      const hasAccess = await CollectionController.hasAccess(collectionId, userId);
      if (!hasAccess) {

        return res.status(403).json({ message: "Access denied" });

      }

      const { page, limit, type, is_linked, q, sort } = req.query;
      const filter = { collectionId };

      if (type) filter.facetType = type;
      if (is_linked !== undefined) filter.is_linked = is_linked === "true";

      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.displayNameLower = { $regex: escaped.toLowerCase() };

      }



      const types = await FacetEntry.distinct("facetType", { collectionId });
      const sortStage =
        sort === "display_name"
          ? { $sort: { display_name: 1 } }

          : { $sort: { doc_count: -1 } };

      const pipeline = [

        { $match: filter },

        {

          $addFields: {

            doc_count: { $size: { $ifNull: ["$doc_ids", []] } },

          },

        },

        sortStage,

      ];



      if (page && limit) {

        const pageNum = Math.max(1, parseInt(page, 10) || 1);

        const limitNum = Math.max(1, parseInt(limit, 10) || 20);

        const total = await FacetEntry.countDocuments(filter);

        const totalPages = Math.ceil(total / limitNum);



        pipeline.push(

          { $skip: (pageNum - 1) * limitNum },

          { $limit: limitNum },

        );



        const data = await FacetEntry.aggregate(pipeline).exec();

        return res.json({

          data,

          pagination: { page: pageNum, total, totalPages },

          types,

        });

      }



      const data = await FacetEntry.aggregate(pipeline).exec();

      return res.json({ data, pagination: null, types });

    }),

  );



  /**

   * GET /:collectionId/:key

   * Get entity details and paginated mentions with context snippets.

   * :key is the URL-encoded ids_ER value (Wikidata URL or synthetic key).

   */

  route.get(

    "/:collectionId/:key",

    asyncRoute(async (req, res) => {

      const { collectionId } = req.params;

      const key = decodeURIComponent(req.params.key);

      const userId = req.user?.sub || req.user?.userId;



      const collection = await CollectionController.findById(collectionId);

      if (!collection) {

        return res.status(404).json({ message: "Collection not found" });

      }

      const hasAccess = await CollectionController.hasAccess(collectionId, userId);

      if (!hasAccess) {

        return res.status(403).json({ message: "Access denied" });

      }



      const entry = await FacetEntry.findOne({

        collectionId,

        ids_ER: key,

      }).lean();

      if (!entry) {

        return res.status(404).json({ message: "Entity not found" });

      }



      const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);

      const limitNum = Math.max(1, parseInt(req.query.limit, 10) || 10);

      const docIds = entry.doc_ids || [];

      const pagedDocIds = docIds.slice((pageNum - 1) * limitNum, pageNum * limitNum);



      const mentions = [];

      for (const docId of pagedDocIds) {

        try {

          const doc = await DocumentController.getFullDocById(

            docId,

            false,

            false,

            false,

            true,

          );

          if (!doc) continue;



          const clusters = doc.features?.clusters?.["entities_"] || [];

          const cluster = clusters.find(

            (c) => c.title === entry.display_name && c.type === entry.facetType,

          );

          if (!cluster || !Array.isArray(cluster.mentions)) continue;



          const annMap = {};

          const anns =

            doc.annotation_sets?.["entities_"]?.annotations || [];

          for (const ann of anns) {

            annMap[ann.id] = ann;

          }



          for (const m of cluster.mentions) {

            const ann = annMap[m.id];

            if (!ann) continue;

            const text = doc.text ? doc.text.slice(ann.start, ann.end) : "";

            const context = doc.text

              ? doc.text.slice(

                  Math.max(0, ann.start - 100),

                  Math.min(doc.text.length, ann.end + 100),

                )

              : "";

            mentions.push({

              doc_id: docId,

              doc_name: doc.name || docId,

              annotation_id: ann.id,

              start: ann.start,

              end: ann.end,

              text,

              context,

            });

          }

        } catch (e) {

          console.warn(`Could not fetch doc ${docId} for entity detail`, e);

        }

      }



      return res.json({

        entity: { ...entry, doc_count: docIds.length },

        mentions,

        pagination: {

          page: pageNum,

          total: docIds.length,

          totalPages: Math.ceil(docIds.length / limitNum),

        },

      });

    }),

  );



  /**

   * PATCH /:collectionId/:key

   * Update display_name, facetType, or ids_ER on a FacetEntry.

   * Also syncs cluster titles/types in affected documents and optionally ES.

   */

  route.patch(

    "/:collectionId/:key",

    validateRequest({

      req: {

        body: z.object({

          display_name: z.string().min(1).optional(),

          facetType: z.string().min(1).optional(),

          ids_ER: z.array(z.string()).optional(),
          metadata: z.record(z.string()).optional(),

          elasticIndex: z.string().optional(),

        }),

      },

    }),

    asyncRoute(async (req, res) => {

      const { collectionId } = req.params;

      const key = decodeURIComponent(req.params.key);

      const userId = req.user?.sub || req.user?.userId;



      const collection = await CollectionController.findById(collectionId);

      if (!collection) {

        return res.status(404).json({ message: "Collection not found" });

      }

      const hasAccess = await CollectionController.hasAccess(collectionId, userId);

      if (!hasAccess) {

        return res.status(403).json({ message: "Access denied" });

      }



      const entry = await FacetEntry.findOne({ collectionId, ids_ER: key });

      if (!entry) {

        return res.status(404).json({ message: "Entity not found" });

      }



      const { display_name, facetType, ids_ER, metadata ,elasticIndex } = req.body;

      const oldDisplayName = entry.display_name;

      const oldFacetType = entry.facetType;



      if (display_name !== undefined) {

        entry.display_name = display_name;

        entry.displayNameLower = display_name.toLowerCase();

      }

      if (facetType !== undefined) entry.facetType = facetType;

      if (ids_ER !== undefined) entry.ids_ER = ids_ER;
      if (metadata !== undefined) entry.metadata = metadata;



      await entry.save();



      const docIds = entry.doc_ids || [];

      const elasticUrl =

        process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";



      for (const docId of docIds) {

        try {

          const doc = await DocumentController.getFullDocById(

            docId,

            false,

            false,

            false,

            true,

          );

          if (!doc) continue;



          const clusters = doc.features?.clusters?.["entities_"] || [];

          const updatedClusters = clusters.map((c) =>

            c.title === oldDisplayName && c.type === oldFacetType

              ? { ...c, title: entry.display_name, type: entry.facetType }

              : c,

          );

          await DocumentController.updateClusters(

            docId,

            "entities_",

            updatedClusters,

          );



          if (elasticIndex) {

            try {

              const updatedDoc = await DocumentController.getFullDocById(

                docId,

                false,

                false,

                false,

                false,

              );

              await axios.post(

                `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}`,

                updatedDoc,

              );

            } catch (esErr) {

              console.warn(`ES sync failed for doc ${docId}`, esErr.message);

            }

          }

        } catch (e) {

          console.warn(`Failed to update clusters for doc ${docId}`, e);

        }

      }



      return res.json(entry);

    }),

  );



  /**

   * POST /:collectionId/merge

   * Merge source entity into target entity.

   * Moves all mentions from source clusters into target clusters across documents.

   */

  route.post(

    "/:collectionId/merge",

    validateRequest({

      req: {

        body: z.object({

          source_key: z.string().min(1),

          target_key: z.string().min(1),

          elasticIndex: z.string().optional(),

        }),

      },

    }),

    asyncRoute(async (req, res) => {

      const { collectionId } = req.params;

      const userId = req.user?.sub || req.user?.userId;



      const collection = await CollectionController.findById(collectionId);

      if (!collection) {

        return res.status(404).json({ message: "Collection not found" });

      }

      const hasAccess = await CollectionController.hasAccess(collectionId, userId);

      if (!hasAccess) {

        return res.status(403).json({ message: "Access denied" });

      }



      const { source_key, target_key, elasticIndex } = req.body;



      const [sourceEntry, targetEntry] = await Promise.all([

        FacetEntry.findOne({ collectionId, ids_ER: source_key }),

        FacetEntry.findOne({ collectionId, ids_ER: target_key }),

      ]);



      if (!sourceEntry) {

        return res.status(404).json({ message: "Source entity not found" });

      }

      if (!targetEntry) {

        return res.status(404).json({ message: "Target entity not found" });

      }



      const mergedDocIds = [

        ...new Set([

          ...(sourceEntry.doc_ids || []),

          ...(targetEntry.doc_ids || []),

        ]),

      ];

      const mergedIdsER = [

        ...new Set([

          ...(sourceEntry.ids_ER || []),

          ...(targetEntry.ids_ER || []),

        ]),

      ];

      targetEntry.doc_ids = mergedDocIds;

      targetEntry.ids_ER = mergedIdsER;

      await targetEntry.save();



      const allDocIds = [

        ...new Set([

          ...(sourceEntry.doc_ids || []),

          ...(targetEntry.doc_ids || []),

        ]),

      ];

      const elasticUrl =

        process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";



      for (const docId of allDocIds) {

        try {

          const doc = await DocumentController.getFullDocById(

            docId,

            false,

            false,

            false,

            true,

          );

          if (!doc) continue;



          const clusters = doc.features?.clusters?.["entities_"] || [];

          const sourceCluster = clusters.find(

            (c) =>

              c.title === sourceEntry.display_name &&

              c.type === sourceEntry.facetType,

          );

          const targetCluster = clusters.find(

            (c) =>

              c.title === targetEntry.display_name &&

              c.type === targetEntry.facetType,

          );



          let updatedClusters;

          if (sourceCluster && targetCluster) {

            const mergedMentions = [

              ...(targetCluster.mentions || []),

              ...(sourceCluster.mentions || []),

            ];

            updatedClusters = clusters

              .filter(

                (c) =>

                  !(

                    c.title === sourceEntry.display_name &&

                    c.type === sourceEntry.facetType

                  ),

              )

              .map((c) =>

                c.title === targetEntry.display_name &&

                c.type === targetEntry.facetType

                  ? { ...c, mentions: mergedMentions }

                  : c,

              );

          } else if (sourceCluster && !targetCluster) {

            updatedClusters = clusters.map((c) =>

              c.title === sourceEntry.display_name &&

              c.type === sourceEntry.facetType

                ? {

                    ...c,

                    title: targetEntry.display_name,

                    type: targetEntry.facetType,

                  }

                : c,

            );

          } else {

            updatedClusters = clusters;

          }



          await DocumentController.updateClusters(

            docId,

            "entities_",

            updatedClusters,

          );



          if (elasticIndex) {

            try {

              const updatedDoc = await DocumentController.getFullDocById(

                docId,

                false,

                false,

                false,

                false,

              );

              await axios.post(

                `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}`,

                updatedDoc,

              );

            } catch (esErr) {

              console.warn(`ES sync failed for doc ${docId}`, esErr.message);

            }

          }

        } catch (e) {

          console.warn(

            `Failed to update clusters for doc ${docId} during merge`,

            e,

          );

        }

      }



      await FacetEntry.deleteOne({ _id: sourceEntry._id });



      return res.json(targetEntry);

    }),

  );



  /**

   * DELETE /:collectionId/:key

   * Delete a FacetEntry, remove its cluster from all affected documents, and optionally sync ES.

   */

  route.delete(

    "/:collectionId/:key",

    asyncRoute(async (req, res) => {

      const { collectionId } = req.params;

      const key = decodeURIComponent(req.params.key);

      const { elasticIndex } = req.body || {};

      const userId = req.user?.sub || req.user?.userId;



      const collection = await CollectionController.findById(collectionId);

      if (!collection) {

        return res.status(404).json({ message: "Collection not found" });

      }

      const hasAccess = await CollectionController.hasAccess(collectionId, userId);

      if (!hasAccess) {

        return res.status(403).json({ message: "Access denied" });

      }



      const entry = await FacetEntry.findOne({ collectionId, ids_ER: key });

      if (!entry) {

        return res.status(404).json({ message: "Entity not found" });

      }



      const docIds = entry.doc_ids || [];

      const elasticUrl =

        process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";



      for (const docId of docIds) {

        try {

          const doc = await DocumentController.getFullDocById(

            docId,

            false,

            false,

            false,

            true,

          );

          if (!doc) continue;



          const clusters = doc.features?.clusters?.["entities_"] || [];

          const updatedClusters = clusters.filter(

            (c) =>

              !(c.title === entry.display_name && c.type === entry.facetType),

          );

          await DocumentController.updateClusters(

            docId,

            "entities_",

            updatedClusters,

          );



          if (elasticIndex) {

            try {

              const updatedDoc = await DocumentController.getFullDocById(

                docId,

                false,

                false,

                false,

                false,

              );

              await axios.post(

                `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}`,

                updatedDoc,

              );

            } catch (esErr) {

              console.warn(`ES sync failed for doc ${docId}`, esErr.message);

            }

          }

        } catch (e) {

          console.warn(

            `Failed to update clusters for doc ${docId} during delete`,

            e,

          );

        }

      }



      await FacetEntry.deleteOne({ _id: entry._id });



      return res.json({ message: "Entity deleted", entity: entry });

    }),

  );

};

