import { z } from 'zod';
import { router, authedProcedure, TRPCError } from '../trpc';
import {
  requireAdmin,
  PermissionDeniedError,
} from '@/lib/documentsBackend/permission';
import { PermissionModel } from '@/lib/db/models/Permission';
import { dbConnect } from '@/lib/db/connection';
import { serverConfig } from '@/lib/config/server';

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

export const permissionsRouter = router({
  // Any authenticated caller (mirrors the old backend's auth-only gate). Under
  // USE_AUTH=false ctx.user is the anon user, so this still resolves.
  getCurrent: authedProcedure.query(async () => {
    try {
      await dbConnect();
      // Fresh Mongo: seed defaults rather than hard-failing every request.
      await PermissionModel.ensureDefaultPermissions();
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
        code: 'INTERNAL_SERVER_ERROR',
        message: error?.message || 'Failed to fetch permissions',
      });
    }
  }),
  update: authedProcedure
    .input(z.object({ permissions: PermissionsInput }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Admin required, unless USE_AUTH=false (anon users get admin rights).
        if (serverConfig.app.useAuth) {
          requireAdmin(ctx.user);
        }

        await dbConnect();
        const result = await PermissionModel.findOneAndUpdate(
          {},
          { $set: input.permissions },
          { new: true, upsert: true }
        ).lean();
        return result as any;
      } catch (error: any) {
        if (error instanceof PermissionDeniedError) {
          throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message || 'Failed to update permissions',
        });
      }
    }),
});
