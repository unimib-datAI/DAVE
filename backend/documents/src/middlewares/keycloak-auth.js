import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER || "http://keycloak:8080/realms/dave";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_ID || "dave-client";

// Create JWKS client to fetch Keycloak's public keys
const client = jwksClient({
  jwksUri: `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

console.log(
  `🔐 Keycloak auth configured: issuer=${KEYCLOAK_ISSUER}, clientId=${KEYCLOAK_CLIENT_ID}`,
);

/**
 * Get signing key from Keycloak
 */
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error("❌ Error getting signing key:", err.message);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Keycloak authentication middleware
 * Validates JWT tokens issued by Keycloak
 */
export const keycloakAuthMiddleware = async (req, res, next) => {
  // Allow public auth endpoints to be called without token
  if (
    req.path.startsWith("/auth") ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/api/document/deanonymize-key") ||
    req.originalUrl.startsWith("/api-docs") ||
    req.originalUrl.startsWith("/swagger") ||
    // Allow public GET access to documents by ID
    /^\/api\/document\/[a-f0-9]+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/[a-f0-9]+$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+\/(true|false)$/.test(req.originalUrl) ||
    /^\/api\/document\/\d+$/.test(req.originalUrl)
  ) {
    return next();
  }

  // Extract Bearer token
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    if (
      process.env.USE_AUTH === "false" ||
      process.env.ENABLE_AUTH === "false"
    ) {
      const browserId = req.headers["x-browser-id"] || "anon-user";
      req.user = {
        sub: browserId,
        email: `${browserId}@example.com`,
        name: `Anonymous User ${browserId.slice(0, 8)}`,
        preferred_username: browserId,
        email_verified: false,
        roles: [],
        resource_access: {},
        client_roles: [],
        userId: browserId,
      };
      return next();
    } else {
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Missing Bearer token.",
        }),
      );
    }
  }

  const token = authHeader.slice(7);

  try {
    // Verify the token with Keycloak's public key
    // Note: audience validation is optional - Keycloak may not include 'aud' claim by default
    const payload = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          // Don't validate issuer strictly - allow different hostnames (localhost vs keycloak)
          // We'll validate the realm path manually
          // issuer: KEYCLOAK_ISSUER,
          // Don't require audience - Keycloak might not include it in the token
          // audience: KEYCLOAK_CLIENT_ID,
          algorithms: ["RS256"],
        },
        (err, decoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded);
          }
        },
      );
    });

    // Manually validate that the issuer ends with the correct realm path
    const expectedRealmPath = "/realms/DAVE";
    if (!payload.iss || !payload.iss.endsWith(expectedRealmPath)) {
      throw new Error(
        `Invalid issuer realm. Expected realm path: ${expectedRealmPath}, got: ${payload.iss}`,
      );
    }

    console.log(`✅ Token issuer validated: ${payload.iss}`);

    // Attach user info to request
    req.user = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      preferred_username: payload.preferred_username,
      email_verified: payload.email_verified,
      roles: payload.realm_access?.roles || [],
      resource_access: payload.resource_access || {},
      client_roles: payload.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles || [],
      // Map Keycloak user ID to userId for compatibility with existing code
      userId: payload.sub,
    };

    console.log(
      `✅ Keycloak auth: validated user ${req.user.email || req.user.preferred_username} (sub: ${req.user.sub})`,
    );
    console.log(`📦 User roles:`, {
      realm_roles: req.user.roles,
      client_roles: req.user.client_roles,
      userId: req.user.userId,
    });
    next();
  } catch (err) {
    console.error("❌ Keycloak JWT verification error:", err.message);

    let message = "Invalid or expired token.";
    if (err.name === "TokenExpiredError") {
      message = "Token has expired.";
    } else if (err.name === "JsonWebTokenError") {
      message = "Invalid token.";
    } else if (err.name === "NotBeforeError") {
      message = "Token not yet valid.";
    }

    return next(
      new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message,
      }),
    );
  }
};

/**
 * Role-based authorization middleware
 * Use this after keycloakAuthMiddleware to check for specific roles
 *
 * @param {...string} roles - Required roles (user needs at least one)
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/admin', requireRole('admin'), handler);
 * router.post('/manage', requireRole('admin', 'manager'), handler);
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Authentication required.",
        }),
      );
    }

    const userRoles = [
      ...(req.user.roles || []),
      ...(req.user.client_roles || []),
    ];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      console.warn(
        `⚠️  User ${req.user.email || req.user.preferred_username} missing required role. Has: [${userRoles.join(", ")}], Needs one of: [${roles.join(", ")}]`,
      );
      return next(
        new HTTPError({
          code: HTTP_ERROR_CODES.FORBIDDEN,
          message: "Insufficient permissions.",
        }),
      );
    }

    console.log(
      `✅ Role check passed for user ${req.user.email || req.user.preferred_username}: ${roles.join(" or ")}`,
    );
    next();
  };
};

/**
 * Check if user is admin
 * Convenience middleware for admin-only routes
 *
 * @example
 * router.delete('/users/:id', requireAdmin, handler);
 */
export const requireAdmin = requireRole("admin");
