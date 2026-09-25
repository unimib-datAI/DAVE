// Ported from backend/documents/src/middlewares/permission.js
//
// Express version is `requirePermission(section, action) => middleware`;
// here it's a plain async function resolvers call directly, since there's
// no middleware chain in tRPC. Throws on missing permission - callers
// should let the error propagate (wrap in TRPCError at the call site, same
// as every other resolver in this codebase already does for other errors).

import { PermissionModel } from '../db/models/Permission';
import { dbConnect } from '../db/connection';
import { RequestUser, getUserRoles } from './keycloakAuth';

let cachedPermissions: any = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getPermission() {
  if (cachedPermissions && Date.now() < cacheExpiry) {
    return cachedPermissions;
  }
  await dbConnect();
  // First run: the permissions collection is empty on a fresh Mongo - seed
  // the defaults instead of every permission check hard-failing.
  await PermissionModel.ensureDefaultPermissions();
  cachedPermissions = await PermissionModel.findOne({}).lean();
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedPermissions;
}

export function invalidatePermissionsCache() {
  cachedPermissions = null;
  cacheExpiry = 0;
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Throws PermissionDeniedError if `user` doesn't have `action` permission on
 * `section`, mirroring requirePermission(section, action) exactly:
 * USE_AUTH=false bypasses everything, "admin" role bypasses everything,
 * otherwise the user's roles must intersect the Permission document's
 * [section][action] allow-list.
 */
export async function requirePermission(
  user: RequestUser,
  section: string,
  action: string
): Promise<void> {
  if (process.env.USE_AUTH === 'false') {
    return;
  }

  const userRoles = getUserRoles(user);
  if (userRoles.includes('admin')) return;

  const permissions = await getPermission();
  if (!permissions) {
    throw new PermissionDeniedError('No permissions configured');
  }

  const allowedRoles: string[] = permissions[section]?.[action] ?? [];
  const hasPermission = userRoles.some((role) => allowedRoles.includes(role));

  if (!hasPermission) {
    throw new PermissionDeniedError('Insufficient permission');
  }
}

/**
 * Ported from keycloak-auth.js's requireRole(...roles) - throws unless the
 * user has at least one of the given realm/client roles.
 */
export function requireRole(user: RequestUser, ...roles: string[]): void {
  const userRoles = getUserRoles(user);
  const hasRole = roles.some((role) => userRoles.includes(role));
  if (!hasRole) {
    console.warn(
      `⚠️  User ${user.email || user.preferred_username} missing required role. Has: [${userRoles.join(
        ', '
      )}], Needs one of: [${roles.join(', ')}]`
    );
    throw new PermissionDeniedError('Insufficient permissions.');
  }
}

/** Ported from keycloak-auth.js's requireAdmin (= requireRole("admin")). */
export function requireAdmin(user: RequestUser): void {
  requireRole(user, 'admin');
}
