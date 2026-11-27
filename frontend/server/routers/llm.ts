// tRPC procedures for the app-wide LLM endpoint (Settings > LLM).
// Mounted as `llm.*` in _app.ts. See lib/llmConfig.ts.

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createRouter } from '../context';
import { getRequestUser } from '@/lib/documentsBackend/keycloakAuth';
import { requirePermission, PermissionDeniedError } from '@/lib/documentsBackend/permission';
import {
  clearLlmSettings,
  getLlmConfig,
  getStoredLlmSettings,
  saveLlmSettings,
} from '@/lib/llmConfig';

const tokenInput = z.object({ token: z.string().optional() });

async function authorize(token: string | undefined, section: 'chat' | 'settings') {
  try {
    const user = await getRequestUser(token);
    if (section === 'settings') await requirePermission(user, 'settings', 'llm');
    return user;
  } catch (error: any) {
    if (error instanceof PermissionDeniedError) {
      throw new TRPCError({ code: 'FORBIDDEN', message: error.message });
    }
    throw new TRPCError({ code: 'UNAUTHORIZED', message: error?.message ?? 'Unauthorized' });
  }
}

export const llm = createRouter()
  // What the app is using right now (no secrets): shown in the chat.
  .query('info', {
    input: tokenInput,
    async resolve({ input }) {
      await authorize(input.token, 'chat');
      const cfg = await getLlmConfig();
      return { model: cfg.model, source: cfg.source };
    },
  })
  // The saved endpoint settings, including the key, for the settings form.
  .query('get', {
    input: tokenInput,
    async resolve({ input }) {
      await authorize(input.token, 'settings');
      const stored = await getStoredLlmSettings();
      return (
        stored ?? { useCustomSettings: false, baseURL: '', apiKey: '', model: '' }
      );
    },
  })
  .mutation('save', {
    input: tokenInput.extend({
      useCustomSettings: z.boolean(),
      baseURL: z.string().max(500),
      apiKey: z.string().max(2000),
      model: z.string().max(300),
    }),
    async resolve({ input }) {
      const user = await authorize(input.token, 'settings');
      const { token, ...settings } = input;
      await saveLlmSettings(settings, (user as any)?.sub);
      return { ok: true };
    },
  })
  .mutation('clear', {
    input: tokenInput,
    async resolve({ input }) {
      await authorize(input.token, 'settings');
      await clearLlmSettings();
      return { ok: true };
    },
  });
