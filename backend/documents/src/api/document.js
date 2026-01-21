import { Router } from "express";
import { DocumentController } from "../controllers/document";
import { asyncRoute } from "../utils/async-route";
import { Document, documentDTO } from "../models/document";
import { validateRequest } from "zod-express-middleware";
import { z } from "zod";
import { AnnotationSet, annotationSetDTO } from "../models/annotationSet";
import { AnnotationSetController } from "../controllers/annotationSet";
import { Annotation, annotationDTO } from "../models/annotation";
import { decode, makeDecryptionRequest } from "../utils/anonymization";

import axios from "axios";
import { Service, serviceDTO } from "../models/service";
import { Configuration, configurationDTO } from "../models/configuration";

const route = Router();

const deleteDoc = async (req, res, next) => {
  const { docId } = req.params;
  const { elasticIndex } = req.body || {};
  // delete document and return deleted document
  const deletedDoc = await Document.findOneAndDelete({ id: docId });
  // get all annotation sets to delete
  const annotationSets = await AnnotationSet.find({ docId });
  await Promise.all(
    annotationSets.map(async (annSet) => {
      // delete annotations for each annotation set
      await Annotation.deleteMany({ annotationSetId: annSet._id });
    }),
  );
  // delete annotation sets for the document
  await AnnotationSet.deleteMany({ docId });

  if (res) {
    // Delete from Elasticsearch if index name provided
    console.log("*** supplied elastic index for doc deletion", elasticIndex);
    if (elasticIndex) {
      try {
        const elasticUrl =
          process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";
        await axios.delete(
          `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}`,
        );
      } catch (error) {
        console.error(
          `Error deleting document from Elasticsearch: ${error.message}`,
        );
      }
    }
    return res.json(deletedDoc);
  } else {
    return deletedDoc;
  }
};

export default (app) => {
  // route base root
  app.use("/document", route);

  /**
   * @swagger
   * /api/document:
   *   get:
   *     summary: Get all documents
   *     description: Retrieve a paginated list of documents with optional search query
   *     tags: [Documents]
   *     parameters:
   *       - in: query
   *         name: q
   *         schema:
   *           type: string
   *         description: Query string to search documents by name
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number for pagination
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Number of documents per page
   *     responses:
   *       200:
   *         description: Successfully retrieved documents
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/DocumentPage'
   */
  route.get(
    "/",
    validateRequest({
      req: {
        query: z.object({
          // query to find by name
          q: z.string().optional(),
          // page
          page: z.number().optional(),
          // n. of documents to return for each page
          limit: z.number().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { q, limit, page } = req.query;
      const documentsPage = await DocumentController.findAll(q, limit, page);
      return res.json(documentsPage).status(200);
    }),
  );

  /**
   * Services endpoints
   * Persist minimal service entries (name + uri + serviceType) used by the annotation pipeline.
   *
   * Routes:
   *   GET    /api/document/services          -> list services
   *   POST   /api/document/services          -> create new service
   *   PUT    /api/document/services/:id      -> update service
   *   DELETE /api/document/services/:id      -> delete service
   *
   * Protected by auth middleware (JWT). Requests should present a valid Bearer token.
   */
  // GET /api/document/services - list all services
  route.get(
    "/services",
    asyncRoute(async (req, res) => {
      try {
        const services = await Service.find({}).lean();
        return res.json(services).status(200);
      } catch (err) {
        console.error("Failed to fetch services", err);
        return res.status(500).json({ message: "Failed to fetch services" });
      }
    }),
  );

  // POST /api/document/services - create a new service
  route.post(
    "/services",
    validateRequest({
      req: {
        body: z.object({
          name: z.string().min(1),
          uri: z.string().min(1),
          serviceType: z.string().min(1),
          description: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const { name, uri, serviceType, description } = req.body;
        // create and save
        const svc = serviceDTO({ name, uri, serviceType, description });
        const inserted = await svc.save();
        return res.json(inserted).status(201);
      } catch (err) {
        console.error("Failed to create service", err);
        // handle duplicate key
        if (err && err.code === 11000) {
          return res
            .status(409)
            .json({ message: "Service with this name already exists" });
        }
        return res
          .status(500)
          .json({ message: "Failed to create service", error: String(err) });
      }
    }),
  );

  // PUT /api/document/services/:id - update a service
  route.put(
    "/services/:id",
    validateRequest({
      req: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          name: z.string().min(1).optional(),
          uri: z.string().min(1).optional(),
          serviceType: z.string().min(1).optional(),
          description: z.string().optional(),
          disabled: z.boolean().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const { id } = req.params;
        const update = req.body;
        const updated = await Service.findByIdAndUpdate(id, update, {
          new: true,
        });
        if (!updated) {
          return res.status(404).json({ message: "Service not found" });
        }
        return res.json(updated).status(200);
      } catch (err) {
        console.error("Failed to update service", err);
        return res
          .status(500)
          .json({ message: "Failed to update service", error: String(err) });
      }
    }),
  );

  // DELETE /api/document/services/:id - delete a service
  route.delete(
    "/services/:id",
    validateRequest({
      req: {
        params: z.object({ id: z.string().min(1) }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const { id } = req.params;
        const deleted = await Service.findByIdAndDelete(id);
        if (!deleted) {
          return res.status(404).json({ message: "Service not found" });
        }
        return res.json({ message: "deleted" }).status(200);
      } catch (err) {
        console.error("Failed to delete service", err);
        return res
          .status(500)
          .json({ message: "Failed to delete service", error: String(err) });
      }
    }),
  );

  /**
   * Configuration endpoints
   * Persist annotation pipeline configurations per user.
   * Each configuration contains a mapping of pipeline slots to services.
   *
   * Routes:
   *   GET    /api/document/configurations          -> list user's configurations
   *   POST   /api/document/configurations          -> create new configuration
   *   PUT    /api/document/configurations/:id      -> update configuration
   *   DELETE /api/document/configurations/:id      -> delete configuration
   *   POST   /api/document/configurations/:id/activate -> set as active configuration
   *   GET    /api/document/configurations/active   -> get active configuration
   *
   * Protected by auth middleware (JWT). Requests should present a valid Bearer token.
   */

  // GET /api/document/configurations - list all configurations for the user
  route.get(
    "/configurations",
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log("GET /configurations - userId:", userId);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const configurations = await Configuration.find({ userId }).lean();
        console.log(
          `Found ${configurations.length} configurations for user ${userId}`,
        );
        return res.status(200).json(configurations);
      } catch (err) {
        console.error("Failed to fetch configurations", err);
        return res
          .status(500)
          .json({ message: "Failed to fetch configurations" });
      }
    }),
  );

  // GET /api/document/configurations/active - get active configuration for user
  route.get(
    "/configurations/active",
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log("GET /configurations/active - userId:", userId);
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const activeConfig = await Configuration.findOne({
          userId,
          isActive: true,
        }).lean();
        if (!activeConfig) {
          console.log(`No active configuration found for user ${userId}`);
          return res
            .status(404)
            .json({ message: "No active configuration found" });
        }
        console.log(`Found active configuration: ${activeConfig.name}`);
        return res.status(200).json(activeConfig);
      } catch (err) {
        console.error("Failed to fetch active configuration", err);
        return res
          .status(500)
          .json({ message: "Failed to fetch active configuration" });
      }
    }),
  );

  // POST /api/document/configurations - create a new configuration
  route.post(
    "/configurations",
    validateRequest({
      req: {
        body: z.object({
          name: z.string().min(1),
          services: z.record(z.any()).optional(),
          isActive: z.boolean().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log(
          "POST /configurations - userId:",
          userId,
          "body:",
          req.body,
        );
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { name, services, isActive } = req.body;

        // If this is set as active, deactivate all other configurations for this user
        if (isActive) {
          await Configuration.updateMany(
            { userId, isActive: true },
            { $set: { isActive: false } },
          );
        }

        const config = configurationDTO({ userId, name, services, isActive });
        const inserted = await config.save();
        console.log(
          `Created configuration: ${inserted.name} (${inserted._id})`,
        );
        return res.json(inserted).status(201);
      } catch (err) {
        console.error("Failed to create configuration", err);
        // handle duplicate key
        if (err && err.code === 11000) {
          return res
            .status(409)
            .json({ message: "Configuration with this name already exists" });
        }
        return res.status(500).json({
          message: "Failed to create configuration",
          error: String(err),
        });
      }
    }),
  );

  // PUT /api/document/configurations/:id - update a configuration
  route.put(
    "/configurations/:id",
    validateRequest({
      req: {
        params: z.object({ id: z.string().min(1) }),
        body: z.object({
          name: z.string().min(1).optional(),
          services: z.record(z.any()).optional(),
          isActive: z.boolean().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log(
          "PUT /configurations/:id - userId:",
          userId,
          "id:",
          req.params.id,
        );
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { id } = req.params;
        const update = req.body;

        // Verify the configuration belongs to the user
        const existingConfig = await Configuration.findOne({ _id: id, userId });
        if (!existingConfig) {
          console.log(`Configuration ${id} not found for user ${userId}`);
          return res.status(404).json({ message: "Configuration not found" });
        }

        // If setting this as active, deactivate all other configurations
        if (update.isActive) {
          await Configuration.updateMany(
            { userId, _id: { $ne: id }, isActive: true },
            { $set: { isActive: false } },
          );
        }

        const updated = await Configuration.findByIdAndUpdate(id, update, {
          new: true,
        });
        return res.json(updated).status(200);
      } catch (err) {
        console.error("Failed to update configuration", err);
        return res.status(500).json({
          message: "Failed to update configuration",
          error: String(err),
        });
      }
    }),
  );

  // POST /api/document/configurations/:id/activate - set configuration as active
  route.post(
    "/configurations/:id/activate",
    validateRequest({
      req: {
        params: z.object({ id: z.string().min(1) }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log(
          "POST /configurations/:id/activate - userId:",
          userId,
          "id:",
          req.params.id,
        );
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { id } = req.params;

        // Verify the configuration belongs to the user
        const existingConfig = await Configuration.findOne({ _id: id, userId });
        if (!existingConfig) {
          console.log(`Configuration ${id} not found for user ${userId}`);
          return res.status(404).json({ message: "Configuration not found" });
        }

        // Deactivate all other configurations for this user
        await Configuration.updateMany(
          { userId, _id: { $ne: id } },
          { $set: { isActive: false } },
        );

        // Activate this configuration
        const updated = await Configuration.findByIdAndUpdate(
          id,
          { $set: { isActive: true } },
          { new: true },
        );

        return res.json(updated).status(200);
      } catch (err) {
        console.error("Failed to activate configuration", err);
        return res.status(500).json({
          message: "Failed to activate configuration",
          error: String(err),
        });
      }
    }),
  );

  // DELETE /api/document/configurations/:id - delete a configuration
  route.delete(
    "/configurations/:id",
    validateRequest({
      req: {
        params: z.object({ id: z.string().min(1) }),
      },
    }),
    asyncRoute(async (req, res) => {
      try {
        const userId = req.user?.sub;
        console.log(
          "DELETE /configurations/:id - userId:",
          userId,
          "id:",
          req.params.id,
        );
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { id } = req.params;

        // Verify the configuration belongs to the user and delete it
        const deleted = await Configuration.findOneAndDelete({
          _id: id,
          userId,
        });
        if (!deleted) {
          console.log(`Configuration ${id} not found for user ${userId}`);
          return res.status(404).json({ message: "Configuration not found" });
        }
        console.log(`Deleted configuration: ${deleted.name} (${deleted._id})`);
        return res.json({ message: "deleted" }).status(200);
      } catch (err) {
        console.error("Failed to delete configuration", err);
        return res.status(500).json({
          message: "Failed to delete configuration",
          error: String(err),
        });
      }
    }),
  );

  /**
   * @swagger
   * /api/document/{id}/{deAnonimize}:
   *   get:
   *     summary: Get document by ID
   *     description: Retrieve a single document by its ID with optional de-anonymization
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *       - in: path
   *         name: deAnonimize
   *         required: false
   *         schema:
   *           type: string
   *           enum: [true, false]
   *         description: Whether to de-anonymize the document
   *     responses:
   *       200:
   *         description: Successfully retrieved document
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   *       404:
   *         description: Document not found
   */
  route.get(
    "/:id/:deAnonimize?",
    asyncRoute(async (req, res, next) => {
      const { id, deAnonimize } = req.params;
      const parsedDeAnonimize = deAnonimize === "true";
      console.log("doc id", id, parsedDeAnonimize);
      const document = await DocumentController.getFullDocById(
        id,
        true,
        false,
        parsedDeAnonimize,
      );
      console.log("doc", document.features.anonymized);
      return res.json(document).status(200);
    }),
  );
  /**
   * @swagger
   * /api/document/{id}/move-entities:
   *   post:
   *     summary: Move entities between clusters
   *     description: Move specified entities from source cluster to destination cluster
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/MoveEntitiesRequest'
   *     responses:
   *       200:
   *         description: Successfully moved entities
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.post(
    "/:id/move-entities",
    validateRequest({
      req: {
        body: z.object({
          entities: z.array(z.number()),
          annotationSet: z.string(),
          sourceCluster: z.number(),
          destinationCluster: z.number(),
        }),
      },
    }),
    asyncRoute(async (req, res, next) => {
      const { id } = req.params;
      console.log("doc id", id);
      const document = await DocumentController.getFullDocById(id);

      const { entities, annotationSet, sourceCluster, destinationCluster } =
        req.body;

      //find and delete source and destination clusters
      let source = document.features.clusters[annotationSet].find(
        (cluster) => cluster.id === sourceCluster,
      );
      document.features.clusters[annotationSet] = document.features.clusters[
        annotationSet
      ].filter((cluster) => cluster.id !== sourceCluster);
      let dest = document.features.clusters[annotationSet].find(
        (cluster) => cluster.id === destinationCluster,
      );
      document.features.clusters[annotationSet] = document.features.clusters[
        annotationSet
      ].filter((cluster) => cluster.id !== destinationCluster);
      //move entities
      let entObjects = source.mentions.filter((mention) =>
        entities.includes(mention.id),
      );
      source.mentions = source.mentions.filter(
        (mention) => !entities.includes(mention.id),
      );
      dest.mentions = dest.mentions.concat(entObjects);
      let clusters = [
        ...document.features.clusters[annotationSet],
        source,
        dest,
      ];
      let result = await DocumentController.updateClusters(
        id,
        annotationSet,
        clusters,
      );

      let doc = await DocumentController.getFullDocById(id);
      console.log("doc", doc.features.clusters[annotationSet]);
      return res.json(doc).status(200);
      //   let entObjects = [];
      //   for(let i=0; i<entities.length; i++){
    }),
  );

  async function moveEntities() {}

  /**
   * @swagger
   * /api/document/anon/{id}:
   *   get:
   *     summary: Get anonymous document by ID
   *     description: Retrieve a document with all database references removed
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *     responses:
   *       200:
   *         description: Successfully retrieved anonymous document
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.get(
    "/anon/:id",
    asyncRoute(async (req, res, next) => {
      const { id } = req.params;

      const document = await DocumentController.getFullDocById(id, true);

      return res.json(document).status(200);
    }),
  );

  /**
   * @swagger
   * /api/document/clusters/{id}:
   *   get:
   *     summary: Get document with clusters by ID
   *     description: Retrieve a document including cluster information
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *     responses:
   *       200:
   *         description: Successfully retrieved document with clusters
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.get(
    "/clusters/:id",
    asyncRoute(async (req, res, next) => {
      const { id } = req.params;

      const document = await DocumentController.getFullDocById(id, false, true);

      return res.json(document).status(200);
    }),
  );

  /**
   * @swagger
   * /api/document/deanonymize-key:
   *   post:
   *     summary: De-anonymize a single key
   *     description: Decrypt and return the original value for an anonymized key
   *     tags: [Documents]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateFeatureRequest'
   *     responses:
   *       200:
   *         description: Successfully de-anonymized key
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 key:
   *                   type: string
   *                 value:
   *                   type: string
   *       400:
   *         description: Error de-anonymizing key
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  route.post(
    "/deanonymize-key",
    validateRequest({
      req: {
        body: z.object({
          key: z.string(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const { key } = req.body;
      const result = await makeDecryptionRequest(key);

      if (result.error) {
        return res.status(400).json({
          error: result.error,
          key: result.fieldToDecrypt,
        });
      }

      return res
        .json({
          key: result.fieldToDecrypt,
          value: result.decryptedData,
        })
        .status(200);
    }),
  );

  /**
   * @swagger
   * /api/document/{id}:
   *   post:
   *     summary: Update a document
   *     description: Update an existing document by deleting and recreating it with new data
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateDocumentRequest'
   *     responses:
   *       200:
   *         description: Successfully updated document
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.post(
    "/:id",
    validateRequest({
      req: {
        body: z.object({
          text: z.string(),
          annotation_sets: z.object(),
          preview: z.string().optional(),
          name: z.string().optional(),
          features: z.object().optional(),
          offset_type: z.string().optional(),
          elasticIndex: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res, next) => {
      // delete document // TODO ROLLBACK on Failure
      const { id } = req.params;
      const { elasticIndex } = req.body;
      const deleteResults = await deleteDoc(
        { params: { docId: id } },
        null,
        next,
      );
      // new document object
      const pre_doc = req.body;
      pre_doc["id"] = id;
      const newDoc = documentDTO(req.body);
      console.log("newDoc", newDoc);
      const doc = await DocumentController.insertOne(newDoc);
      // insert each annnotation set
      await Promise.all(
        Object.values(req.body.annotation_sets).map(async (set) => {
          const { annotations: newAnnotations, ...rest } = set;
          const newAnnSet = annotationSetDTO({
            docId: doc.id,
            ...rest,
          });
          const annSet = await AnnotationSetController.insertOne(newAnnSet);
          // insert all annotations for a set
          const newAnnotationsDTOs = newAnnotations.map((ann) =>
            annotationDTO({ annotationSetId: annSet._id, ...ann }),
          );
          await Annotation.insertMany(newAnnotationsDTOs);

          return annSet;
        }),
      );

      if (elasticIndex) {
        const elasticUrl =
          process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";
        const indexUrl = `${elasticUrl}/${elasticIndex}/_doc`;
        try {
          await axios.post(indexUrl, doc.toObject());
        } catch (error) {
          console.error("Error posting to Elasticsearch:", error);
        }
      }

      return res.json(doc).status(200);
    }),
  );

  /**
   * @swagger
   * /api/document:
   *   post:
   *     summary: Create a new document
   *     description: Create a new document with text, annotations, and metadata
   *     tags: [Documents]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateDocumentRequest'
   *     responses:
   *       200:
   *         description: Successfully created document
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.post(
    "/",
    validateRequest({
      req: {
        body: z.object({
          text: z.string(),
          collectionId: z.string(),
          annotation_sets: z.object(),
          preview: z.string().optional(),
          name: z.string().optional(),
          features: z.object().optional(),
          offset_type: z.string().optional(),
          elasticIndex: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res, next) => {
      const { elasticIndex } = req.body;
      const doc = await DocumentController.insertFullDocument(req.body);

      if (elasticIndex) {
        const elasticUrl =
          process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";
        const indexUrl = `${elasticUrl}/${elasticIndex}/_doc`;
        console.log(
          `Attempting to index document to Elasticsearch: ${indexUrl}`,
        );

        try {
          // Fetch the full document with annotation sets for de-anonymization
          const fullDocument = await DocumentController.getFullDocById(
            doc.id,
            true,
            false,
            false,
          );

          // De-anonymize the document for generation context
          const deAnonymizedDoc = await decode(fullDocument);
          console.log("Document de-anonymized for Elasticsearch indexing");

          // Prepare payload with both anonymized and de-anonymized versions
          const elasticPayload = {
            id: doc.id, // Ensure id is included
            text: req.body.text, // Anonymized text
            text_deanonymized: deAnonymizedDoc.text, // De-anonymized text for generation
            collectionId: req.body.collectionId,
            annotation_sets: req.body.annotation_sets, // Keep annotations anonymized
            preview: req.body.preview, // Keep preview anonymized
            name: req.body.name,
            features: req.body.features,
            offset_type: req.body.offset_type,
          };

          console.log("Sending to Elasticsearch with both versions");
          const response = await axios.post(indexUrl, elasticPayload);
          console.log("Elasticsearch indexing successful:", response.data);
        } catch (error) {
          console.error("Error posting to Elasticsearch:", error.message);
          if (error.response) {
            console.error("Response status:", error.response.status);
            console.error("Response data:", error.response.data);
          }
          // Re-throw to make the error visible to the client
          throw new Error(
            `Failed to index document in Elasticsearch: ${error.message}`,
          );
        }
      }
      return res.status(200).json(doc);
    }),
  );

  /**
   * @swagger
   * /api/document/{docId}:
   *   delete:
   *     summary: Delete a document
   *     description: Delete a document and all its associated annotation sets and annotations
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: docId
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID to delete
   *     responses:
   *       200:
   *         description: Successfully deleted document
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Document'
   */
  route.delete("/:docId", asyncRoute(deleteDoc));

  /**
   * @swagger
   * /api/document/{docId}/annotation-set/{annotationSetId}:
   *   delete:
   *     summary: Delete an annotation set
   *     description: Delete a specific annotation set and all its annotations
   *     tags: [Documents]
   *     parameters:
   *       - in: path
   *         name: docId
   *         required: true
   *         schema:
   *           type: number
   *         description: Document ID
   *       - in: path
   *         name: annotationSetId
   *         required: true
   *         schema:
   *           type: string
   *         description: Annotation Set ID to delete
   *     responses:
   *       200:
   *         description: Successfully deleted annotation set
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 acknowledged:
   *                   type: boolean
   *                 deletedCount:
   *                   type: integer
   */
  route.delete(
    "/:docId/annotation-set/:annotationSetId",
    asyncRoute(async (req, res, next) => {
      const { docId, annotationSetId } = req.params;

      const result = await AnnotationSet.deleteOne({
        _id: annotationSetId,
      });
      await Annotation.deleteMany({ annotationSetId });
      return res.json(result);
    }),
  );
};
