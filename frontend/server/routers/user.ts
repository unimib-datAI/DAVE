import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import { getRequestUser, getUserRoles, RequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requireAdmin, requirePermission, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { keycloakService } from '@/lib/documentsBackend/keycloakService';
import { CollectionController } from '@/lib/documentsBackend/collectionController';

export type User = {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles: string[];
  createdAt?: string;
  updatedAt?: string;
};

// Anyone who can create or update collections needs to see the user
// directory to populate the "share with" picker - that's not the same
// privilege as the Keycloak admin operations below (create/update/delete
// user), so this checks the configurable collections permission instead of
// requiring the admin role outright.
async function requireCollectionManager(user: RequestUser): Promise<void> {
  try {
    await requirePermission(user, 'collections', 'create');
    return;
  } catch (error) {
    if (!(error instanceof PermissionDeniedError)) throw error;
  }
  await requirePermission(user, 'collections', 'update');
}

function toUserTRPCError(error: any, fallbackMessage: string): TRPCError {
  if (error instanceof PermissionDeniedError) {
    return new TRPCError({ code: 'FORBIDDEN', message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/missing bearer token/i.test(message)) {
    return new TRPCError({ code: 'UNAUTHORIZED', message });
  }
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: message || fallbackMessage,
  });
}

export const users = createRouter()
  // Get all users (returns roles too). Used to populate the "share with"
  // picker for anyone who can create/update collections, not just admins -
  // see requireCollectionManager. The create/update/delete mutations below
  // remain admin-only since those call Keycloak's admin API directly
  // (backend/documents' users.js), so are intentionally NOT live-tested
  // against the real Keycloak instance during this port.
  .query('getAllUsers', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return [] as User[];
      }

      try {
        const user = await getRequestUser(token);
        await requireCollectionManager(user);

        const allUsers = await keycloakService.getAllUsers();
        const usersWithRoles = await Promise.all(
          allUsers.map(async (u: any) => {
            const roles = await keycloakService.getUserRealmRoles(u.id || u.userId);
            return {
              id: u.id || u.userId,
              email: u.email,
              username: u.username,
              firstName: u.firstName,
              lastName: u.lastName,
              name: u.name,
              roles,
              createdAt: u.createdAt,
            };
          })
        );
        return usersWithRoles as User[];
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to fetch users');
      }
    },
  })

  // Resolve email/name for a bounded set of user ids - unlike getAllUsers,
  // this doesn't require the Keycloak `admin` realm role. Non-admin callers
  // are restricted to ids of users they actually share a collection with
  // (as owner or invitee), which is the only legitimate reason the
  // collections page needs to resolve names today (showing "shared with"
  // badges) - it shouldn't need to enumerate the entire user directory for
  // that, and previously always failed for non-admin collection owners.
  .query('getUsersByIds', {
    input: z.object({
      ids: z.array(z.string()),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { ids, token } = input;
      if (ids.length === 0) return [] as User[];

      if (!token || typeof token !== 'string' || token.trim().length === 0) {
        return [] as User[];
      }

      try {
        const user = await getRequestUser(token);

        let permittedIds: string[];
        if (getUserRoles(user).includes('admin')) {
          permittedIds = ids;
        } else {
          const collections = await CollectionController.findByUserId(user.sub);
          const allowedIds = new Set<string>();
          collections.forEach((c: any) => {
            allowedIds.add(c.ownerId);
            (c.allowedUserIds || []).forEach((id: string) => allowedIds.add(id));
          });
          permittedIds = ids.filter((id) => allowedIds.has(id));
        }

        const resolvedUsers = await Promise.all(
          permittedIds.map((id) => keycloakService.getUserById(id))
        );
        return resolvedUsers
          .filter((u): u is NonNullable<typeof u> => u != null)
          .map((u: any) => ({
            id: u.id,
            email: u.email,
            username: u.username,
            firstName: u.firstName,
            lastName: u.lastName,
            name: u.name,
            roles: [],
            createdAt: u.createdAt,
          })) as User[];
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to fetch users');
      }
    },
  })

  // Create a new user
  .mutation('createUser', {
    input: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['admin', 'editor', 'viewer']).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { email, password, firstName, lastName, role, token } = input;
      try {
        const user = await getRequestUser(token);
        requireAdmin(user);

        const result = await keycloakService.createUser({ email, password, firstName, lastName });
        if (role) {
          await keycloakService.setUserRealmRoles(result.id, [role]);
        }
        return { ...result, roles: role ? [role] : [] };
      } catch (error: any) {
        if (error?.message?.includes('already exists')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'User with this email already exists',
          });
        }
        throw toUserTRPCError(error, 'Failed to create user');
      }
    },
  })

  // Update an existing user
  .mutation('updateUser', {
    input: z.object({
      id: z.string(),
      email: z.string().email().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      password: z.string().min(8).optional(),
      role: z.enum(['admin', 'editor', 'viewer', '']).optional(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, email, firstName, lastName, password, role, token } = input;
      try {
        const user = await getRequestUser(token);
        requireAdmin(user);

        await keycloakService.updateUser(id, { email, firstName, lastName, password });
        if (role !== undefined) {
          await keycloakService.setUserRealmRoles(id, role ? [role] : []);
        }
        return { ok: true };
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to update user');
      }
    },
  })

  // Delete a user
  .mutation('deleteUser', {
    input: z.object({
      id: z.string(),
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { id, token } = input;
      try {
        const user = await getRequestUser(token);
        requireAdmin(user);

        await keycloakService.deleteUser(id);
        return { ok: true };
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to delete user');
      }
    },
  });
