// Ported from backend/documents/src/models/uploadJob.js
//
// Durable, MongoDB-backed record of a batch document upload. This is the
// single source of truth for upload progress: the browser only ever reads
// this record (via REST or the SSE stream), so progress survives page
// refreshes, navigation, and closing/reopening the tab.

import mongoose, { Schema, Document, Model } from 'mongoose';

export type UploadFileStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type UploadJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled';

export interface IUploadJobFile {
  fileId: string;
  fileName: string;
  status: UploadFileStatus;
  progress: number;
  error?: string;
  documentId?: string;
}

export interface IUploadJob extends Document {
  jobId: string;
  userId: string;
  collectionId: string;
  uploadType: 'json' | 'txt';
  status: UploadJobStatus;
  configuration?: {
    configurationId?: string;
    toAnonymize: boolean;
    anonymizeTypes?: string[];
  };
  files: IUploadJobFile[];
  statistics: {
    total: number;
    completed: number;
    failed: number;
    startedAt?: Date;
    completedAt?: Date;
  };
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const uploadJobFileSchema = new Schema<IUploadJobFile>(
  {
    fileId: { type: String, required: true },
    fileName: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
    },
    progress: { type: Number, default: 0 },
    error: { type: String },
    documentId: { type: String },
  },
  { _id: false }
);

const uploadJobSchema = new Schema<IUploadJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    collectionId: { type: String, required: true, index: true },
    uploadType: { type: String, enum: ['json', 'txt'], required: true },
    status: {
      type: String,
      enum: [
        'pending',
        'processing',
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled',
      ],
      default: 'pending',
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
  { timestamps: true }
);

uploadJobSchema.index({ userId: 1, createdAt: -1 });

export const UploadJobModel: Model<IUploadJob> =
  mongoose.models.UploadJob ||
  mongoose.model<IUploadJob>('UploadJob', uploadJobSchema, 'upload_jobs');
