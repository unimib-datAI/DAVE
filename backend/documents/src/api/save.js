import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { AnnotationSet } from "../models/annotationSet";
import { DocumentController } from "../controllers/document";
import { ChatController } from "../controllers/chat.js";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import axios from "axios";

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
    validateRequest({
      req: {
        body: z.object({
          docId: z.union([z.string(), z.number()]),
          annotationSets: z.object(),
          features: z.object().optional(),
          elasticIndex: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { docId, annotationSets, features, elasticIndex } = req.body;

      // Update annotation sets in MongoDB
      const resUpdate = await DocumentController.updateEntitiesAnnotationSet(
        docId,
        annotationSets,
      );

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
          console.log("=== ELASTICSEARCH UPDATE START ===");
          console.log("elasticIndex:", elasticIndex);
          console.log("docId:", docId);

          // Get the updated document with clusters from features
          // Use the features that were just saved, or fetch from DB if not provided
          let clustersToUse = features?.clusters;

          if (!clustersToUse) {
            console.log("Features not provided, fetching document from DB...");
            // Features weren't provided, fetch the document to get clusters
            const doc = await DocumentController.findOne(docId);
            clustersToUse = doc.features?.clusters;
            console.log(
              "Fetched clusters from DB:",
              clustersToUse ? "Found" : "Not found",
            );
          } else {
            console.log("Using clusters from provided features");
          }

          if (clustersToUse) {
            // Find the entities annotation set name - use "entities_"
            const entitiesAnnotationSetName = Object.keys(annotationSets).find(
              (name) => name === "entities_",
            );
            console.log(
              "Entities annotation set name:",
              entitiesAnnotationSetName,
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
              console.log("Elasticsearch update successful:", response.data);
            } else {
              console.log(
                "No entities annotation set found or no clusters in that set",
              );
            }
          } else {
            console.log("No clusters found in features");
          }
        } catch (error) {
          console.error("=== ELASTICSEARCH UPDATE ERROR ===");
          console.error(
            "Error updating Elasticsearch annotations:",
            error.message,
          );
          if (error.response) {
            console.error("Response status:", error.response.status);
            console.error("Response data:", error.response.data);
          }
          console.error("=== ELASTICSEARCH UPDATE ERROR END ===");
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
    asyncRoute(async (req, res) => {
      const { rateValue, chatState } = req.body;
      const resAdd = await ChatController.saveRating(rateValue, chatState);
      return res.json(resAdd);
    }),
  );
};
