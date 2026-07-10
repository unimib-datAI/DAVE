// Ported from backend/documents/src/controllers/annotation.js
export const AnnotationController = {
  insertOne: async (annotation: any) => {
    return annotation.save();
  },
};
