import mongoose from "mongoose";

/**
 * UploadJob model
 *
 * Durable, MongoDB-backed record of a batch document upload. This is the
 * single source of truth for upload progress: the browser only ever reads
 * this record (via REST or the SSE stream), so progress survives page
 * refreshes, navigation, and closing/reopening the tab. The actual file
 * processing (annotation pipeline + document creation) is driven by the
 * Next.js server as a background task and reported back here after every
 * per-file state change.
 */

const { Schema } = mongoose;

const uploadJobFileSchema = new Schema(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
    },
    progress: { type: Number, default: 0 },
    error: { type: String },
    documentId: { type: String },
  },
  { _id: false },
);

const uploadJobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    collectionId: { type: String, required: true, index: true },
    uploadType: { type: String, enum: ["json", "txt"], required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "completed",
        "completed_with_errors",
        "failed",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    configuration: {
      configurationId: { type: String },
      toAnonymize: { type: Boolean, default: false },
      anonymizeTypes: { type: [String], default: undefined },
    },
    files: { type: [uploadJobFileSchema], default: [] },
    statistics: {
      total: { type: Number, default: 0 },
      completed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      startedAt: { type: Date },
      completedAt: { type: Date },
    },
    error: { type: String },
  },
  { timestamps: true },
);

uploadJobSchema.index({ userId: 1, createdAt: -1 });

export const UploadJob = mongoose.model(
  "UploadJob",
  uploadJobSchema,
  "upload_jobs",
);
