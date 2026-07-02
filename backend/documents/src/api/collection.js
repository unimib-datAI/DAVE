import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { CollectionController } from "../controllers/collection";
import { DocumentController } from "../controllers/document";
import cliProgress from "cli-progress";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import archiver from "archiver";
import { FacetEntry } from "../models/facetEntry.js";
import { decode } from "../utils/anonymization.js";
import fs from "fs";
import os from "os";
import path from "path";
import { requirePermission } from "../middlewares/permission.js";

const route = Router();

async function processDocEntities(doc) {
  let deAnonDoc = doc.features.anonymized ? await decode(doc) : doc;
  const docClusters = [];
  if (Object.keys(deAnonDoc.annotation_sets).length === 0) return docClusters;
  const annotations = deAnonDoc.annotation_sets["entities_"]?.annotations;
  if (!annotations) return docClusters;
  const mentionMap = {};
  for (const mention of annotations) {
    const rawStart = Math.max(0, mention.start - 100);
    const rawEnd = Math.min(deAnonDoc.text.length, mention.end + 100);
    const spaceBack =
      rawStart > 0 ? deAnonDoc.text.lastIndexOf(" ", rawStart) : -1;
    const contextStart = spaceBack !== -1 ? spaceBack + 1 : rawStart;
    const spaceForward =
      rawEnd < deAnonDoc.text.length ? deAnonDoc.text.indexOf(" ", rawEnd) : -1;
    const contextEnd = spaceForward !== -1 ? spaceForward : rawEnd;
    mentionMap[mention.id] = {
      id: mention.id,
      start: mention.start,
      end: mention.end,
      url: mention.features.url,
      text: deAnonDoc.text.slice(mention.start, mention.end),
      context: deAnonDoc.text.slice(contextStart, contextEnd),
    };
  }
  const innerClusters = deAnonDoc?.features?.clusters["entities_"];
  if (innerClusters) {
    for (const cluster of innerClusters) {
      docClusters.push({
        originalDocId: deAnonDoc.id,
        clusterId: `${deAnonDoc.id}_${cluster.id}`,
        title: cluster.title || "",
        type: cluster.type || "UNKNOWN",
        mentions: cluster.mentions
          ? cluster.mentions.map((cm) => mentionMap[cm.id])
          : [],
      });
    }
  }
  return docClusters;
}

export default (app) => {
  app.use("/collection", route);
  /**
   * @swagger
   * /api/collection/entities/{id}:
   *   get:
   *     summary: Get all entity clusters for a collection
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Collection ID
   *     responses:
   *       200:
   *         description: Successfully retrieved entity clusters
   *       403:
   *         description: Access denied
   *       404:
   *         description: Collection not found
   *       500:
   *         description: Error while fetching collection entities
   */
  route.get(
    "/entities/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const collection = await CollectionController.findById(id);
      if (!collection) {
        console.warn(`Collection ${id} not found`);
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check access
      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      try {
        const docInfos =
          await CollectionController.getCollectionDocumentInfo(id);
        const totalDocs = Array.isArray(docInfos) ? docInfos.length : 0;

        const progressBar = new cliProgress.SingleBar(
          {
            format:
              "Building entities |{bar}| {percentage}% ({value}/{total}) {docId}",
          },
          cliProgress.Presets.shades_classic,
        );
        progressBar.start(totalDocs, 0, { docId: "" });

        const tmpFile = path.join(
          os.tmpdir(),
          `entities_${id}_${Date.now()}.json`,
        );
        const writeStream = fs.createWriteStream(tmpFile, { encoding: "utf8" });
        writeStream.write("[");

        const collectionsDocs =
          await CollectionController.getAllDocumentsEfficient(id);
        let processed = 0;
        let first = true;

        for await (const doc of collectionsDocs) {
          processed += 1;
          if (!process.stdout.isTTY) {
            if (processed % 10 === 0 || processed === totalDocs) {
              console.log(`processing entities ${processed}/${totalDocs}`);
            }
          }
          progressBar.update(processed, { docId: doc.id || "" });

          const docClusters = await processDocEntities(doc);
          for (const cluster of docClusters) {
            if (!first) writeStream.write(",");
            writeStream.write(JSON.stringify(cluster));
            first = false;
          }
        }

        writeStream.write("]");
        await new Promise((resolve, reject) => {
          writeStream.end((err) => (err ? reject(err) : resolve()));
        });
        progressBar.stop();

        res.setHeader("Content-Type", "application/json");
        const readStream = fs.createReadStream(tmpFile);
        readStream.pipe(res);
        readStream.on("end", () => fs.unlink(tmpFile, () => {}));
        readStream.on("error", (err) => {
          fs.unlink(tmpFile, () => {});
          throw err;
        });
        return;
      } catch (error) {
        console.error("Error in /entities/:id", error);
        return res.status(500).json({
          message: `Error while fetching collection entities: ${error}`,
        });
      }
    }),
  );
  route.get(
    "/facetsCache/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const collection = await CollectionController.findById(id);
      if (!collection) {
        console.warn(`Collection ${id} not found`);
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check access
      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      let entries = await FacetEntry.find({ collectionId: id }).lean();
      if (!entries || entries.length === 0) {
        try {
          // First get lightweight list of documents (ids) to avoid loading all docs into memory
          const docInfos =
            await CollectionController.getCollectionDocumentInfo(id);
          const totalDocs = Array.isArray(docInfos) ? docInfos.length : 0;
          let cachePayload = {};

          // Iterate documents one-by-one, fetching full document only when needed
          // Use cli-progress to show a progress bar in the console
          const progressBar = new cliProgress.SingleBar(
            {
              format:
                "Building facets cache |{bar}| {percentage}% ({value}/{total})",
            },
            cliProgress.Presets.shades_classic,
          );
          // start progress bar with a payload token for a processing summary
          progressBar.start(totalDocs, 0, { processing: `0/${totalDocs}` });

          let processed = 0;
          for (const docInfo of docInfos || []) {
            processed += 1;

            // If stdout is not a TTY, periodically log progress to avoid silent runs
            if (!process.stdout.isTTY) {
              if (processed % 10 === 0 || processed === totalDocs) {
                console.log(`processing ${processed}/${totalDocs}`);
              }
            }

            try {
              // fetch full document only when processing
              const fullDocument = await DocumentController.getFullDocById(
                docInfo.id,
              );

              try {
                const perDocPayload = {};
                const entityList =
                  fullDocument.annotation_sets?.["entities_"]?.annotations ||
                  [];
                for (const entity of entityList) {
                  let mention = fullDocument.text.substring(
                    entity.start,
                    entity.end,
                  );
                  let ann_object = {
                    mention: mention,
                    start: entity["start"],
                    end: entity["end"],
                    id: entity["id"],
                    type: entity["type"],
                    doc_id: fullDocument.id,
                  };
                  const linking = entity.features?.linking;
                  if (linking && linking.is_nil === false) {
                    ann_object["display_name"] =
                      entity.features?.title || mention;
                    ann_object["is_linked"] = true;
                    ann_object["id_ER"] = linking?.top_candidate?.url || "";
                  } else {
                    ann_object["display_name"] = entity.originalKey || mention;
                    ann_object["is_linked"] = false;
                    ann_object["id_ER"] = `${fullDocument.id}_${mention}`;
                  }

                  // accumulate per-document payload
                  if (entity["type"] in perDocPayload) {
                    perDocPayload[entity["type"]].push(ann_object);
                  } else {
                    perDocPayload[entity["type"]] = [ann_object];
                  }

                  // also keep a local accumulator if you still want the full in-memory copy
                  if (entity["type"] in cachePayload) {
                    cachePayload[entity["type"]].push(ann_object);
                  } else {
                    cachePayload[entity["type"]] = [ann_object];
                  }
                }

                // update cache with the per-document payload so the DB grows incrementally
                if (Object.keys(perDocPayload).length > 0) {
                  try {
                    await CollectionController.updateCache(
                      { toAdd: perDocPayload },
                      id,
                    );
                  } catch (updErr) {
                    console.warn(
                      `Warning: failed to update facets cache for document ${fullDocument.id}`,
                      updErr,
                    );
                  }
                }
              } catch (e) {
                // best-effort per-document, don't abort entire build on single-doc error
                console.warn(
                  `Error processing document ${fullDocument?.id} for cache`,
                  e,
                );
              }
            } catch (outerErr) {
              console.warn(
                `Error fetching/processing document ${docInfo?.id}`,
                outerErr,
              );
            } finally {
              // update progress bar and show per-loop processing summary via payload
              progressBar.update(processed, {
                processing: `${processed}/${totalDocs}`,
              });
            }
          }
          // finalize progress bar
          progressBar.stop();

          // ensure entries exist after incremental updates
          entries = await FacetEntry.find({ collectionId: id }).lean();
          if (!entries || entries.length === 0) {
            console.error(`Failed to build facets cache for collection ${id}`);
            return res
              .status(500)
              .json({ message: "Failed to build facets cache" });
          }
        } catch (e) {
          console.error("error building facets cache", e);
          return res
            .status(500)
            .json({ message: "Error building facets cache" });
        }
      }
      try {
        // Minimal work in route: delegate grouping/aggregation to MongoDB
        // include `doc_ids` by default; set includeDocIds=false to omit
        const includeDocIds =
          req.query.includeDocIds === "false" ? false : true;
        const maxChildren = parseInt(req.query.maxChildren || "0", 10) || 0;

        console.log(
          `[facetsCachePaginated] collectionId=${id}, page=${page}, limit=${limit}`,
        );
        const matchStage = { $match: { collectionId: id } };
        const addDocCount = {
          $addFields: {
            doc_count: { $size: { $ifNull: ["$doc_ids", []] } },
            ids_ER: { $ifNull: ["$ids_ER", []] },
          },
        };

        const projectFields = {
          facetType: 1,
          display_name: 1,
          is_linked: 1,
          ids_ER: 1,
          doc_count: 1,
          doc_ids: 1,
        };
        const projectStage = { $project: projectFields };

        const sortStage = { $sort: { facetType: 1, doc_count: -1 } };

        const groupStage = {
          $group: {
            _id: "$facetType",
            children: {
              $push: {
                key: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$ids_ER", []] } }, 0] },
                    { $arrayElemAt: ["$ids_ER", 0] },
                    "$display_name",
                  ],
                },
                display_name: "$display_name",
                is_linked: "$is_linked",
                ids_ER: "$ids_ER",
                doc_count: "$doc_count",
                doc_ids: "$doc_ids",
              },
            },
            doc_count: { $sum: "$doc_count" },
          },
        };

        const finalProject = {
          $project: {
            key: "$_id",
            doc_count: 1,
            children: 1,
            _id: 0,
          },
        };

        const pipeline = [
          matchStage,
          addDocCount,
          projectStage,
          sortStage,
          groupStage,
          finalProject,
        ];
        if (maxChildren > 0) {
          pipeline.push({
            $addFields: { children: { $slice: ["$children", maxChildren] } },
          });
        }
        pipeline.push({ $sort: { key: 1 } });

        const result = await FacetEntry.aggregate(pipeline)
          .allowDiskUse(false)
          .exec();
        return res.json(result);
      } catch (e) {
        console.error("Error aggregating facet entries:", e);
        return res
          .status(500)
          .json({ message: "Failed to build facets cache" });
      }
    }),
  );

  // ─────────────────────────────────────────────────────────────────
  // Paginated facets endpoint
  // ─────────────────────────────────────────────────────────────────
  route.get(
    "/facetsCachePaginated/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const page = parseInt(req.query.page || "1", 10);
      const limit = parseInt(req.query.limit || "20", 10);
      const includeDocIds = req.query.includeDocIds === "false" ? false : true;
      const maxChildren = parseInt(req.query.maxChildren || "0", 10) || 0;

      if (page < 1 || limit < 1 || limit > 100) {
        return res
          .status(400)
          .json({ message: "Invalid pagination parameters" });
      }

      const collection = await CollectionController.findById(id);
      if (!collection) {
        console.warn(`Collection ${id} not found`);
        return res.status(404).json({ message: "Collection not found" });
      }

      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      let entries = await FacetEntry.find({ collectionId: id }).lean();
      if (!entries || entries.length === 0) {
        try {
          const docInfos =
            await CollectionController.getCollectionDocumentInfo(id);
          const totalDocs = Array.isArray(docInfos) ? docInfos.length : 0;
          let cachePayload = {};

          const progressBar = new cliProgress.SingleBar(
            {
              format:
                "Building facets cache |{bar}| {percentage}% ({value}/{total})",
            },
            cliProgress.Presets.shades_classic,
          );
          progressBar.start(totalDocs, 0, { processing: `0/${totalDocs}` });

          let processed = 0;
          for (const docInfo of docInfos || []) {
            processed += 1;

            if (!process.stdout.isTTY) {
              if (processed % 10 === 0 || processed === totalDocs) {
                console.log(`processing ${processed}/${totalDocs}`);
              }
            }

            try {
              const fullDocument = await DocumentController.getFullDocById(
                docInfo.id,
              );

              try {
                const perDocPayload = {};
                const entityList =
                  fullDocument.annotation_sets?.["entities_"]?.annotations ||
                  [];
                for (const entity of entityList) {
                  let mention = fullDocument.text.substring(
                    entity.start,
                    entity.end,
                  );
                  let ann_object = {
                    mention: mention,
                    start: entity["start"],
                    end: entity["end"],
                    id: entity["id"],
                    type: entity["type"],
                    doc_id: fullDocument.id,
                  };
                  const linking = entity.features?.linking;
                  if (linking && linking.is_nil === false) {
                    ann_object["display_name"] =
                      entity.features?.title || mention;
                    ann_object["is_linked"] = true;
                    ann_object["id_ER"] = linking?.top_candidate?.url || "";
                  } else {
                    ann_object["display_name"] = entity.originalKey || mention;
                    ann_object["is_linked"] = false;
                    ann_object["id_ER"] = `${fullDocument.id}_${mention}`;
                  }

                  if (entity["type"] in perDocPayload) {
                    perDocPayload[entity["type"]].push(ann_object);
                  } else {
                    perDocPayload[entity["type"]] = [ann_object];
                  }

                  if (entity["type"] in cachePayload) {
                    cachePayload[entity["type"]].push(ann_object);
                  } else {
                    cachePayload[entity["type"]] = [ann_object];
                  }
                }

                if (Object.keys(perDocPayload).length > 0) {
                  try {
                    await CollectionController.updateCache(
                      { toAdd: perDocPayload },
                      id,
                    );
                  } catch (updErr) {
                    console.warn(
                      `Warning: failed to update facets cache for document ${fullDocument.id}`,
                      updErr,
                    );
                  }
                }
              } catch (e) {
                console.warn(
                  `Error processing document ${fullDocument?.id} for cache`,
                  e,
                );
              }
            } catch (outerErr) {
              console.warn(
                `Error fetching/processing document ${docInfo?.id}`,
                outerErr,
              );
            } finally {
              progressBar.update(processed, {
                processing: `${processed}/${totalDocs}`,
              });
            }
          }
          progressBar.stop();

          entries = await FacetEntry.find({ collectionId: id }).lean();
          if (!entries || entries.length === 0) {
            console.error(`Failed to build facets cache for collection ${id}`);
            return res
              .status(500)
              .json({ message: "Failed to build facets cache" });
          }
        } catch (e) {
          console.error("error building facets cache", e);
          return res
            .status(500)
            .json({ message: "Error building facets cache" });
        }
      }

      try {
        const skip = (page - 1) * limit;

        const matchStage = { $match: { collectionId: id } };
        const addDocCount = {
          $addFields: {
            doc_count: { $size: { $ifNull: ["$doc_ids", []] } },
            ids_ER: { $ifNull: ["$ids_ER", []] },
          },
        };

        const projectFields = {
          facetType: 1,
          display_name: 1,
          is_linked: 1,
          ids_ER: 1,
          doc_count: 1,
        };
        if (includeDocIds) {
          projectFields.doc_ids = 1;
        }
        const projectStage = { $project: projectFields };

        const sortStage = { $sort: { facetType: 1, doc_count: -1 } };

        const groupStage = {
          $group: {
            _id: "$facetType",
            children: {
              $push: {
                key: {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$ids_ER", []] } }, 0] },
                    { $arrayElemAt: ["$ids_ER", 0] },
                    "$display_name",
                  ],
                },
                display_name: "$display_name",
                is_linked: "$is_linked",
                ids_ER: "$ids_ER",
                doc_count: "$doc_count",
              },
            },
            doc_count: { $sum: "$doc_count" },
          },
        };
        if (includeDocIds) {
          groupStage.$group.children.$push.doc_ids = "$doc_ids";
        }

        const finalProject = {
          $project: {
            key: "$_id",
            doc_count: 1,
            children: 1,
            _id: 0,
          },
        };

        const pipeline = [
          matchStage,
          addDocCount,
          projectStage,
          sortStage,
          groupStage,
          finalProject,
        ];
        if (maxChildren > 0) {
          pipeline.push({
            $addFields: { children: { $slice: ["$children", maxChildren] } },
          });
        }
        pipeline.push({ $sort: { key: 1 } });

        const totalPipeline = [
          matchStage,
          addDocCount,
          projectStage,
          sortStage,
          groupStage,
          finalProject,
        ];
        if (maxChildren > 0) {
          totalPipeline.push({
            $addFields: { children: { $slice: ["$children", maxChildren] } },
          });
        }
        totalPipeline.push({ $sort: { key: 1 } });
        totalPipeline.push({ $count: "total" });

        const totalResult = await FacetEntry.aggregate(totalPipeline)
          .allowDiskUse(false)
          .exec();
        const total = totalResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const result = await FacetEntry.aggregate(pipeline)
          .allowDiskUse(false)
          .exec();

        return res.json({
          facets: result,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        });
      } catch (e) {
        console.error("Error aggregating paginated facet entries:", e);
        return res
          .status(500)
          .json({ message: "Failed to fetch paginated facets" });
      }
    }),
  );

  /**
   * Fuzzy search facets by display_name within a specific facet type (key)
   * Uses MongoDB regex for pattern matching
   * Query params: key (facet type), query (search string), limit (optional), page (optional)
   */
  route.get(
    "/facetsCacheSearch/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const { key, query, limit: queryLimit, page: queryPage } = req.query;

      if (!key) {
        return res.status(400).json({
          message: "Missing required query parameter: key",
        });
      }

      // Treat undefined/null query as empty string (match all)
      const searchQuery = query || '';

      const limit = Math.min(parseInt(queryLimit || "20", 10), 100);
      const page = Math.max(parseInt(queryPage || "1", 10), 1);
      const skip = (page - 1) * limit;

      console.log(
        `[facetsCacheSearch] collectionId=${id}, facetType=${key}, query="${searchQuery}", page=${page}, limit=${limit}`,
      );

      const collection = await CollectionController.findById(id);
      if (!collection) {
        console.warn(`Collection ${id} not found`);
        return res.status(404).json({ message: "Collection not found" });
      }

      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      try {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = escapeRegex(searchQuery);

        const pipeline = [
          { $match: { collectionId: id, facetType: key } },
          {
            $addFields: {
              doc_count: { $size: { $ifNull: ["$doc_ids", []] } },
              ids_ER: { $ifNull: ["$ids_ER", []] },
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
          {
            $match: {
              display_name: { $regex: pattern, $options: "i" },
            },
          },
          { $sort: { doc_count: -1, display_name: 1 } },
          {
            $facet: {
              metadata: [{ $count: "total" }],
              results: [{ $skip: skip }, { $limit: limit }],
            },
          },
        ];

        const result = await FacetEntry.aggregate(pipeline)
          .allowDiskUse(false)
          .exec();

        const metadata = result[0]?.metadata[0] || { total: 0 };
        const results = result[0]?.results || [];
        const total = metadata.total;
        const totalPages = Math.ceil(total / limit);

        return res.json({
          facets: results,
          facetType: key,
          query,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        });
      } catch (e) {
        console.error("Error searching facets:", e);
        return res.status(500).json({ message: "Failed to search facets" });
      }
    }),
  );

  /**
   * @swagger
   * /api/collection:
   *   get:
   *     summary: Get all collections accessible by the current user
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Successfully retrieved collections
   */
  route.get(
    "/collectioninfo/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      const collection = await CollectionController.findById(id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check access
      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      try {
        const collectionInfoDocs =
          await CollectionController.getCollectionDocumentInfo(id);

        return res.json(collectionInfoDocs);
      } catch (error) {
        return res
          .status(500)
          .json({ message: "Collection id is null or undefined" });
      }
    }),
  );
  route.get(
    "/",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const userId = req.user?.sub || req.user?.userId;

      if (!userId) {
        console.error("No userId found in request - returning 401");
        return res.status(401).json({ message: "Unauthorized" });
      }

      const collections = await CollectionController.findByUserId(userId);
      return res.json(collections);
    }),
  );

  /**
   * @swagger
   * /api/collection/{id}:
   *   get:
   *     summary: Get a collection by ID
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Successfully retrieved collection
   *       404:
   *         description: Collection not found
   */
  route.get(
    "/:id",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const collection = await CollectionController.findById(id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }

      // Check access
      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      return res.json(collection);
    }),
  );
  route.get(
    "/:id/download",
    requirePermission("collections", "view"),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // Check access
      const hasAccess = await CollectionController.hasAccess(id, userId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }
      const collection = await CollectionController.findById(id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      let fullDocuments =
        await CollectionController.streamAllDocumentsConcurrent(id);
      console.log("full docs", fullDocuments);
      const zipFileName = `${collection.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
      //setting headers for response
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${zipFileName}"`,
      );
      const zipArchive = archiver("zip", {
        zlib: { level: 9 },
      });
      zipArchive.on("error", (err) => {
        throw err;
      });

      //pipe archive stream to response
      zipArchive.pipe(res);
      for await (const doc of fullDocuments) {
        const filename = `${doc.name || doc.id}.json`;
        zipArchive.append(JSON.stringify(doc, null, 2), { name: filename });
      }
      // fullDocuments.forEach((doc) => {
      //   const filename = `${doc.name || doc.id}.json`;
      //   zipArchive.append(JSON.stringify(doc, null, 2), { name: filename });
      // });
      await zipArchive.finalize();
    }),
  );
  /**
   * @swagger
   * /api/collection:
   *   post:
   *     summary: Create a new collection
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *             properties:
   *               name:
   *                 type: string
   *               allowedUserIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Collection created successfully
   */
  route.post(
    "/",
    requirePermission("collections", "create"),
    validateRequest({
      req: {
        body: z.object({
          name: z.string().min(1),
          allowedUserIds: z.array(z.string()).optional(),
          config: z
            .object({
              typesToHide: z.array(z.string()).optional(),
              typesOrder: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { name, allowedUserIds, config } = req.body;
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const collection = await CollectionController.create({
        name,
        ownerId: userId,
        allowedUserIds: allowedUserIds || [],
        config: config || {},
      });

      return res.status(201).json(collection);
    }),
  );

  /**
   * @swagger
   * /api/collection/{id}:
   *   put:
   *     summary: Update a collection
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               allowedUserIds:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Collection updated successfully
   */
  route.put(
    "/:id",
    requirePermission("collections", "update"),
    validateRequest({
      req: {
        body: z.object({
          name: z.string().min(1).optional(),
          allowedUserIds: z.array(z.string()).optional(),
          config: z
            .object({
              typesToHide: z.array(z.string()).optional(),
              typesOrder: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const { name, allowedUserIds, config } = req.body;
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const collection = await CollectionController.update(id, userId, {
        name,
        allowedUserIds,
        config,
      });

      return res.json(collection);
    }),
  );

  /**
   * @swagger
   * /api/collection/{id}:
   *   delete:
   *     summary: Delete a collection
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Collection deleted successfully
   */
  route.delete(
    "/:id",
    requirePermission("collections", "delete"),
    validateRequest({
      req: {
        body: z.object({
          elasticIndex: z.string(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { id } = req.params;
      const { elasticIndex } = req.body;
      const userId = req.user?.sub || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const collection = await CollectionController.delete(
        id,
        userId,
        elasticIndex,
      );
      return res.json({ message: "Collection deleted", collection });
    }),
  );

  /**
   * @swagger
   * /api/collection/users/all:
   *   get:
   *     summary: Get all users (for selection dropdown)
   *     tags: [Collections]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Successfully retrieved users
   */

  route.get(
    "/users/all",
    asyncRoute(async (req, res) => {
      const users = await CollectionController.getAllUsers();
      return res.json(users);
    }),
  );
};
