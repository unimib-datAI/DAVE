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
   * Get document helper function
   *
   * anonymous: delete any reference to the database (they may be useful for updating the doc)
   */
  async function getDocumentById(
    id,
    anonymous = false,
    clusters = false,
    deAnonimize = false,
  ) {
    const document = await DocumentController.findOne(id);
    console.log("doc found", document.text.substring(0, 200));
    // convert annotation_sets from list to object
    var new_sets = {};
    for (const annset of document.annotation_sets) {
      // delete annset._id;

      // deduplicate sections
      if (annset.name === "Sections") {
        const new_anns = [];
        let prev_ann = {};

        annset.annotations.sort((a, b) => a.start - b.start);

        annset.annotations.forEach((ann) => {
          if (ann.type === prev_ann.type) {
            // found duplicate
            if (ann.end >= prev_ann.end) {
              new_anns.push(ann);
            } else {
              new_anns.push(prev_ann);
            }
          } else if (Object.keys(prev_ann).length !== 0) {
            new_anns.push(prev_ann);
          }
          prev_ann = ann;
        });
        // possible outcomes: 1) prev_ann is a duplicated and a better ann has been already added
        // 2) prev_ann is not a duplicated and the last ann is of a different type
        if (new_anns[new_anns.length - 1].type !== prev_ann.type) {
          // in case of 2)
          new_anns.push(prev_ann);
        }

        annset.annotations = new_anns;
      }

      // add mention to annotations features
      if (annset.name.startsWith("entities")) {
        console.log("*** processing entities annset ***");
        for (const annot of annset.annotations) {
          if (!("features" in annot)) {
            annot.features = {};
          }
          if (!("mention" in annot.features)) {
            // console.log(
            //     `Adding mention ${document.text.substring(
            //         annot.start,
            //         annot.end + 2,
            //     )} `,
            // );
            annot.features.mention = document.text.substring(
              annot.start,
              annot.end + 1,
            );
          }
          // workaround for issue 1 // TODO remove
          if (typeof annot.id === "string" || annot.id instanceof String) {
            annot.id = parseInt(annot.id);
          }
        }
      }

      // WORKAROUND anonymize preview TODO resolve
      if (annset.name.startsWith("entities_consolidated")) {
        for (const annot of annset.annotations) {
          if (
            ["persona", "parte", "controparte", "luogo", "altro"].includes(
              annot.type,
            ) &&
            annot.start < document.preview.length
          ) {
            var end = 0;
            if (annot.end >= document.preview.length) {
              end = document.preview.length - 1;
            } else {
              end = annot.end;
            }
            document.preview =
              document.preview.substring(0, annot.start) +
              "*".repeat(end - annot.start) +
              document.preview.substring(end);
          }
        }
      }
      // WORKAROUND codici fiscali
      const regexPattern = /[A-Za-z0-9]{16}/;

      document.preview = document.preview.replace(regexPattern, (match) =>
        "*".repeat(match.length),
      );

      for (const annot of annset.annotations) {
        // workaround for issue 1 // TODO remove
        if (typeof annot.id === "string" || annot.id instanceof String) {
          annot.id = parseInt(annot.id);
        }
      }

      if (anonymous) {
        delete annset["_id"];
        delete annset["__v"];
        delete annset["docId"];
        for (const annot of annset.annotations) {
          // remove references to db
          delete annot["_id"];
          delete annot["__v"];
          delete annot["annotationSetId"];
        }
      }

      // ensure annset is sorted
      annset.annotations.sort((a, b) => a.start - b.start);

      new_sets[annset.name] = annset;
    }
    document.annotation_sets = new_sets;

    if (anonymous) {
      delete document["_id"];
      delete document["__v"];
      if ("features" in document) {
        if ("save" in document["features"]) {
          delete document["features"]["save"];
        }
        if ("reannotate" in document["features"]) {
          delete document["features"]["reannotate"];
        }
      }
    }

    if (!clusters && document.features && document.features.clusters) {
      for (const [annset_name, annset_clusters] of Object.entries(
        document.features.clusters,
      )) {
        for (let i = 0; i < annset_clusters.length; i++) {
          delete annset_clusters[i]["center"];
        }
      }
    }
    if (deAnonimize) {
      let doc = await decode(document);
      console.log("doc decoded", doc.text.substring(0, 200));

      return doc;
    }

    return document;
  }

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
      const document = await getDocumentById(
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
      const document = await getDocumentById(id);

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

      let doc = await getDocumentById(id);
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

      const document = await getDocumentById(id, true);

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

      const document = await getDocumentById(id, false, true);

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
          const fullDocument = await getDocumentById(
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
