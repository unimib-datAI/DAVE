import { atom } from 'jotai';
import { secureStore, secureRetrieve } from '@/utils/encryption';

export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high';

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
  defaultThinkingEffort: ThinkingEffort;
  defaultFrequencyPenalty: number;
  defaultSystemPrompt: string;
};

export const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions about the user's documents.

<context>
{{CONTEXT}}
</context>

<question>
{{QUESTION}}
</question>

<instructions>
- Base your answer on the context above, combining information from several documents when it helps.
- You may draw reasonable conclusions from what the context says and use general knowledge to explain or connect it; make clear what comes from the documents and what is your own reasoning.
- If the context only partly answers the question, answer the part it covers and briefly say what is missing. Say that you cannot answer only when the context contains nothing relevant at all.
- Do not refuse just because the answer is not stated word for word: give the most useful answer the context supports.
- Always answer in the same language as the question, whatever the language of the documents.
- Write clearly, in a style suited to the subject.
</instructions>`;

// Earlier built-in defaults. A stored prompt equal to one of these was never
// customized by the user (the settings page saves the default as-is), so it
// is upgraded to the current default when the settings load.
const PREVIOUS_DEFAULT_SYSTEM_PROMPTS = [
  `You are an expert assistant that answers questions based on provided context.

<input>

<context>
{{CONTEXT}}
</context>

<question language="auto">
{{QUESTION}}
</question>

<instructions>
- Answer the question using ONLY information explicitly stated in the context.
- Integrate information from multiple documents only if they are consistent.
- Do NOT infer, speculate, generalize, or rely on external knowledge.
- The answer MUST be written in the same language as the question.
- If answering requires translating information from the context, translate faithfully
  without adding, omitting, or reinterpreting any content.
- Do NOT mention documents, context, retrieval, or sources explicitly.
- If the context is insufficient, incomplete, or ambiguous, respond EXACTLY with:
  "The information provided is not sufficient to answer with certainty." and give an explanation about why you can't answer.
Always assume that the user is asking you about information contained in the documents provided
- Use a clear, precise, and domain-appropriate technical style.
Make sure to ALWAYS answer in the same language used by the user to ask the question, don't ming the documents language
</instructions>

</input>`,
];

export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  baseURL: '',
  apiKey: '',
  model: '',
  useCustomSettings: false,
  enableMessageHistory: true,
  // Generation defaults
  defaultTemperature: 0.7,
  defaultMaxTokens: 8192,
  defaultTopP: 0.95,
  defaultTopK: 40,
  defaultThinkingEffort: 'medium',
  defaultFrequencyPenalty: 1.15,
  defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
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
  | 'defaultThinkingEffort'
  | 'defaultFrequencyPenalty'
  | 'defaultSystemPrompt'
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
      defaultThinkingEffort: newSettings.defaultThinkingEffort,
      defaultFrequencyPenalty: newSettings.defaultFrequencyPenalty,
      defaultSystemPrompt: newSettings.defaultSystemPrompt,
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

    // An unedited old built-in prompt becomes the current default; a prompt
    // the user wrote is kept as is.
    if (
      storedDefaults?.defaultSystemPrompt &&
      PREVIOUS_DEFAULT_SYSTEM_PROMPTS.some(
        (p) => p.trim() === storedDefaults.defaultSystemPrompt!.trim()
      )
    ) {
      storedDefaults.defaultSystemPrompt = DEFAULT_SYSTEM_PROMPT;
    }

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
