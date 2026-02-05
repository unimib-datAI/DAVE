/**
 * DAVE/backend/documents/src/api/export/index.js
 *
 * Multi-archive background exporter.
 *
 * - POST /export/start starts a background job that splits a collection export
 *   into multiple ZIP files (configurable docs per archive) to avoid process
 *   crashes / OOM when the corpus is huge.
 * - GET  /export/:jobId/status returns job state and list of produced archives.
 * - GET  /export/:jobId/download/:index streams the requested archive file.
 *
 * Implementation notes:
 * - Uses CollectionController.streamAllDocuments(collectionId) (async generator)
 *   when available to iterate docs without loading everything into memory.
 * - Archives are created sequentially and saved to the OS temp directory.
 * - Jobs are tracked in-memory (Map). For persistence across restarts, persist
 *   job metadata to DB or external storage (not implemented here).
 */

import { Router } from "express";
import archiver from "archiver";
import { Readable } from "stream";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { finished } from "stream";
import { CollectionController } from "../../controllers/collection";

const waitFinished = promisify(finished);
const route = Router();

/* ---------- Utilities ---------- */

function sanitizeFilename(name) {
  return String(name || "doc")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

function safeStringify(obj) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      obj,
      (k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        if (typeof v === "function")
          return `[Function: ${v.name || "anonymous"}]`;
        return v;
      },
      2,
    );
  } catch (err) {
    try {
      return String(obj);
    } catch {
      return "[Unserializable]";
    }
  }
}

function tmpPath(basename) {
  return path.join(os.tmpdir(), basename);
}

/* ---------- Job management ---------- */

// In-memory job store. Key: jobId, Value: job record
const jobs = new Map();

function makeJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a single archive file from an async iterator of documents.
 * Accepts iterator that yields document objects and will append up to `limit`
 * documents into the archive file. Returns path of created archive and count.
 */
async function createArchiveFromIterator(iter, limit, collectionId, seq) {
  const archiveName = `export_${collectionId}_${Date.now()}_${seq}.zip`;
  const outPath = tmpPath(archiveName);
  const output = fs.createWriteStream(outPath);
  const archive = archiver("zip", {
    zlib: { level: Number(process.env.EXPORT_ZLIB_LEVEL || 6) },
  });

  return new Promise((resolve, reject) => {
    let count = 0;
    archive.on("warning", (w) => {
      console.warn("archiver warning:", w);
    });
    archive.on("error", (err) => {
      try {
        output.destroy();
      } catch {}
      reject(err);
    });

    output.on("error", (err) => {
      try {
        archive.destroy();
      } catch {}
      reject(err);
    });

    archive.pipe(output);

    (async () => {
      try {
        while (count < limit) {
          const { value, done } = await iter.next();
          if (done) break;
          const doc = value;
          try {
            const name = `${sanitizeFilename(doc?.name || doc?.id || `doc_${count}`)}.json`;
            const content = safeStringify(doc);
            const stream = Readable.from([content]);
            archive.append(stream, { name });
          } catch (e) {
            console.error(
              `archive append error for doc idx=${count}:`,
              e && e.stack ? e.stack : String(e),
            );
            // continue with next doc
          }
          count++;
        }
        await archive.finalize();
        // Wait until output stream closes
        output.on("close", () => resolve({ path: outPath, count }));
      } catch (err) {
        try {
          archive.destroy();
        } catch {}
        reject(err);
      }
    })();
  });
}

/**
 * POST /export/start
 * Starts a background job that produces one or more zip files.
 * Body: { collectionId, docsPerArchive? }
 */
route.post("/start", async (req, res) => {
  const collectionId = req.body?.collectionId || req.query?.collectionId;
  const docsPerArchive = Number(
    req.body?.docsPerArchive ||
      req.query?.docsPerArchive ||
      process.env.EXPORT_DOCS_PER_ARCHIVE ||
      1000,
  );

  if (!collectionId)
    return res.status(400).json({ error: "collectionId required" });

  const userId = req.user?.sub || req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Access check
  if (typeof CollectionController.hasAccess === "function") {
    const ok = await CollectionController.hasAccess(collectionId, userId).catch(
      () => false,
    );
    if (!ok) return res.status(403).json({ error: "Access denied" });
  }

  const jobId = makeJobId();
  const job = {
    id: jobId,
    collectionId,
    status: "starting",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    archives: [], // { path, filename, count }
    error: null,
  };
  jobs.set(jobId, job);

  // Start background worker (no await) — best-effort in-memory job tracking
  (async () => {
    job.status = "running";
    try {
      // Prefer streaming API if available
      let docsSource;
      if (typeof CollectionController.streamAllDocuments === "function") {
        docsSource = CollectionController.streamAllDocuments(collectionId);
      } else if (typeof CollectionController.getAllDocuments === "function") {
        const arr = await CollectionController.getAllDocuments(collectionId);
        // convert array to async iterator
        async function* arrIter(a) {
          for (const x of a) yield x;
        }
        docsSource = arrIter(arr);
      } else {
        throw new Error("No document source available on CollectionController");
      }

      // Create an async iterator
      const iter = docsSource[Symbol.asyncIterator]
        ? docsSource[Symbol.asyncIterator]()
        : docsSource[Symbol.iterator]();

      let seq = 1;
      let totalSent = 0;
      while (true) {
        // create one archive with up to docsPerArchive docs
        const result = await createArchiveFromIterator(
          iter,
          docsPerArchive,
          collectionId,
          seq,
        );
        job.archives.push({
          path: result.path,
          filename: path.basename(result.path),
          count: result.count,
        });
        totalSent += result.count;
        seq++;
        // If last archive contained fewer than docsPerArchive, assume done
        if (result.count < docsPerArchive) break;
      }

      job.status = "completed";
      job.finishedAt = new Date().toISOString();
    } catch (err) {
      console.error(
        "export job failed:",
        err && err.stack ? err.stack : String(err),
      );
      job.status = "failed";
      job.finishedAt = new Date().toISOString();
      job.error = err && err.stack ? err.stack : String(err);
    }
  })();

  return res.status(202).json({ jobId, startedAt: job.startedAt });
});

/**
 * GET /export/:jobId/status
 * Returns job metadata and list of produced archive filenames (if any)
 */
route.get("/:jobId/status", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  // return public view
  const { id, collectionId, status, startedAt, finishedAt, archives, error } =
    job;
  const files = (archives || []).map((a) => ({
    filename: a.filename,
    count: a.count,
  }));
  res.json({ id, collectionId, status, startedAt, finishedAt, files, error });
});

/**
 * GET /export/:jobId/download/:index
 * Streams the specific archive file (index is 0-based or 1-based acceptable).
 */
route.get("/:jobId/download/:index", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const idxParam = Number(req.params.index);
  if (Number.isNaN(idxParam))
    return res.status(400).json({ error: "Invalid index" });

  // accept 1-based or 0-based: try 1-based first
  let arch = job.archives[idxParam - 1] || job.archives[idxParam];
  if (!arch) return res.status(404).json({ error: "Archive not found" });

  // stream file
  const p = arch.path;
  fs.stat(p, (err, stat) => {
    if (err) return res.status(404).json({ error: "Archive file missing" });
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${arch.filename}"`,
    );
    res.setHeader("Content-Type", "application/zip");
    const stream = fs.createReadStream(p);
    stream.on("error", (e) => {
      console.error("stream error:", e && e.stack ? e.stack : String(e));
      try {
        res.status(500).end();
      } catch {}
    });
    stream.pipe(res);
  });
});

/**
 * GET /export-jobs
 * Return all jobs (summary)
 */
route.get("/jobs", (req, res) => {
  const all = Array.from(jobs.values()).map((j) => {
    const { id, collectionId, status, startedAt, finishedAt, archives, error } =
      j;
    return {
      id,
      collectionId,
      status,
      startedAt,
      finishedAt,
      files: (archives || []).map((a) => a.filename),
      error,
    };
  });
  res.json(all);
});

/* ---------- Register router ---------- */

/**
 * GET /export/:jobId/download
 * - If the job produced a single archive, stream that archive immediately.
 * - If the job produced multiple archives, return a JSON list of download URLs.
 *
 * The returned URLs are constructed relative to the router's base URL (req.baseUrl)
 * so they should work whether the router is mounted at /export or /api/export.
 */
route.get("/:jobId/download", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  const archives = job.archives || [];
  if (archives.length === 0) {
    // Job exists but no archives yet
    if (job.status === "running") {
      return res
        .status(202)
        .json({ message: "Job still running, no archives available yet" });
    }
    return res
      .status(404)
      .json({ error: "No archives available for this job" });
  }

  // If there is only one archive, stream it directly
  if (archives.length === 1) {
    const arch = archives[0];
    const p = arch.path;
    fs.stat(p, (err) => {
      if (err) return res.status(404).json({ error: "Archive file missing" });
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${arch.filename}"`,
      );
      res.setHeader("Content-Type", "application/zip");
      const stream = fs.createReadStream(p);
      stream.on("error", (e) => {
        console.error("stream error:", e && e.stack ? e.stack : String(e));
        try {
          res.status(500).end();
        } catch {}
      });
      stream.pipe(res);
    });
    return;
  }

  // Multiple archives: return a JSON list containing filenames and URLs
  // Build base URL from req.baseUrl to respect mounting (e.g., /api/export)
  const base = req.baseUrl || "/export";
  const files = archives.map((a, i) => {
    // Use 1-based index in URLs to be user-friendly
    const url = `${base}/${encodeURIComponent(job.id)}/download/${i + 1}`;
    return { filename: a.filename, count: a.count, url };
  });

  res.json({
    jobId: job.id,
    status: job.status,
    files,
  });
});

export default function registerExportRoutes(app) {
  // Mount router at /export in the main app
  app.use("/export", route);
}
