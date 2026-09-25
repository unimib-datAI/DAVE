// Ported from backend/documents/src/models/annotationSet.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAnnotationSet extends Document {
  docId?: string;
  // Document ids are content hashes, so the same file uploaded into two
  // collections yields two Document records sharing one `docId` - the
  // annotation sets must be scoped by collection too, otherwise every copy
  // reads (and deletes) every other copy's annotations. Missing on legacy
  // rows created before this field existed (see annotationSetScope in
  // documentController.ts for how those are handled).
  collectionId?: string;
  name?: string;
  next_annid?: number;
}

const annotationSetSchema = new Schema<IAnnotationSet>({
  docId: String,
  collectionId: String,
  name: String, // always the same as the identifier ?
  next_annid: Number,
});
annotationSetSchema.index({ docId: 1, collectionId: 1 });

export const AnnotationSetModel: Model<IAnnotationSet> =
  mongoose.models.AnnotationSet ||
  mongoose.model<IAnnotationSet>('AnnotationSet', annotationSetSchema, 'annotationSets');

export const annotationSetDTO = (annset: Partial<IAnnotationSet>) => {
  return new AnnotationSetModel(annset);
};
