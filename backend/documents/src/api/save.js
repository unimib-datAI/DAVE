import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { AnnotationSet } from "../models/annotationSet";
import { DocumentController } from "../controllers/document";
import { ChatController } from "../controllers/chat.js";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";

const route = Router();

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
                }),
            },
        }),
        asyncRoute(async (req, res) => {
            console.log("=== SAVE ENDPOINT CALLED ===");
            console.log("Request body:", JSON.stringify(req.body, null, 2));

            const { docId, annotationSets, features } = req.body;

            console.log("Extracted docId:", docId);
            console.log(
                "Extracted annotationSets:",
                annotationSets ? "Present" : "Not present",
            );
            console.log(
                "Extracted features:",
                features
                    ? JSON.stringify(features, null, 2)
                    : "Not present or undefined",
            );
            console.log("Features type:", typeof features);
            console.log("Features === undefined:", features === undefined);

            // Update annotation sets
            console.log("Updating annotation sets...");
            const resUpdate =
                await DocumentController.updateEntitiesAnnotationSet(
                    docId,
                    annotationSets,
                );
            console.log("Annotation sets updated successfully");

            // Update features if provided
            let featuresUpdateResult = null;
            console.log("Checking if features should be updated...");
            if (features !== undefined) {
                console.log(
                    "Features is not undefined, proceeding with features update...",
                );
                console.log(
                    "Features to save:",
                    JSON.stringify(features, null, 2),
                );
                featuresUpdateResult =
                    await DocumentController.updateDocumentFeatures(
                        docId,
                        features,
                    );
                console.log(
                    "Features update completed. Result:",
                    featuresUpdateResult ? "Success" : "Failed",
                );
            } else {
                console.log("Features is undefined, skipping features update");
            }

            // Return both annotation sets and features information
            const response = {
                annotationSets: resUpdate,
                features: featuresUpdateResult
                    ? featuresUpdateResult.features
                    : undefined,
                success: true,
            };

            console.log("Sending response:", JSON.stringify(response, null, 2));
            console.log("=== SAVE ENDPOINT COMPLETED ===");

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
            const resAdd = await ChatController.saveRating(
                rateValue,
                chatState,
            );
            return res.json(resAdd);
        }),
    );
};
