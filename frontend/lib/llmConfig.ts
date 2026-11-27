// Single source of truth for "which LLM do we call".
//
// Every server-side LLM call must go through getLlmConfig() (or getLlmClient())
// instead of reading API_LLM / LLM_KEY / LLM_NAME directly. When an admin
// enables custom settings in Settings > LLM, those win for everything;
// otherwise the environment variables are used.

import OpenAI from 'openai';
import { healClient } from './llmCompat';
import { dbConnect } from './db/connection';
import { LlmSettingsModel } from './db/models/LlmSettings';
import { decryptFieldIfEncrypted, encryptField } from './crypto/fieldEncryption';

export type LlmConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  /** Where the values came from. */
  source: 'settings' | 'env';
};

export type StoredLlmSettings = {
  useCustomSettings: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
};

// Short cache so a request doesn't hit Mongo for every LLM call; a save
// clears it immediately in this process.
const CACHE_MS = 5000;
let cache: { at: number; value: StoredLlmSettings | null } | null = null;

function envConfig(): LlmConfig {
  return {
    baseURL: process.env.API_LLM || 'http://localhost:8000/v1',
    apiKey: process.env.LLM_KEY || 'dummy-key',
    model: process.env.LLM_NAME || process.env.DEFAULT_MODEL || 'phi4-mini',
    source: 'env',
  };
}

export async function getStoredLlmSettings(): Promise<StoredLlmSettings | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  let value: StoredLlmSettings | null = null;
  try {
    await dbConnect();
    const row: any = await LlmSettingsModel.findOne({ key: 'global' }).lean();
    if (row) {
      let apiKey = row.apiKey ?? '';
      try {
        apiKey = decryptFieldIfEncrypted(apiKey);
      } catch {
        apiKey = '';
      }
      value = {
        useCustomSettings: Boolean(row.useCustomSettings),
        baseURL: row.baseURL ?? '',
        apiKey,
        model: row.model ?? '',
      };
    }
  } catch (error) {
    console.warn('[llmConfig] could not read LLM settings, using env', error);
  }
  cache = { at: Date.now(), value };
  return value;
}

/** The endpoint, key and model every LLM call should use right now. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const env = envConfig();
  const stored = await getStoredLlmSettings();
  if (!stored?.useCustomSettings) return env;
  return {
    baseURL: stored.baseURL || env.baseURL,
    apiKey: stored.apiKey || env.apiKey,
    model: stored.model || env.model,
    source: 'settings',
  };
}

export async function saveLlmSettings(
  settings: StoredLlmSettings,
  updatedBy?: string
) {
  await dbConnect();
  let apiKey = settings.apiKey;
  if (apiKey && process.env.FIELD_ENCRYPTION_KEY) apiKey = encryptField(apiKey);
  await LlmSettingsModel.updateOne(
    { key: 'global' },
    {
      $set: {
        useCustomSettings: settings.useCustomSettings,
        baseURL: settings.baseURL.trim(),
        apiKey,
        model: settings.model.trim(),
        updatedBy,
      },
    },
    { upsert: true }
  );
  cache = null;
}

export async function clearLlmSettings() {
  await dbConnect();
  await LlmSettingsModel.deleteOne({ key: 'global' });
  cache = null;
}

const clients = new Map<string, OpenAI>();

/** An OpenAI-compatible client for the current config, plus the model name. */
export async function getLlmClient(): Promise<{ client: OpenAI; model: string }> {
  const cfg = await getLlmConfig();
  const id = `${cfg.baseURL}\n${cfg.apiKey}`;
  let client = clients.get(id);
  if (!client) {
    // Self-healing: parameters the server rejects are dropped (llmCompat.ts).
    client = healClient(new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey }));
    clients.clear(); // keep only the current endpoint
    clients.set(id, client);
  }
  return { client, model: cfg.model };
}
