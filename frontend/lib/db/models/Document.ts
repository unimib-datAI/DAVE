// Ported from backend/documents/src/models/document.js
import mongoose, { Schema, Document as MongooseDocument, Model } from 'mongoose';
// @ts-ignore - no type definitions published for this package
import Inc from 'mongoose-sequence';
// @ts-ignore - no type definitions published for this package
import paginate from 'mongoose-paginate-v2';

export interface IDocument extends MongooseDocument {
  id?: string;
  name?: string;
  preview?: string;
  text?: string;
  features?: Record<string, any>;
  offset_type?: string;
  collectionId?: string;
  inc_id?: number;
}

export type DocumentModelType = Model<IDocument> & {
  paginate: (query?: any, options?: any) => Promise<any>;
};

// Guard schema creation + plugin registration (not just mongoose.model())
// behind the "already registered" check: mongoose-sequence's AutoIncrement
// plugin keeps its own global counter registry keyed by inc_field, which
// throws "Counter already defined" if schema.plugin(...) runs twice - which
// it otherwise would, since Next.js's dev bundler can re-evaluate this
// module's top-level code once per bundle chunk that imports it.
export const DocumentModel: DocumentModelType =
  (mongoose.models.Document as DocumentModelType) ||
  (() => {
    const schema = new Schema<IDocument>({
      id: {
        type: String,
        required: false,
      },
      name: String,
      preview: String,
      text: String,
      features: Object,
      offset_type: String, // "p" for python style
      collectionId: { type: String, required: false, index: true },
    });

    // The document id is a content hash; two documents sharing one is only
    // valid across *different* collections (same source file uploaded into
    // two collections), never within the same one - `insertFullDocument`
    // relies on this index (not just its own pre-check) to catch duplicate
    // rows from concurrent/duplicate uploads of identical content, which a
    // check-then-insert without a DB-level constraint can't prevent on its
    // own.
    schema.index({ id: 1, collectionId: 1 }, { unique: true });

    // add field for auto increment id
    const AutoIncrement = Inc(mongoose);
    schema.plugin(AutoIncrement, { inc_field: 'inc_id' });
    // add pagination for this schema
    schema.plugin(paginate);

    return mongoose.model<IDocument, DocumentModelType>(
      'Document',
      schema,
      'documents'
    ) as DocumentModelType;
  })();

export const documentDTO = (body: {
  text?: string;
  preview?: string;
  name?: string;
  features?: Record<string, any>;
  offset_type?: string;
  id?: string;
  collectionId?: string;
}) => {
  const text = body.text;
  const preview = body.preview || (body.text ? body.text.slice(0, 400) : '');
  const name =
    body.name || (body.text ? body.text.split(' ').slice(0, 3).join(' ') : '');
  const features = body.features;
  const offset_type = body.offset_type || 'p';
  const id = body.id;
  const collectionId = body.collectionId;
  return new DocumentModel({
    id,
    name,
    preview,
    text,
    features,
    offset_type,
    collectionId,
  });
};
