import "dotenv/config";
import { startServer } from "./loaders";

/**
 * Global runtime helpers
 *
 * - Logs uncaught exceptions and unhandled promise rejections so crashes produce readable stacks.
 * - Periodically logs memory usage to help diagnose OOM or memory growth during large exports.
 * - Exposes a default environment variable `EXPORT_ZLIB_LEVEL` to suggest a lower compression
 *   level for exporters (some exporter code may read this variable if implemented).
 *
 * Notes:
 * - MEMORY_LOG_INTERVAL_MS controls how often memory is logged (ms). Default: 60000 (1 minute).
 * - We `unref()` the interval timer so it doesn't keep the process alive alone.
 */

// Provide a default compression level hint (exporter can choose to read this env)
process.env.EXPORT_ZLIB_LEVEL = process.env.EXPORT_ZLIB_LEVEL || "6";

// Memory logging helper
function logMemoryUsage(prefix = "") {
  try {
    const mem = process.memoryUsage();
    const toMB = (n) => `${Math.round(n / 1024 / 1024)}MB`;
    console.log(
      `${prefix} memoryUsage: rss=${toMB(mem.rss)} heapTotal=${toMB(
        mem.heapTotal,
      )} heapUsed=${toMB(mem.heapUsed)} external=${toMB(mem.external)}`,
    );
  } catch (e) {
    // Best-effort logging
    try {
      console.error(
        "Failed to log memory usage:",
        e && e.stack ? e.stack : String(e),
      );
    } catch {}
  }
}

// Periodic memory logger (configurable, defaults to 60s)
const memIntervalMs = Number(process.env.MEMORY_LOG_INTERVAL_MS || 60000);
const memLogger = setInterval(() => logMemoryUsage("periodic"), memIntervalMs);
// Allow process to exit if nothing else is pending
if (typeof memLogger.unref === "function") memLogger.unref();

// Global error handlers to surface unexpected failures in logs
process.on("uncaughtException", (err) => {
  try {
    console.error(
      "uncaughtException:",
      err && err.stack ? err.stack : String(err),
    );
  } catch {}
  // Give a short time for logs to flush then exit
  try {
    setTimeout(() => process.exit(1), 1000).unref();
  } catch {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason) => {
  try {
    console.error(
      "unhandledRejection:",
      reason && reason.stack ? reason.stack : String(reason),
    );
  } catch {}
});

// Log termination signals so we see when the container or system requests shutdown
process.on("SIGTERM", () => {
  try {
    console.log("SIGTERM received — shutting down.");
    logMemoryUsage("shutdown");
  } catch {}
  try {
    process.exit(0);
  } catch {}
});

// Start server and log initial memory snapshot
const server = startServer(({ PORT }) => {
  console.log(`👾 Server running at http://localhost:${PORT} 👾`);
  logMemoryUsage("startup");
});
