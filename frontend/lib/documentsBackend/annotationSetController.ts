// Ported from backend/documents/src/controllers/annotationSet.js
import { AnnotationModel } from '../db/models/Annotation';
import { AnnotationSetModel } from '../db/models/AnnotationSet';

export const AnnotationSetController = {
  insertOne: async (annotationSet: any) => {
    return annotationSet.save();
  },
  deleteOne: async (id: string) => {
    await AnnotationModel.deleteMany({ annotationSetId: id } as any);
    return AnnotationSetModel.deleteOne({ id } as any);
  },
};
