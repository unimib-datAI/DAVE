import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "zod-express-middleware";
import { asyncRoute } from "../utils/async-route";
import { requirePermission } from "../middlewares/permission.js";
import { UploadJobController } from "../controllers/uploadJob.js";

const route = Router();

function getUserId(req) {
  return req.user?.sub || req.user?.userId;
}

function toPublicJob(job) {
  if (!job) return job;
  // Never leak other users' ids beyond what's needed by the client.
  return job;
}

export default (app) => {
  app.use("/upload-jobs", route);

  // POST /api/upload-jobs - register a new upload job (metadata only, no file content)
  route.post(
    "/",
    requirePermission("collections", "update"),
    validateRequest({
      req: {
        body: z.object({
          collectionId: z.string(),
          uploadType: z.enum(["json", "txt"]),
          fileNames: z.array(z.string()).min(1),
          configuration: z
            .object({
              configurationId: z.string().optional(),
              toAnonymize: z.boolean().optional(),
              anonymizeTypes: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { collectionId, uploadType, fileNames, configuration } = req.body;
      const job = await UploadJobController.create({
        userId,
        collectionId,
        uploadType,
        fileNames,
        configuration,
      });
      return res.status(201).json(toPublicJob(job));
    }),
  );

  // GET /api/upload-jobs - list recent jobs for the current user
  route.get(
    "/",
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { collectionId, limit } = req.query;
      const jobs = await UploadJobController.listRecent({
        userId,
        collectionId,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      return res.json(jobs);
    }),
  );

  // GET /api/upload-jobs/:jobId - fetch a single job's current state
  route.get(
    "/:jobId",
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const job = await UploadJobController.getByJobId(req.params.jobId);
      if (!job) return res.status(404).json({ message: "Job not found" });
      if (job.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      return res.json(toPublicJob(job));
    }),
  );

  // PATCH /api/upload-jobs/:jobId - update job-level status
  route.patch(
    "/:jobId",
    validateRequest({
      req: {
        body: z.object({
          status: z.enum([
            "pending",
            "processing",
            "completed",
            "completed_with_errors",
            "failed",
            "cancelled",
          ]).optional(),
          error: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await UploadJobController.getByJobId(req.params.jobId);
      if (!existing) return res.status(404).json({ message: "Job not found" });
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      let job;
      if (req.body.error) {
        job = await UploadJobController.setError(req.params.jobId, req.body.error);
      } else {
        job = await UploadJobController.updateStatus(
          req.params.jobId,
          req.body.status,
        );
      }
      return res.json(toPublicJob(job));
    }),
  );

  // PATCH /api/upload-jobs/:jobId/files/:fileId - update a single file's progress
  route.patch(
    "/:jobId/files/:fileId",
    validateRequest({
      req: {
        body: z.object({
          status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
          progress: z.number().optional(),
          error: z.string().optional(),
          documentId: z.string().optional(),
        }),
      },
    }),
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const existing = await UploadJobController.getByJobId(req.params.jobId);
      if (!existing) return res.status(404).json({ message: "Job not found" });
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const job = await UploadJobController.updateFile(
        req.params.jobId,
        req.params.fileId,
        req.body,
      );
      return res.json(toPublicJob(job));
    }),
  );

  // DELETE /api/upload-jobs/:jobId - dismiss a job from history
  route.delete(
    "/:jobId",
    asyncRoute(async (req, res) => {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const deleted = await UploadJobController.remove(req.params.jobId, userId);
      if (!deleted) return res.status(404).json({ message: "Job not found" });
      return res.json({ message: "deleted" });
    }),
  );
};
