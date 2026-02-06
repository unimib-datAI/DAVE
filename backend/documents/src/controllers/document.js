import crypto from "crypto";
import { Document } from "../models/document";
import { AnnotationSet } from "../models/annotationSet";
import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";
import { annotationSetDTO } from "../models/annotationSet";
import { AnnotationSetController } from "./annotationSet";
import { Annotation, annotationDTO } from "../models/annotation";
import { CollectionController } from "./collection";
import axios from "axios";
import { decode } from "../utils/anonymization";

// Cache for anonymization service health check
let anonymizationServiceAvailable = null;
let lastAnonymizationHealthCheck = 0;
const ANONYMIZATION_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

async function checkAnonymizationService() {
  const endpoint =
    process.env.ANONYMIZATION_ENDPOINT || "http://10.0.0.108:8081";
  const now = Date.now();

  // Return cached status if checked recently
  if (
    anonymizationServiceAvailable !== null &&
    now - lastAnonymizationHealthCheck < ANONYMIZATION_HEALTH_CHECK_INTERVAL
  ) {
    return anonymizationServiceAvailable;
  }

  try {
    await axios.get(endpoint, { timeout: 1000 });
    anonymizationServiceAvailable = true;
    lastAnonymizationHealthCheck = now;
    return true;
  } catch (error) {
    anonymizationServiceAvailable = false;
    lastAnonymizationHealthCheck = now;
    return false;
  }
}

const getStringHash = (inputString) => {
  return crypto.createHash("sha256").update(inputString).digest("hex");
};

const removeSurrogates = (text) => {
  if (typeof text !== "string") return text;
  // Remove surrogate pairs and unpaired surrogates to match Python's surrogatepass decode ignore
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]?|[\uDC00-\uDFFF]/g, "");
};

export const DocumentController = {
  insertFullDocument: async (obj) => {
    try {
      // Clean document
      const fieldsToRemove = ["_id", "inc_id", "__v", "edited"];
      fieldsToRemove.forEach((field) => delete obj[field]);

      // Generate id as hash of text if not provided
      const text = obj.text || "";
      const docId = obj.id || getStringHash(text);
      const collectionId = obj.collectionId || "";
      console.log("received collection id ", collectionId);
      // Remove surrogates from text
      const cleanText = removeSurrogates(text);

      // Set preview
      const preview = obj.preview || cleanText.slice(0, 100) + "...";

      // Create document data
      const documentData = {
        text: cleanText,
        preview,
        name: obj.name || "",
        features: obj.features || {},
        offset_type: obj.offset_type,
        id: docId,
        collectionId: collectionId,
      };

      const doc = new Document(documentData);
      await doc.save();

      // Process annotation sets
      const annotation_sets = obj.annotation_sets || {};
      const annsetIdMap = {};
      for (const [name, annset] of Object.entries(annotation_sets)) {
        // Clean annset
        delete annset._id;
        const annRecord = {
          name,
          docId,
          next_annid: annset.next_annid || 1,
        };
        const newAnnSet = new AnnotationSet(annRecord);
        const inserted = await newAnnSet.save();
        annsetIdMap[name] = inserted._id;
      }

      // Process annotations

      for (const [name, annset] of Object.entries(annotation_sets)) {
        for (const annotation of annset.annotations || []) {
          const ann = { ...annotation };
          delete ann._id;
          delete ann.annotationSetId;
          if (ann.features && ann.features.mention) {
            ann.features.mention = removeSurrogates(ann.features.mention);
          }
          ann.annotationSetId = annsetIdMap[name];
          const newAnn = new Annotation(ann);
          await newAnn.save();
        }
      }

      return doc;
    } catch (err) {
      throw new HTTPError({
        code: HTTP_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: `Could not process and insert document. ${err}`,
      });
    }
  },
  updateClusters: async (docId, annSet, clusters) => {
    try {
      const query = { id: docId };
      const update = {
        $set: {
          [`features.clusters.${annSet}`]: clusters, // Replace 'nestedField.subField' with the actual path and 'newValue' with the new value
        },
      };
      const result = await Document.findOneAndUpdate(query, update, {
        new: true,
      });
      console.log("update result", result);
      return result;
    } catch (error) {
      throw new HTTPError({
        code: HTTP_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: `Could not update document. ${error}`,
      });
    }
  },
  updateDocumentFeatures: async (docId, features) => {
    try {
      console.log("=== UPDATE DOCUMENT FEATURES ===");
      console.log("docId:", docId);
      console.log("features to update:", JSON.stringify(features, null, 2));

      const query = { id: docId };
      console.log("MongoDB query:", JSON.stringify(query, null, 2));

      const update = {
        $set: {
          features: features,
        },
      };
      console.log("MongoDB update:", JSON.stringify(update, null, 2));

      // First check if document exists
      const existingDoc = await Document.findOne(query);
      console.log("Existing document found:", existingDoc ? "YES" : "NO");
      if (existingDoc) {
        console.log("Existing document ID:", existingDoc._id);
        console.log(
          "Existing document features:",
          JSON.stringify(existingDoc.features, null, 2),
        );
      }

      const result = await Document.findOneAndUpdate(query, update, {
        new: true,
      });
      console.log("Update result:", result ? "SUCCESS" : "FAILED");
      if (result) {
        console.log("Updated document ID:", result._id);
        console.log(
          "Updated features:",
          JSON.stringify(result.features, null, 2),
        );
      }
      console.log("=== UPDATE DOCUMENT FEATURES COMPLETED ===");
      return result;
    } catch (error) {
      console.error("=== UPDATE DOCUMENT FEATURES ERROR ===");
      console.error("Error details:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      throw new HTTPError({
        code: HTTP_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: `Could not update document features. ${error}`,
      });
    }
  },
  insertOne: async (document) => {
    try {
      const doc = await document.save().then((doc) => {
        if (doc.id === undefined) {
          doc.id = doc.inc_id;
        }
        return doc.save();
      });
      return doc;
    } catch (err) {
      throw new HTTPError({
        code: HTTP_ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: `Could not save document to DB. ${err}`,
      });
    }
  },
  findAll: async (q = "", limit = 20, page = 1) => {
    const query = {
      ...(q && {
        name: { $regex: q, $options: "i" },
      }),
    };

    const options = {
      select: ["_id", "id", "name", "preview"],
      page,
      limit,
    };

    return Document.paginate(query, options);
  },
  findOne: async (id) => {
    const doc = await Document.findOne({ id }).lean();
    if (!doc) {
      throw new HTTPError({
        code: HTTP_ERROR_CODES.NOT_FOUND,
        message: `Document with id '${id}' was not found.`,
      });
    }
    if (!doc.id) {
      doc.id = id.toString();
    }

    const annotationSets = await AnnotationSet.find({ docId: id }).lean();

    const annotationSetsWithAnnotations = await Promise.all(
      annotationSets.map(async (annSet) => {
        const annotations = await Annotation.find({
          annotationSetId: annSet._id,
        }).lean();
        return {
          ...annSet,
          annotations,
        };
      }),
    );

    return {
      ...doc,
      annotation_sets: annotationSetsWithAnnotations,
    };
  },
  updateEntitiesAnnotationSet: async (docId, annotationSets) => {
    const update = async (annotationSet) => {
      const {
        annotations: newAnnotations,
        _id: annotationSetId,
        ...set
      } = annotationSet;
      // add new annotation set
      const newAnnotationSet = annotationSetDTO({ ...set, docId });
      const annSet = await newAnnotationSet.save();
      // add annoations for this set
      const annotationsDTOs = newAnnotations.map(({ _id, ...ann }) =>
        annotationDTO({ ...ann, annotationSetId: annSet._id }),
      );
      const annotations = await Annotation.insertMany(annotationsDTOs);

      return {
        ...annSet.toObject(),
        annotations,
      };
    };

    const oldAnnotationSets = await AnnotationSet.find({ docId });
    await AnnotationSet.deleteMany({ docId });
    // delete annotations for each annotation set
    for (const annSet of oldAnnotationSets) {
      await Annotation.deleteMany({ annotationSetId: annSet._id });
    }
    // update with new annotation sets
    const updaters = Object.values(annotationSets).map((set) => update(set));
    return Promise.all(updaters);
  },
  deleteDocumentsByCollectionId: async (collectionId, userId, elasticIndex) => {
    let permissionRes = await CollectionController.hasAccess(
      collectionId,
      userId,
    );
    if (!permissionRes) throw new Error("User has no access to the collection");
    //get all doc ids to delete
    const docIds = await Document.distinct("id", {
      collectionId: collectionId,
    });
    //get annotation sets related to the document
    let annSetsIds = (
      await AnnotationSet.find({ docId: { $in: docIds } })
        .select("_id")
        .lean()
    ).map((set) => set._id);
    //delete all annotations referenced to the annotation sets of the documents
    await Annotation.deleteMany({ annotationSetId: { $in: annSetsIds } });
    //delete all annotationSets
    await AnnotationSet.deleteMany({ docId: { $in: docIds } });
    //delete all docs
    await Document.deleteMany({ collectionId });
    // Delete docs from elastic index
    const elasticUrl =
      process.env.QAVECTORIZER_ADDRESS || "http://qavectorizer:7863";

    for (const docId of docIds) {
      try {
        await axios.delete(
          `${elasticUrl}/elastic/index/${elasticIndex}/doc/${docId}`,
        );
      } catch (error) {
        console.error(
          `Error deleting document ${docId} from Elasticsearch:`,
          error.message,
        );
      }
    }
    console.log("ann sets ids", annSetsIds);
  },

  getFullDocById: async (
    id,
    anonymous = false,
    clusters = false,
    deAnonimize = false,
  ) => {
    const document = await DocumentController.findOne(id);
    // Ensure document.text is a string
    if (typeof document.text !== "string") {
      console.error(
        "document.text is not a string, type:",
        typeof document.text,
      );
      document.text = String(document.text || "");
    }
    // Ensure document.preview is a string
    if (typeof document.preview !== "string") {
      console.error(
        "document.preview is not a string, type:",
        typeof document.preview,
      );
      document.preview = String(document.preview || "");
    }
    // Ensure document.annotation_sets is an array
    if (!Array.isArray(document.annotation_sets)) {
      console.error(
        "document.annotation_sets is not an array, type:",
        typeof document.annotation_sets,
      );
      document.annotation_sets = [];
    }
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
            // Validate start and end to prevent substring errors
            const start = Math.max(0, annot.start);
            const end = Math.min(
              document.text.length,
              Math.max(start, annot.end + 1),
            );
            annot.features.mention = document.text.substring(start, end);
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
      // Check if anonymization service is available before attempting decode

      try {
        let doc = await decode(document);
        console.log("doc decoded", doc.text.substring(0, 200));
        return doc;
      } catch (decryptError) {
        console.warn(
          "Decryption failed during getFullDocById, returning original document",
        );
        return document;
      }
    }

    return document;
  },
};
