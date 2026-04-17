import { Router } from "express";
import { asyncRoute } from "../utils/async-route";
import Permission from "../models/permissions";
import { HTTPError, HTTP_ERROR_CODES } from "../utils/http-error";

const route = Router();

/**
 * Auth-aware admin-only guard.
 *
 * When USE_AUTH is "false" every request is treated as having admin rights
 * (the global keycloak middleware is not even mounted in that mode).
 * When auth is enabled the user must carry the "admin" role in their JWT.
 */
const requireAdminRole = (req, res, next) => {
  if (process.env.USE_AUTH === "false") return next();

  const userRoles = [
    ...(req.user?.roles || []),
    ...(req.user?.client_roles || []),
  ];

  if (!userRoles.includes("admin")) {
    return next(
      new HTTPError({
        code: HTTP_ERROR_CODES.FORBIDDEN,
        message: "Admin role required",
      }),
    );
  }

  next();
};

export default (app) => {
  app.use("/permissions", route);

  /**
   * GET /api/permissions
   * Authentication only – no extra permission check needed.
   * Returns the single global DAVE permissions document.
   */
  route.get(
    "/",
    asyncRoute(async (req, res) => {
      const permissions = await Permission.findOne({}).lean();
      if (!permissions) {
        return res.status(404).json({ message: "No permissions configured" });
      }
      return res.json(permissions);
    }),
  );

  /**
   * PUT /api/permissions
   * Admin role required (skipped when USE_AUTH=false).
   * Replaces the collections / document / chat / settings fields of the
   * single global permissions document.
   */
  route.put(
    "/",
    requireAdminRole,
    asyncRoute(async (req, res) => {
      const { collections, document, chat, settings } = req.body;

      const updated = await Permission.findOneAndUpdate(
        {},
        { $set: { collections, document, chat, settings } },
        { new: true, upsert: true },
      ).lean();

      return res.json(updated);
    }),
  );
};
