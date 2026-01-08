import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";
import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  // allow public auth endpoints to be called without token
  if (
    req.path.startsWith("/auth") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/document/deanonymize-key") ||
    // Allow public GET access to documents by ID (hex strings or numbers, but not words like "configurations" or "services")
    /^\/api\/document\/[a-f0-9]+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/[a-f0-9]+$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+$/.test(req.originalUrl)
  ) {
    return next();
  }

  // if auth disabled, only check for API_KEY (backwards-compatible)
  // if (process.env.ENABLE_AUTH !== "true") {
  //     if (
  //         !req.headers.authorization ||
  //         req.headers.authorization !== process.env.API_KEY
  //     ) {
  //         console.log("*** headers ***", req.headers);
  //         throw new HTTPError({
  //             code: HTTP_ERROR_CODES.FORBIDDEN,
  //             message: "Invalid authorization header.",
  //         });
  //     }
  //     return next();
  // }

  // validate Bearer JWT
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new HTTPError({
      code: HTTP_ERROR_CODES.FORBIDDEN,
      message: "Missing Bearer token.",
    });
  }
  const token = authHeader.slice(7);
  try {
    const SECRET = process.env.JWT_SECRET || "secret";
    const payload = jwt.verify(token, SECRET);
    // attach user info to request if needed
    req.user = payload;
    next();
  } catch (err) {
    console.error("*** jwt err ***", err);
    throw new HTTPError({
      code: HTTP_ERROR_CODES.FORBIDDEN,
      message: "Invalid or expired token.",
    });
  }
};
