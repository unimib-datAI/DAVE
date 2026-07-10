// Ported from backend/documents/src/models/annotationSet.js
import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAnnotationSet extends Document {
  docId?: string;
  name?: string;
  next_annid?: number;
}

const annotationSetSchema = new Schema<IAnnotationSet>({
  docId: String,
  name: String, // always the same as the identifier ?
  next_annid: Number,
});

export const AnnotationSetModel: Model<IAnnotationSet> =
  mongoose.models.AnnotationSet ||
  mongoose.model<IAnnotationSet>('AnnotationSet', annotationSetSchema, 'annotationSets');

export const annotationSetDTO = (annset: Partial<IAnnotationSet>) => {
  return new AnnotationSetModel(annset);
};
