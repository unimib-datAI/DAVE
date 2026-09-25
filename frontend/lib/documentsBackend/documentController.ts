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

/**
 * Mongo filter selecting the annotation sets of document `docId` in
 * `collectionId`. Document ids are content hashes shared across collections,
 * so filtering by `docId` alone returns (or deletes) every copy's sets.
 *
 * Sets created before `collectionId` was stored on them have none. For an id
 * no other collection uses they're unambiguous and always included. For a
 * shared id, reads fall back to them only when the collection has no scoped
 * sets yet (the pre-fix behavior), while writes (`forWrite`) never touch
 * them - they may belong to another collection's copy. Saving such a
 * document creates scoped sets, which reads prefer from then on.
 */
export async function annotationSetScope(
  docId: string,
  collectionId?: string | null,
  { forWrite = false }: { forWrite?: boolean } = {}
): Promise<Record<string, any>> {
  if (!collectionId) return { docId };
  const copies = await DocumentModel.countDocuments({ id: docId });
  if (copies <= 1) return { docId, collectionId: { $in: [collectionId, null] } };
  if (forWrite) return { docId, collectionId };
  const hasScoped = await AnnotationSetModel.exists({ docId, collectionId });
  return hasScoped ? { docId, collectionId } : { docId, collectionId: null };
}

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
      const collectionId = obj.collectionId || '';
      let docId = obj.id || getStringHash(text);

      // Remove surrogates from text
      const cleanText = removeSurrogates(text);

      // Set preview
      const preview = obj.preview || cleanText.slice(0, 100) + '...';

      // De-duplicate auto-generated ids. The document id is a content hash,
      // so uploading the identical file again (or two overlapping uploads
      // of it - e.g. a double-submitted request) would otherwise try to
      // reuse the same id, producing multiple Mongo rows that share it.
      // That makes findOne/getFullDocById/ES updates ambiguous, and since
      // annotation sets are linked only by this id, silently corrupts
      // annotation data: getFullDocById collapses same-docId annotation
      // sets into an object keyed by name, so duplicate rows overwrite each
      // other there and drop annotations that document.features.clusters
      // still references by id. Sharing an id across *different*
      // collections is intentional (same source file in two collections,
      // disambiguated by collectionId), so only disambiguate within the
      // same collection, and only when we generated the id ourselves (an
      // explicit obj.id, e.g. an editor re-save, must stay stable).
      //
      // A plain "check then insert" has a race window between two
      // concurrent uploads of identical content, so uniqueness is actually
      // enforced by the {id, collectionId} unique index on DocumentModel -
      // retry here on that index's duplicate-key error (11000), not just a
      // pre-check, to close that window.
      let doc: any;
      for (let attempt = 1; attempt <= 1000; attempt++) {
        const documentData = {
          text: cleanText,
          preview,
          name: obj.name || '',
          features: obj.features || {},
          offset_type: obj.offset_type,
          id: docId,
          collectionId: collectionId,
        };
        doc = new DocumentModel(documentData);
        try {
          await doc.save();
          break;
        } catch (err: any) {
          if (!obj.id && err?.code === 11000) {
            docId = getStringHash(`${text} ${collectionId} ${attempt}`);
            continue;
          }
          throw err;
        }
      }

      // Process annotation sets
      const annotation_sets = obj.annotation_sets || {};
      const annsetIdMap: Record<string, any> = {};
      for (const [name, annset] of Object.entries<any>(annotation_sets)) {
        // Clean annset
        delete annset._id;
        const annRecord = {
          name,
          docId,
          collectionId,
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

    // Scope by the collection of the document actually found (not just the
    // caller's optional collectionId), so text and annotations always come
    // from the same copy even when the caller didn't disambiguate.
    const annotationSets = await AnnotationSetModel.find(
      await annotationSetScope(id, doc.collectionId)
    ).lean();

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

  updateEntitiesAnnotationSet: async (
    docId: string,
    annotationSets: Record<string, any>,
    collectionId?: string
  ) => {
    await dbConnect();
    const update = async (annotationSet: any) => {
      const {
        annotations: newAnnotations,
        _id: annotationSetId,
        collectionId: _ignored,
        ...set
      } = annotationSet;
      // add new annotation set
      const newAnnotationSet = annotationSetDTO({ ...set, docId, collectionId });
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

    const oldAnnotationSets = await AnnotationSetModel.find(
      await annotationSetScope(docId, collectionId, { forWrite: true })
    );
    const oldIds = oldAnnotationSets.map((annSet) => annSet._id);
    await AnnotationSetModel.deleteMany({ _id: { $in: oldIds } });
    await AnnotationModel.deleteMany({ annotationSetId: { $in: oldIds } });
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
    // Doc ids are content hashes that other collections may share - only
    // this collection's annotation sets may go (legacy unscoped sets only
    // for ids no other collection uses).
    const sharedIds = await DocumentModel.distinct('id', {
      id: { $in: docIds },
      collectionId: { $ne: collectionId },
    });
    const unsharedIds = docIds.filter((id: any) => !sharedIds.includes(id));
    const annSetsIds = (
      await AnnotationSetModel.find({
        $or: [
          { docId: { $in: docIds }, collectionId },
          { docId: { $in: unsharedIds }, collectionId: null },
        ],
      })
        .select('_id')
        .lean()
    ).map((set: any) => set._id);
    // delete all annotations referenced to the annotation sets of the documents
    await AnnotationModel.deleteMany({ annotationSetId: { $in: annSetsIds } });
    // delete all annotationSets
    await AnnotationSetModel.deleteMany({ _id: { $in: annSetsIds } });
    // delete all docs
    await DocumentModel.deleteMany({ collectionId });
    // Delete docs from elastic index (in-process now, no HTTP hop needed)
    for (const docId of docIds) {
      try {
        await deleteElasticDocument(elasticIndex, String(docId), collectionId);
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
            // `end` is exclusive (as everywhere else, e.g. encode/decode)
            const end = Math.min(document.text.length, Math.max(start, annot.end));
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

      if (new_sets[annset.name]) {
        // Same-named duplicate annotation set - e.g. leftover rows from a
        // duplicate/concurrent upload of the same document before the
        // {id, collectionId} unique index existed (see insertFullDocument).
        // Merge instead of silently overwriting: naively keying by name
        // here used to drop whichever duplicate wasn't processed last,
        // even though document.features.clusters can still reference
        // annotation ids that only exist in the dropped set.
        const existing = new_sets[annset.name];
        const seenIds = new Set(existing.annotations.map((a: any) => a.id));
        for (const annot of annset.annotations) {
          if (!seenIds.has(annot.id)) {
            existing.annotations.push(annot);
            seenIds.add(annot.id);
          }
        }
        existing.annotations.sort((a: any, b: any) => a.start - b.start);
        existing.next_annid = Math.max(
          existing.next_annid || 0,
          annset.next_annid || 0
        );
      } else {
        new_sets[annset.name] = annset;
      }
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
