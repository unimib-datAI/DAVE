import crypto from "crypto";
import { UploadJob } from "../models/uploadJob.js";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

export const UploadJobController = {
  async create({ userId, collectionId, uploadType, fileNames, configuration }) {
    const jobId = makeId("job");
    const files = fileNames.map((fileName) => ({
      fileId: makeId("file"),
      fileName,
      status: "pending",
      progress: 0,
    }));

    const job = await UploadJob.create({
      jobId,
      userId,
      collectionId,
      uploadType,
      status: "pending",
      configuration: configuration || {},
      files,
      statistics: {
        total: files.length,
        completed: 0,
        failed: 0,
      },
    });

    return job;
  },

  async getByJobId(jobId) {
    return UploadJob.findOne({ jobId }).lean();
  },

  async listRecent({ userId, collectionId, limit = 20 }) {
    const query = { userId };
    if (collectionId) query.collectionId = collectionId;
    return UploadJob.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean();
  },

  async updateStatus(jobId, status) {
    const update = { status };
    if (status === "processing") {
      update["statistics.startedAt"] = new Date();
    }
    if (
      status === "completed" ||
      status === "completed_with_errors" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      update["statistics.completedAt"] = new Date();
    }
    return UploadJob.findOneAndUpdate(
      { jobId },
      { $set: update },
      { new: true },
    ).lean();
  },

  async setError(jobId, error) {
    return UploadJob.findOneAndUpdate(
      { jobId },
      { $set: { status: "failed", error: String(error) } },
      { new: true },
    ).lean();
  },

  async updateFile(jobId, fileId, patch) {
    const setFields = {};
    if (patch.status !== undefined) setFields["files.$[el].status"] = patch.status;
    if (patch.progress !== undefined)
      setFields["files.$[el].progress"] = patch.progress;
    if (patch.error !== undefined) setFields["files.$[el].error"] = patch.error;
    if (patch.documentId !== undefined)
      setFields["files.$[el].documentId"] = patch.documentId;

    const job = await UploadJob.findOneAndUpdate(
      { jobId },
      { $set: setFields },
      { new: true, arrayFilters: [{ "el.fileId": fileId }] },
    );
    if (!job) return null;

    // Recompute aggregate statistics from the authoritative file list.
    const completed = job.files.filter((f) => f.status === "completed").length;
    const failed = job.files.filter((f) => f.status === "failed").length;
    job.statistics.completed = completed;
    job.statistics.failed = failed;
    await job.save();
    return job.toObject();
  },

  async remove(jobId, userId) {
    return UploadJob.findOneAndDelete({ jobId, userId }).lean();
  },
};
