import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import { CollectionController } from "../controllers/collection";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";

const route = Router();

export default (app) => {
    app.use("/collection", route);

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
        "/",
        asyncRoute(async (req, res) => {
            const userId = req.user?.sub;
            if (!userId) {
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
        asyncRoute(async (req, res) => {
            const { id } = req.params;
            const userId = req.user?.sub;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const collection = await CollectionController.findById(id);
            if (!collection) {
                return res
                    .status(404)
                    .json({ message: "Collection not found" });
            }

            // Check access
            const hasAccess = await CollectionController.hasAccess(id, userId);
            if (!hasAccess) {
                return res.status(403).json({ message: "Access denied" });
            }

            return res.json(collection);
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
        validateRequest({
            req: {
                body: z.object({
                    name: z.string().min(1),
                    allowedUserIds: z.array(z.string()).optional(),
                }),
            },
        }),
        asyncRoute(async (req, res) => {
            console.log("*** create collection body ***", req.body);
            const { name, allowedUserIds } = req.body;
            const userId = req.user?.sub;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const collection = await CollectionController.create({
                name,
                ownerId: userId,
                allowedUserIds: allowedUserIds || [],
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
        validateRequest({
            req: {
                body: z.object({
                    name: z.string().min(1).optional(),
                    allowedUserIds: z.array(z.string()).optional(),
                }),
            },
        }),
        asyncRoute(async (req, res) => {
            const { id } = req.params;
            const { name, allowedUserIds } = req.body;
            const userId = req.user?.sub;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const collection = await CollectionController.update(id, userId, {
                name,
                allowedUserIds,
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
        asyncRoute(async (req, res) => {
            const { id } = req.params;
            const userId = req.user?.sub;
            if (!userId) {
                return res.status(401).json({ message: "Unauthorized" });
            }

            const collection = await CollectionController.delete(id, userId);
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
