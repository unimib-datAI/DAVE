import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { AnnotationSet } from "../models/annotationSet";
import { DocumentController } from "../controllers/document";
import { CollectionController } from "../controllers/collection";
import { ChatController } from "../controllers/chat.js";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import axios from "axios";
import { requirePermission } from "../middlewares/permission.js";

const route = Router();

// Helper function to anonymize mentions
const anonymizeMention = (mention) => {
  if (!mention) return "";
  const words = mention.split(" ");
  return words
    .map((word) =>
      word.length > 0 ? word[0] + "*".repeat(word.length - 1) : "",
    )
    .join(" ");
};

export default (app) => {
  // route base root
  app.use("/save", route);

  // quick middleware to log incoming requests to this route
  // per-request logging is handled by the global `requestLogger` middleware

  /**
   * @swagger
   * /api/save:
   *   post:
   *     summary: Save annotation sets and features
   *     description: Save entity annotation sets and optionally update document features
   *     tags: [Save]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - docId
   *               - annotationSets
   *             properties:
   *               docId:
   *                 oneOf:
   *                   - type: string
   *                   - type: number
   *                 description: Document ID
   *               annotationSets:
   *                 type: object
   *                 description: Annotation sets to save
   *               features:
   *                 type: object
   *                 description: Optional document features to update
   *     responses:
   *       200:
   *         description: Successfully saved annotation sets and features
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 annotationSets:
   *                   type: object
   *                 features:
   *                   type: object
   *                 success:
   *                   type: boolean
   */
  route.post(
    "/",
    requirePermission("document", "update"),
    validateRequest({
      req: {
        body: z.object({
          collectionId: z.string(),
          docId: z.union([z.string(), z.number()]),
          annotationSets: z.object(),
          features: z.object().optional(),
          elasticIndex: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { docId, annotationSets, features, elasticIndex, collectionId } =
        req.body;

      // Fetch existing document/annotations (best-effort) before we overwrite them
      let existingDoc = null;
      try {
        existingDoc = await DocumentController.findOne(docId);
      } catch (e) {
        existingDoc = null;
      }

      // Update annotation sets in MongoDB
      const resUpdate = await DocumentController.updateEntitiesAnnotationSet(
        docId,
        annotationSets,
      );

      // Update facets cache entries for the collection based on saved annotations
      try {
        const fullDoc = await DocumentController.findOne(docId);
        if (collectionId) {
          const toAdd = {};
          const toDelete = {};

          const buildEntry = (ann, docIdForEntry) => {
            const mention = ann.features?.mention || "";
            const display_name =
              ann.features?.title || ann.originalKey || mention;
            const linking = ann.features?.linking;
            const is_linked = !!(linking && linking.is_nil === false);
            const id_ER = is_linked
              ? linking?.top_candidate?.url || ""
              : `${docIdForEntry}_${mention}`;
            return {
              start: ann.start,
              end: ann.end,
              id: ann.id,
              type: ann.type,
              doc_id: docIdForEntry,
              display_name,
              is_linked,
              id_ER,
            };
          };

          // Build old map
          const oldMaps = {};
          if (existingDoc && existingDoc.annotation_sets) {
            for (const oldSet of existingDoc.annotation_sets) {
              for (const ann of oldSet.annotations || []) {
                const entry = buildEntry(ann, existingDoc.id);
                const facetType = entry.type || "unknown";
                oldMaps[facetType] = oldMaps[facetType] || new Map();
                const key = `${entry.id_ER}||${String(entry.display_name || "").toLowerCase()}`;
                oldMaps[facetType].set(key, entry);
              }
            }
          }

          // Build new map and toAdd (deduplicating by key)
          const newMaps = {};
          for (const annSet of resUpdate || []) {
            for (const ann of annSet.annotations || []) {
              const entry = buildEntry(ann, fullDoc.id);
              const facetType = entry.type || "unknown";
              newMaps[facetType] = newMaps[facetType] || new Map();
              const key = `${entry.id_ER}||${String(entry.display_name || "").toLowerCase()}`;
              if (!newMaps[facetType].has(key)) {
                newMaps[facetType].set(key, entry);
                toAdd[facetType] = toAdd[facetType] || [];
                toAdd[facetType].push({
                  id_ER: entry.id_ER,
                  doc_id: entry.doc_id,
                  display_name: entry.display_name,
                  is_linked: entry.is_linked,
                  metadata: {},
                });
              }
            }
          }

          // Compute toDelete: items in oldMaps not present in newMaps
          for (const [facetType, map] of Object.entries(oldMaps)) {
            for (const [key, oldEntry] of map.entries()) {
              const existsInNew = newMaps[facetType]?.has(key);
              if (!existsInNew) {
                toDelete[facetType] = toDelete[facetType] || [];
                toDelete[facetType].push({
                  id_ER: oldEntry.id_ER,
                  doc_id: oldEntry.doc_id,
                  displayName: oldEntry.display_name,
                });
              }
            }
          }

          const cachePayload = {};
          if (Object.keys(toAdd).length) cachePayload.toAdd = toAdd;
          if (Object.keys(toDelete).length) cachePayload.toDelete = toDelete;

          if (Object.keys(cachePayload).length > 0) {
            try {
              await CollectionController.updateCache(
                cachePayload,
                collectionId,
              );
            } catch (e) {
              console.error(
                "Failed to update facets cache for collection",
                collectionId,
                e,
              );
            }
          }
        }
      } catch (e) {
        console.error("Error computing/updating facets cache after save:", e);
      }

      // Update features if provided
      let featuresUpdateResult = null;
      if (features !== undefined) {
        featuresUpdateResult = await DocumentController.updateDocumentFeatures(
          docId,
          features,
        );
      }

      // Update Elasticsearch index if elasticIndex is provided
      if (elasticIndex) {
        try {
          // Get the updated document with clusters from features
          // Use the features that were just saved, or fetch from DB if not provided
          let clustersToUse = features?.clusters;

          if (!clustersToUse) {
            // Features weren't provided, fetch the document to get clusters
            const doc = await DocumentController.findOne(docId);
            clustersToUse = doc.features?.clusters;
          } else {
            console.log("Using clusters from provided features");
          }

          if (clustersToUse) {
            // Find the entities annotation set name - use "entities_"
            const entitiesAnnotationSetName = Object.keys(annotationSets).find(
              (name) => name === "entities_",
            );

            if (
              entitiesAnnotationSetName &&
              clustersToUse[entitiesAnnotationSetName]
            ) {
              const clusters = clustersToUse[entitiesAnnotationSetName];

              // Get the annotations from the annotation set
              const annotations =
                annotationSets[entitiesAnnotationSetName]?.annotations || [];

              // Transform individual annotations to Elasticsearch format
              // Each annotation gets its own entry with cluster ID as id_ER
              const mentions = annotations
                .map((annotation) => {
                  const clusterId = annotation.features?.cluster;

                  if (!clusterId) {
                    return null;
                  }

                  const cluster = clusters.find((c) => c.id === clusterId);
                  const type = annotation.type || "unknown";
                  const mention = annotation.features?.mention || "";
                  const shouldAnonymize = [
                    "persona",
                    "parte",
                    "controparte",
                  ].includes(type);
                  return {
                    id: annotation.id,
                    id_ER: String(clusterId),
                    start: annotation.start || 0,
                    end: annotation.end || 0,
                    type: type,
                    mention: mention,
                    is_linked: cluster ? Boolean(cluster.url) : false,
                    display_name: cluster?.title
                      ? shouldAnonymize
                        ? anonymizeMention(cluster.title)
                        : cluster.title
                      : shouldAnonymize
                        ? anonymizeMention(mention)
                        : mention,
                  };
                })
                .filter((m) => m !== null);

              // Log id_ER distribution
              const idERCounts = mentions.reduce((acc, m) => {
                const key = m.id_ER;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
              }, {});

              // Call qavectorizer to update Elasticsearch
              const elasticUrl =
                process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";
              const updateUrl = `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}/annotations`;
              const response = await axios.post(updateUrl, {
                mentions: mentions,
              });
            } else {
              console.log(
                "No entities annotation set found or no clusters in that set",
              );
            }
          } else {
            console.log("No clusters found in features");
          }
        } catch (error) {
          console.error(
            "Error updating Elasticsearch annotations:",
            error.message,
          );
          if (error.response) {
            console.error("Response status:", error.response.status);
            console.error("Response data:", error.response.data);
          }
          // Don't fail the entire request if Elasticsearch update fails
        }
      }

      // Return both annotation sets and features information
      const response = {
        annotationSets: resUpdate,
        features: featuresUpdateResult
          ? featuresUpdateResult.features
          : undefined,
        success: true,
      };

      return res.json(response);
    }),
  );

  /**
   * @swagger
   * /api/save/rate-conversation:
   *   post:
   *     summary: Rate a conversation
   *     description: Save a rating for a chat conversation
   *     tags: [Save]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               rateValue:
   *                 type: number
   *                 description: Rating value for the conversation
   *               chatState:
   *                 type: object
   *                 description: Current state of the chat
   *     responses:
   *       200:
   *         description: Successfully saved conversation rating
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  route.post(
    "/rate-conversation",
    requirePermission("chat", "canUse"),
    asyncRoute(async (req, res) => {
      const { rateValue, chatState } = req.body;
      const resAdd = await ChatController.saveRating(rateValue, chatState);
      return res.json(resAdd);
    }),
  );
};
