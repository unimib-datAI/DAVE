import { atom } from 'jotai';
import { secureStore, secureRetrieve } from '@/utils/encryption';

export type LLMSettings = {
  baseURL: string;
  apiKey: string;
  model: string;
  useCustomSettings: boolean;
};

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  useCustomSettings: false,
};

const STORAGE_KEY = 'dave_llm_settings';

// Base atom for LLM settings
export const llmSettingsAtom = atom<LLMSettings>(DEFAULT_LLM_SETTINGS);

// Derived atom that persists settings to encrypted storage
export const persistedLLMSettingsAtom = atom(
  (get) => get(llmSettingsAtom),
  async (get, set, newSettings: LLMSettings) => {
    set(llmSettingsAtom, newSettings);

    if (newSettings.useCustomSettings) {
      // Only store if custom settings are enabled
      await secureStore(STORAGE_KEY, newSettings);
    } else {
      // Clear stored settings if custom settings are disabled
      localStorage.removeItem(STORAGE_KEY);
    }
  }
);

// Atom to load settings from storage on mount
export const loadLLMSettingsAtom = atom(
  null,
  async (get, set) => {
    try {
      const storedSettings = await secureRetrieve<LLMSettings>(STORAGE_KEY);
      if (storedSettings && storedSettings.useCustomSettings) {
        set(llmSettingsAtom, storedSettings);
        return storedSettings;
      }
    } catch (error) {
      console.error('Error loading LLM settings:', error);
    }
    return null;
  }
);

// Atom to clear settings
export const clearLLMSettingsAtom = atom(
  null,
  async (get, set) => {
    set(llmSettingsAtom, DEFAULT_LLM_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }
);
