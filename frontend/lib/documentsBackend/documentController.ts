// Ported from backend/documents/src/controllers/document.js
import crypto from 'crypto';
import { DocumentModel } from '../db/models/Document';
import { AnnotationSetModel, annotationSetDTO } from '../db/models/AnnotationSet';
import { AnnotationModel, annotationDTO } from '../db/models/Annotation';
import { decode } from './anonymization';
import { deleteElasticDocument } from '../elasticAdmin';
import { CollectionController } from './collectionController';
import { dbConnect } from '../db/connection';

const getStringHash = (inputString: string) => {
  return crypto.createHash('sha256').update(inputString).digest('hex');
};

const removeSurrogates = (text: any) => {
  if (typeof text !== 'string') return text;
  // Remove surrogate pairs and unpaired surrogates to match Python's surrogatepass decode ignore
  return text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]?|[\uDC00-\uDFFF]/g, '');
};

export const DocumentController = {
  insertFullDocument: async (obj: any) => {
    await dbConnect();
    try {
      // Clean document
      const fieldsToRemove = ['_id', 'inc_id', '__v', 'edited'];
      fieldsToRemove.forEach((field) => delete obj[field]);

      // Generate id as hash of text if not provided
      const text = obj.text || '';
      const docId = obj.id || getStringHash(text);
      const collectionId = obj.collectionId || '';
      // Remove surrogates from text
      const cleanText = removeSurrogates(text);

      // Set preview
      const preview = obj.preview || cleanText.slice(0, 100) + '...';

      // Create document data
      const documentData = {
        text: cleanText,
        preview,
        name: obj.name || '',
        features: obj.features || {},
        offset_type: obj.offset_type,
        id: docId,
        collectionId: collectionId,
      };

      const doc = new DocumentModel(documentData);
      await doc.save();

      // Process annotation sets
      const annotation_sets = obj.annotation_sets || {};
      const annsetIdMap: Record<string, any> = {};
      for (const [name, annset] of Object.entries<any>(annotation_sets)) {
        // Clean annset
        delete annset._id;
        const annRecord = {
          name,
          docId,
          next_annid: annset.next_annid || 1,
        };
        const newAnnSet = new AnnotationSetModel(annRecord);
        const inserted = await newAnnSet.save();
        annsetIdMap[name] = inserted._id;
      }

      // Process annotations
      for (const [name, annset] of Object.entries<any>(annotation_sets)) {
        for (const annotation of annset.annotations || []) {
          const ann = { ...annotation };
          delete ann._id;
          delete ann.annotationSetId;
          if (ann.features && ann.features.mention) {
            ann.features.mention = removeSurrogates(ann.features.mention);
          }
          ann.annotationSetId = annsetIdMap[name];
          const newAnn = new AnnotationModel(ann);
          await newAnn.save();
        }
      }

      return doc;
    } catch (err) {
      throw new Error(`Could not process and insert document. ${err}`);
    }
  },

  updateClusters: async (docId: string, annSet: string, clusters: any) => {
    await dbConnect();
    try {
      const query = { id: docId };
      const update = {
        $set: {
          [`features.clusters.${annSet}`]: clusters,
        },
      };
      return await DocumentModel.findOneAndUpdate(query, update, { new: true });
    } catch (error) {
      throw new Error(`Could not update document. ${error}`);
    }
  },

  updateDocumentFeatures: async (docId: string, features: any) => {
    await dbConnect();
    try {
      const query = { id: docId };
      const update = { $set: { features } };
      return await DocumentModel.findOneAndUpdate(query, update, { new: true });
    } catch (error) {
      console.error('Error details:', error);
      throw new Error(`Could not update document features. ${error}`);
    }
  },

  insertOne: async (document: any) => {
    await dbConnect();
    try {
      const doc = await document.save().then((doc: any) => {
        if (doc.id === undefined) {
          doc.id = doc.inc_id;
        }
        return doc.save();
      });
      return doc;
    } catch (err) {
      throw new Error(`Could not save document to DB. ${err}`);
    }
  },

  findAll: async (q = '', limit = 20, page = 1) => {
    await dbConnect();
    const query = {
      ...(q && {
        name: { $regex: q, $options: 'i' },
      }),
    };

    const options = {
      select: ['_id', 'id', 'name', 'preview'],
      page,
      limit,
    };

    return (DocumentModel as any).paginate(query, options);
  },

  // `id` is a content hash, not a globally-unique key - the same source
  // file uploaded into two different collections produces two Document
  // records with the identical `id` but different `collectionId`. When the
  // caller knows which collection it means (e.g. the document was opened
  // from that collection's context), pass `collectionId` to disambiguate;
  // otherwise this returns whichever duplicate Mongo happens to match first.
  findOne: async (id: string, docProjection: any = null, collectionId?: string): Promise<any> => {
    await dbConnect();
    const query: Record<string, any> = { id };
    if (collectionId) query.collectionId = collectionId;
    const doc: any = await DocumentModel.findOne(query, docProjection || {}).lean();
    if (!doc) {
      throw new Error(`Document with id '${id}' was not found.`);
    }
    if (!doc.id) {
      doc.id = id.toString();
    }

    const annotationSets = await AnnotationSetModel.find({ docId: id }).lean();

    // When a doc projection is provided (light fetch for the frontend), also strip
    // heavy-but-unused subfields from every annotation:
    //   - features.ner        : NLP pipeline metadata, never displayed
    //   - features.linking.candidates : full candidate roster; only top_candidate
    //                                   and is_nil are read by the frontend
    //   - __v                 : Mongoose internal version key
    const annProjection = docProjection
      ? { __v: 0, 'features.ner': 0, 'features.linking.candidates': 0 }
      : {};

    const annotationSetsWithAnnotations = await Promise.all(
      annotationSets.map(async (annSet: any) => {
        const annotations = await AnnotationModel.find(
          { annotationSetId: annSet._id },
          annProjection
        ).lean();
        return {
          ...annSet,
          annotations,
        };
      })
    );

    return {
      ...doc,
      annotation_sets: annotationSetsWithAnnotations,
    };
  },

  updateEntitiesAnnotationSet: async (docId: string, annotationSets: Record<string, any>) => {
    await dbConnect();
    const update = async (annotationSet: any) => {
      const { annotations: newAnnotations, _id: annotationSetId, ...set } = annotationSet;
      // add new annotation set
      const newAnnotationSet = annotationSetDTO({ ...set, docId });
      const annSet = await newAnnotationSet.save();
      // add annotations for this set
      const annotationsDTOs = newAnnotations.map(({ _id, ...ann }: any) =>
        annotationDTO({ ...ann, annotationSetId: annSet._id })
      );
      const annotations = await AnnotationModel.insertMany(annotationsDTOs);

      return {
        ...(annSet as any).toObject(),
        annotations,
      };
    };

    const oldAnnotationSets = await AnnotationSetModel.find({ docId });
    await AnnotationSetModel.deleteMany({ docId });
    // delete annotations for each annotation set
    for (const annSet of oldAnnotationSets) {
      await AnnotationModel.deleteMany({ annotationSetId: annSet._id });
    }
    // update with new annotation sets
    const updaters = Object.values(annotationSets).map((set) => update(set));
    return Promise.all(updaters);
  },

  deleteDocumentsByCollectionId: async (
    collectionId: string,
    userId: string,
    elasticIndex: string
  ) => {
    await dbConnect();
    const permissionRes = await CollectionController.hasAccess(collectionId, userId);
    if (!permissionRes) throw new Error('User has no access to the collection');
    // get all doc ids to delete
    const docIds = await DocumentModel.distinct('id', { collectionId });
    // get annotation sets related to the document
    const annSetsIds = (
      await AnnotationSetModel.find({ docId: { $in: docIds } })
        .select('_id')
        .lean()
    ).map((set: any) => set._id);
    // delete all annotations referenced to the annotation sets of the documents
    await AnnotationModel.deleteMany({ annotationSetId: { $in: annSetsIds } });
    // delete all annotationSets
    await AnnotationSetModel.deleteMany({ docId: { $in: docIds } });
    // delete all docs
    await DocumentModel.deleteMany({ collectionId });
    // Delete docs from elastic index (in-process now, no HTTP hop needed)
    for (const docId of docIds) {
      try {
        await deleteElasticDocument(elasticIndex, String(docId));
      } catch (error: any) {
        console.error(`Error deleting document ${docId} from Elasticsearch:`, error.message);
      }
    }
  },

  getFullDocById: async (
    id: string,
    anonymous = false,
    clusters = false,
    deAnonimize = false,
    lightFeatures = false,
    // Disambiguates between duplicate Document records sharing the same
    // content-hash `id` across different collections (see findOne() above).
    collectionId?: string
  ): Promise<any> => {
    await dbConnect();
    // Whitelist of features sub-fields needed by the frontend.
    // Only applied when lightFeatures=true (i.e. for frontend-facing API routes).
    // Export / pipeline routes should call with lightFeatures=false to preserve
    // the full features object.
    const FEATURES_PROJECTION = lightFeatures
      ? {
          id: 1,
          _id: 1,
          name: 1,
          preview: 1,
          text: 1,
          offset_type: 1,
          collectionId: 1,
          // Core features used by DocumentProvider / reducer
          'features.clusters': 1,
          'features.anonymized': 1,
          // DocumentMetadataFeatures fields shown in SidebarMetadataDetails
          'features.annoruolo': 1,
          'features.annosentenza': 1,
          'features.attestazione': 1,
          'features.cf_giudice': 1,
          'features.codicegl': 1,
          'features.codiceoggetto': 1,
          'features.codiceruolo': 1,
          'features.codicesezione': 1,
          'features.codicestato': 1,
          'features.codiceufficio': 1,
          'features.controparte': 1,
          'features.doc_meta_autore': 1,
          'features.do_meta_data_creazione': 1,
          'features.doc_meta_tipo': 1,
          'features.fascicoloprecedente_annoruolo': 1,
          'features.fascicoloprecedente_annosentenza': 1,
          'features.fascicoloprecedente_codiceufficio': 1,
          'features.fascicoloprecedente_idfasc': 1,
          'features.fascicoloprecedente_numeroruolo': 1,
          'features.fascicoloprecedente_numerosentenza': 1,
          'features.fascicoloprecedente_registro': 1,
          'features.gradogiudizio': 1,
          'features.id': 1,
          'features.idatto': 1,
          'features.idfasc': 1,
          'features.name': 1,
          'features.neo4j_id': 1,
          'features.nomegiudice': 1,
          'features.number_of_messages': 1,
          'features.numeroruolo': 1,
          'features.numerosentenza': 1,
          'features.parte': 1,
          'features.participants': 1,
          'features.start_time': 1,
          'features.title': 1,
        }
      : null;
    const document: any = await DocumentController.findOne(id, FEATURES_PROJECTION, collectionId);
    // Ensure document.text is a string
    if (typeof document.text !== 'string') {
      console.error('document.text is not a string, type:', typeof document.text);
      document.text = String(document.text || '');
    }
    // Ensure document.preview is a string
    if (typeof document.preview !== 'string') {
      console.error('document.preview is not a string, type:', typeof document.preview);
      document.preview = String(document.preview || '');
    }
    // Ensure document.annotation_sets is an array
    if (!Array.isArray(document.annotation_sets)) {
      console.error(
        'document.annotation_sets is not an array, type:',
        typeof document.annotation_sets
      );
      document.annotation_sets = [];
    }
    // convert annotation_sets from list to object
    const new_sets: Record<string, any> = {};
    for (const annset of document.annotation_sets) {
      // deduplicate sections
      if (annset.name === 'Sections') {
        const new_anns: any[] = [];
        let prev_ann: any = {};

        annset.annotations.sort((a: any, b: any) => a.start - b.start);

        annset.annotations.forEach((ann: any) => {
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
        if (new_anns.length === 0 || new_anns[new_anns.length - 1].type !== prev_ann.type) {
          // in case of 2)
          new_anns.push(prev_ann);
        }

        annset.annotations = new_anns;
      }

      // add mention to annotations features
      if (annset.name.startsWith('entities')) {
        for (const annot of annset.annotations) {
          if (!('features' in annot)) {
            annot.features = {};
          }
          if (!('mention' in annot.features)) {
            // Validate start and end to prevent substring errors
            const start = Math.max(0, annot.start);
            const end = Math.min(document.text.length, Math.max(start, annot.end + 1));
            annot.features.mention = document.text.substring(start, end);
          }
          // workaround for issue 1 // TODO remove
          if (typeof annot.id === 'string' || annot.id instanceof String) {
            annot.id = parseInt(annot.id as any, 10);
          }
        }
      }

      // WORKAROUND anonymize preview TODO resolve
      if (annset.name.startsWith('entities_consolidated')) {
        for (const annot of annset.annotations) {
          if (
            ['persona', 'parte', 'controparte', 'luogo', 'altro'].includes(annot.type) &&
            annot.start < document.preview.length
          ) {
            let end = 0;
            if (annot.end >= document.preview.length) {
              end = document.preview.length - 1;
            } else {
              end = annot.end;
            }
            document.preview =
              document.preview.substring(0, annot.start) +
              '*'.repeat(end - annot.start) +
              document.preview.substring(end);
          }
        }
      }
      // WORKAROUND codici fiscali
      const regexPattern = /[A-Za-z0-9]{16}/;

      document.preview = document.preview.replace(regexPattern, (match: string) =>
        '*'.repeat(match.length)
      );

      for (const annot of annset.annotations) {
        // workaround for issue 1 // TODO remove
        if (typeof annot.id === 'string' || annot.id instanceof String) {
          annot.id = parseInt(annot.id as any, 10);
        }
      }

      if (anonymous) {
        delete annset['_id'];
        delete annset['__v'];
        delete annset['docId'];
        for (const annot of annset.annotations) {
          // remove references to db
          delete annot['_id'];
          delete annot['__v'];
          delete annot['annotationSetId'];
        }
      }

      // ensure annset is sorted
      annset.annotations.sort((a: any, b: any) => a.start - b.start);

      new_sets[annset.name] = annset;
    }
    document.annotation_sets = new_sets;

    if (anonymous) {
      delete document['_id'];
      delete document['__v'];
      if ('features' in document) {
        if ('save' in document['features']) {
          delete document['features']['save'];
        }
        if ('reannotate' in document['features']) {
          delete document['features']['reannotate'];
        }
      }
    }

    if (!clusters && document.features && document.features.clusters) {
      for (const [, annset_clusters] of Object.entries<any>(document.features.clusters)) {
        for (let i = 0; i < annset_clusters.length; i++) {
          delete annset_clusters[i]['center'];
        }
      }
    }
    if (deAnonimize) {
      // Check if anonymization service is available before attempting decode
      try {
        const doc = await decode(document);
        return doc;
      } catch (decryptError) {
        console.warn('Decryption failed during getFullDocById, returning original document');
        return document;
      }
    }

    return document;
  },
};
