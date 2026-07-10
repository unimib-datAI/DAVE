// Ported from backend/documents/src/controllers/uploadJob.js
import crypto from 'crypto';
import { UploadJobModel } from '../db/models/UploadJob';
import { dbConnect } from '../db/connection';

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export const UploadJobController = {
  async create({
    userId,
    collectionId,
    uploadType,
    fileNames,
    configuration,
  }: {
    userId: string;
    collectionId: string;
    uploadType: string;
    fileNames: string[];
    configuration?: any;
  }) {
    await dbConnect();
    const jobId = makeId('job');
    const files = fileNames.map((fileName) => ({
      fileId: makeId('file'),
      fileName,
      status: 'pending' as const,
      progress: 0,
    }));

    return UploadJobModel.create({
      jobId,
      userId,
      collectionId,
      uploadType,
      status: 'pending',
      configuration: configuration || {},
      files,
      statistics: {
        total: files.length,
        completed: 0,
        failed: 0,
      },
    } as any);
  },

  async getByJobId(jobId: string) {
    await dbConnect();
    return UploadJobModel.findOne({ jobId }).lean();
  },

  async listRecent({
    userId,
    collectionId,
    limit = 20,
  }: {
    userId: string;
    collectionId?: string;
    limit?: number;
  }) {
    await dbConnect();
    const query: Record<string, any> = { userId };
    if (collectionId) query.collectionId = collectionId;
    return UploadJobModel.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();
  },

  async updateStatus(jobId: string, status: string) {
    await dbConnect();
    const update: Record<string, any> = { status };
    if (status === 'processing') {
      update['statistics.startedAt'] = new Date();
    }
    if (
      status === 'completed' ||
      status === 'completed_with_errors' ||
      status === 'failed' ||
      status === 'cancelled'
    ) {
      update['statistics.completedAt'] = new Date();
    }
    return UploadJobModel.findOneAndUpdate({ jobId }, { $set: update }, { new: true }).lean();
  },

  async setError(jobId: string, error: any) {
    await dbConnect();
    return UploadJobModel.findOneAndUpdate(
      { jobId },
      { $set: { status: 'failed', error: String(error) } },
      { new: true }
    ).lean();
  },

  async updateFile(
    jobId: string,
    fileId: string,
    patch: { status?: string; progress?: number; error?: string; documentId?: string }
  ) {
    await dbConnect();
    const setFields: Record<string, any> = {};
    if (patch.status !== undefined) setFields['files.$[el].status'] = patch.status;
    if (patch.progress !== undefined) setFields['files.$[el].progress'] = patch.progress;
    if (patch.error !== undefined) setFields['files.$[el].error'] = patch.error;
    if (patch.documentId !== undefined) setFields['files.$[el].documentId'] = patch.documentId;

    const job = await UploadJobModel.findOneAndUpdate(
      { jobId },
      { $set: setFields },
      { new: true, arrayFilters: [{ 'el.fileId': fileId }] }
    );
    if (!job) return null;

    // Recompute aggregate statistics from the authoritative file list.
    const completed = job.files.filter((f) => f.status === 'completed').length;
    const failed = job.files.filter((f) => f.status === 'failed').length;
    job.statistics.completed = completed;
    job.statistics.failed = failed;
    await job.save();
    return (job as any).toObject();
  },

  async remove(jobId: string, userId: string) {
    await dbConnect();
    return UploadJobModel.findOneAndDelete({ jobId, userId }).lean();
  },
};
