import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requireAdmin, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { keycloakService } from '@/lib/documentsBackend/keycloakService';

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
  // Get all users (returns roles too). Admin-only, like every route in this
  // router - these all call Keycloak's admin API (backend/documents'
  // users.js), so are intentionally NOT live-tested against the real
  // Keycloak instance during this port.
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
        requireAdmin(user);

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
