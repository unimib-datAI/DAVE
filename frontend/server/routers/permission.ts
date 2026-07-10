import { z } from 'zod';
import { createRouter } from '../context';
import { TRPCError } from '@trpc/server';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requireAdmin, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import { PermissionModel } from '@/lib/db/models/Permission';
import { dbConnect } from '@/lib/db/connection';

export type DAVEPermissions = {
  _id: string;
  collections: {
    create: string[];
    update: string[];
    delete: string[];
    view: string[];
    deAnonimize: string[];
  };
  document: {
    update: string[];
  };
  chat: {
    canUse: string[];
    canDevMode: string[];
  };
  settings: {
    llm: string[];
    pipeline: string[];
  };
};

const rolesArray = z.array(z.string());

const PermissionsInput = z.object({
  collections: z.object({
    create: rolesArray,
    update: rolesArray,
    delete: rolesArray,
    view: rolesArray,
    deAnonimize: rolesArray,
  }),
  document: z.object({
    update: rolesArray,
  }),
  chat: z.object({
    canUse: rolesArray,
    canDevMode: rolesArray,
  }),
  settings: z.object({
    llm: rolesArray,
    pipeline: rolesArray,
  }),
});

export const permissions = createRouter()
  .query('getCurrent', {
    input: z.object({
      token: z.string().optional(),
    }),
    async resolve({ input }) {
      const { token } = input;

      if (
        (!token || typeof token !== 'string' || token.trim().length === 0) &&
        process.env.USE_AUTH !== 'false'
      ) {
        return null;
      }

      try {
        // GET /api/permissions is auth-only in the old backend (any valid
        // token, no specific permission check) - getRequestUser throws if
        // the token is missing/invalid, matching that gate.
        await getRequestUser(token);
        await dbConnect();
        const result = await PermissionModel.findOne({}).lean();
        if (!result) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'No permissions configured',
          });
        }
        return result as any;
      } catch (error: any) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: /missing bearer token/i.test(error?.message || '')
            ? 'UNAUTHORIZED'
            : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to fetch permissions',
        });
      }
    },
  })
  .mutation('update', {
    input: z.object({
      token: z.string().optional(),
      permissions: PermissionsInput,
    }),
    async resolve({ input }) {
      const { token, permissions } = input;

      try {
        const user = await getRequestUser(token);
        // Admin role required, mirroring requireAdminRole - entirely
        // bypassed when USE_AUTH=false (anonymous users get admin rights).
        if (process.env.USE_AUTH !== 'false') {
          requireAdmin(user);
        }

        await dbConnect();
        const result = await PermissionModel.findOneAndUpdate(
          {},
          { $set: permissions },
          { new: true, upsert: true }
        ).lean();
        return result as any;
      } catch (error: any) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        throw new TRPCError({
          code: /missing bearer token/i.test(error?.message || '')
            ? 'UNAUTHORIZED'
            : 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to update permissions',
        });
      }
    },
  });
