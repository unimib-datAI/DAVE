// Ported from backend/documents/src/models/annotation.js
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IAnnotation extends Document {
  annotationSetId?: Types.ObjectId;
  id?: number;
  type?: string;
  start?: number;
  end?: number;
  features?: Record<string, any>;
  originalKey?: string;
}

const annotationSchema = new Schema<IAnnotation>({
  annotationSetId: mongoose.Schema.Types.ObjectId,
  id: Number,
  type: String,
  start: Number,
  end: Number,
  features: Object,
  originalKey: String,
});

export const AnnotationModel: Model<IAnnotation> =
  mongoose.models.Annotation ||
  mongoose.model<IAnnotation>('Annotation', annotationSchema, 'annotations');

export const annotationDTO = (annotation: Partial<IAnnotation>) => {
  return new AnnotationModel(annotation);
};
