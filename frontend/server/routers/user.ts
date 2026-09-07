import { z } from 'zod';
import { router, authedProcedure, TRPCError } from '../trpc';
import {
  requireAdmin,
  PermissionDeniedError,
} from '@/lib/documentsBackend/permission';
import { keycloakService } from '@/lib/documentsBackend/keycloakService';
import type { KeycloakUser } from '@/lib/types/user';

function toUserTRPCError(error: any, fallbackMessage: string): TRPCError {
  if (error instanceof PermissionDeniedError) {
    return new TRPCError({ code: 'FORBIDDEN', message: error.message });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: message || fallbackMessage,
  });
}

// Every route here hits Keycloak's admin API (backend/documents' users.js) and
// is admin-only — intentionally NOT live-tested against real Keycloak in this
// port.
export const usersRouter = router({
  getAllUsers: authedProcedure.query(async ({ ctx }) => {
    try {
      requireAdmin(ctx.user);

      const allUsers = await keycloakService.getAllUsers();
      const usersWithRoles = await Promise.all(
        allUsers.map(async (u: any) => {
          const roles = await keycloakService.getUserRealmRoles(
            u.id || u.userId
          );
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
      return usersWithRoles as KeycloakUser[];
    } catch (error: any) {
      throw toUserTRPCError(error, 'Failed to fetch users');
    }
  }),

  createUser: authedProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        role: z.enum(['admin', 'editor', 'viewer']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { email, password, firstName, lastName, role } = input;
      try {
        requireAdmin(ctx.user);

        const result = await keycloakService.createUser({
          email,
          password,
          firstName,
          lastName,
        });
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
    }),

  updateUser: authedProcedure
    .input(
      z.object({
        id: z.string(),
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        password: z.string().min(8).optional(),
        role: z.enum(['admin', 'editor', 'viewer', '']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, email, firstName, lastName, password, role } = input;
      try {
        requireAdmin(ctx.user);

        await keycloakService.updateUser(id, {
          email,
          firstName,
          lastName,
          password,
        });
        if (role !== undefined) {
          await keycloakService.setUserRealmRoles(id, role ? [role] : []);
        }
        return { ok: true };
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to update user');
      }
    }),

  deleteUser: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        requireAdmin(ctx.user);
        await keycloakService.deleteUser(input.id);
        return { ok: true };
      } catch (error: any) {
        throw toUserTRPCError(error, 'Failed to delete user');
      }
    }),
});
