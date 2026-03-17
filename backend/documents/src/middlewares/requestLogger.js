export default function requestLogger(req, res, next) {
  try {
    const method = req.method;
    const original = req.originalUrl || req.url || "";

    // Prefer Keycloak-style user id on req.user.sub, fallback to Authorization header or '-' when absent
    const userId =
      (req.user && req.user.sub) ||
      (req.user && req.user.id) ||
      (req.headers && req.headers.authorization) ||
      "-";

    // Replace any route param values in the path with ${paramName} for clearer logs
    let pathWithParams = original;
    if (req.params && typeof req.params === "object") {
      for (const [k, v] of Object.entries(req.params)) {
        if (!v) continue;
        // replace all occurrences of the param value with a template marker
        try {
          const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          pathWithParams = pathWithParams.replace(
            new RegExp(escaped, "g"),
            `
\${${k}}`,
          );
        } catch (e) {
          // fallback: simple replace
          pathWithParams = pathWithParams.split(String(v)).join(`\${${k}}`);
        }
      }
    }

    console.log(`[${method}] ${pathWithParams} - userId: ${userId}`);
  } catch (e) {
    // never throw from middleware
    console.error("requestLogger error", e);
  }
  return next();
}
