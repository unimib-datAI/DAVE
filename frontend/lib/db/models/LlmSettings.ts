// The app-wide LLM endpoint (base URL, API key, model) chosen in
// Settings > LLM. A singleton document: every LLM call on the server reads it
// through lib/llmConfig.ts, so the choice applies to all users and to every
// feature that uses an LLM (chat, agent mode, deep research, graph build...).
import mongoose, { Schema, Model } from 'mongoose';

export interface ILlmSettings {
  key: 'global';
  useCustomSettings: boolean;
  baseURL: string;
  // AES-GCM encrypted when FIELD_ENCRYPTION_KEY is set (see llmConfig.ts).
  apiKey: string;
  model: string;
  updatedBy?: string;
  updatedAt?: Date;
}

const LlmSettingsSchema = new Schema<ILlmSettings>(
  {
    key: { type: String, default: 'global', unique: true },
    useCustomSettings: { type: Boolean, default: false },
    baseURL: { type: String, default: '' },
    apiKey: { type: String, default: '' },
    model: { type: String, default: '' },
    updatedBy: String,
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const LlmSettingsModel: Model<ILlmSettings> =
  mongoose.models.LlmSettings ||
  mongoose.model<ILlmSettings>('LlmSettings', LlmSettingsSchema, 'llmSettings');
