import Permission from "../models/permissions";
import { HTTP_ERROR_CODES, HTTPError } from "../utils/http-error";

let cachedPermissions = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 cachedPermissions

async function getPermission() {
  if (cachedPermissions && Date.now() < cacheExpiry) {
    return cachedPermissions;
  } else {
    cachedPermissions = await Permission.findOne({}).lean();
    cacheExpiry = Date.now() + CACHE_TTL;
    return cachedPermissions;
  }
}
function getUserRoles(req) {
  return [
    ...(req.user?.roles || []), // keycloak realm roles  → ["editor", "viewer"]
    ...(req.user?.client_roles || []), // keycloak client roles → ["editor"]
    req.user?.role, // local JWT single role → "admin"
  ].filter(Boolean); // remove undefined/null
}

export const requirePermission =
  (section, action) => async (req, res, next) => {
    try {
      console.log("Bypass active", process.env.USE_AUTH === "true");
      if (process.env.USE_AUTH === "false") {
        return next();
      }
      const userRoles = getUserRoles(req);
      console.log("current user roles", userRoles, section, action);
      if (userRoles.includes("admin")) return next();

      const permissions = await getPermission();
      if (!permissions) {
        return next(
          new HTTPError({
            code: HTTP_ERROR_CODES.FORBIDDEN,
            message: "No permissions configured",
          }),
        );
      }
      const allowdRoles = permissions[section]?.[action] ?? [];

      const hasPermission = userRoles.some((perm) =>
        allowdRoles.includes(perm),
      );
      if (!hasPermission) {
        return next(
          new HTTPError({
            code: HTTP_ERROR_CODES.FORBIDDEN,
            message: "Insufficient permission",
          }),
        );
      }
      next();
    } catch (error) {
      console.error("Error in requirePermission middleware", error);
      next(error);
    }
  };
export const invalidatePermissionsCache = () => {
  cachedPermissions = null;
  cacheExpiry = 0;
};
