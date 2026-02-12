import { atom } from 'jotai';
import { secureStore, secureRetrieve } from '@/utils/encryption';

export type LLMSettings = {
  baseURL: string;
  apiKey: string;
  model: string;
  useCustomSettings: boolean;
  enableMessageHistory: boolean;
  // Generation defaults
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultTopP: number;
  defaultTopK: number;
  defaultFrequencyPenalty: number;
};

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  useCustomSettings: false,
  enableMessageHistory: true,
  // Generation defaults
  defaultTemperature: 0.7,
  defaultMaxTokens: 1024,
  defaultTopP: 0.65,
  defaultTopK: 40,
  defaultFrequencyPenalty: 1.15,
};

// Separate storage keys for independent persistence
const CUSTOM_LLM_STORAGE_KEY = 'dave_llm_settings';
const GENERATION_DEFAULTS_STORAGE_KEY = 'dave_generation_defaults';

// The fields that belong to generation defaults (always persisted)
type GenerationDefaults = Pick<
  LLMSettings,
  | 'enableMessageHistory'
  | 'defaultTemperature'
  | 'defaultMaxTokens'
  | 'defaultTopP'
  | 'defaultTopK'
  | 'defaultFrequencyPenalty'
>;

// The fields that belong to custom LLM endpoint (only persisted when useCustomSettings is true)
type CustomLLMEndpoint = Pick<
  LLMSettings,
  'baseURL' | 'apiKey' | 'model' | 'useCustomSettings'
>;

// Base atom for LLM settings
export const llmSettingsAtom = atom<LLMSettings>(DEFAULT_LLM_SETTINGS);

// Derived atom that persists settings to encrypted storage
export const persistedLLMSettingsAtom = atom(
  (get) => get(llmSettingsAtom),
  async (get, set, newSettings: LLMSettings) => {
    set(llmSettingsAtom, newSettings);

    // Always persist generation defaults independently
    const generationDefaults: GenerationDefaults = {
      enableMessageHistory: newSettings.enableMessageHistory,
      defaultTemperature: newSettings.defaultTemperature,
      defaultMaxTokens: newSettings.defaultMaxTokens,
      defaultTopP: newSettings.defaultTopP,
      defaultTopK: newSettings.defaultTopK,
      defaultFrequencyPenalty: newSettings.defaultFrequencyPenalty,
    };
    await secureStore(GENERATION_DEFAULTS_STORAGE_KEY, generationDefaults);

    // Only persist custom LLM endpoint settings when enabled
    if (newSettings.useCustomSettings) {
      const customEndpoint: CustomLLMEndpoint = {
        baseURL: newSettings.baseURL,
        apiKey: newSettings.apiKey,
        model: newSettings.model,
        useCustomSettings: newSettings.useCustomSettings,
      };
      await secureStore(CUSTOM_LLM_STORAGE_KEY, customEndpoint);
    } else {
      // Clear custom LLM endpoint settings when disabled
      localStorage.removeItem(CUSTOM_LLM_STORAGE_KEY);
    }
  }
);

// Atom to load settings from storage on mount
export const loadLLMSettingsAtom = atom(null, async (get, set) => {
  try {
    // Load both storage keys independently
    const [storedCustom, storedDefaults] = await Promise.all([
      secureRetrieve<Partial<CustomLLMEndpoint>>(CUSTOM_LLM_STORAGE_KEY),
      secureRetrieve<Partial<GenerationDefaults>>(
        GENERATION_DEFAULTS_STORAGE_KEY
      ),
    ]);

    const mergedSettings: LLMSettings = {
      ...DEFAULT_LLM_SETTINGS,
      // Apply generation defaults if they exist
      ...(storedDefaults || {}),
      // Apply custom LLM endpoint settings only if they were enabled
      ...(storedCustom && storedCustom.useCustomSettings ? storedCustom : {}),
    };

    if (storedCustom || storedDefaults) {
      set(llmSettingsAtom, mergedSettings);
      return mergedSettings;
    }
  } catch (error) {
    console.error('Error loading LLM settings:', error);
  }
  return null;
});

// Atom to clear settings
export const clearLLMSettingsAtom = atom(null, async (get, set) => {
  set(llmSettingsAtom, DEFAULT_LLM_SETTINGS);
  localStorage.removeItem(CUSTOM_LLM_STORAGE_KEY);
  localStorage.removeItem(GENERATION_DEFAULTS_STORAGE_KEY);
});
