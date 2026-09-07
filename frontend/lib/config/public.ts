/**
 * Client-safe configuration — the single source of truth for every
 * `NEXT_PUBLIC_*` environment variable (plus `NODE_ENV`).
 *
 * Why a module instead of scattered `process.env.NEXT_PUBLIC_*` reads:
 *  - one place to see every public knob and its default
 *  - normalisation done once (e.g. basePath, split lists)
 *  - the browser/server split is explicit — this file is safe to import
 *    from anywhere (browser components, `middleware.ts`, server code);
 *    server-only secrets live in `./server`.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time by textual
 * substitution, so every reference below MUST stay a literal
 * `process.env.NEXT_PUBLIC_FOO` expression — do not refactor them into a
 * loop or dynamic lookup or the values will be `undefined` in the browser.
 */

const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
// Next requires basePath to be '' or a '/prefix' — never '/'.
const basePath = !rawBasePath || rawBasePath === '/' ? '' : rawBasePath;

export const publicConfig = {
  /**
   * Whether the UI should behave as if auth is enabled. MUST agree with the
   * server-side `USE_AUTH` (see `serverConfig.useAuth`) — they are separate
   * vars for historical reasons and a mismatch causes redirect loops.
   */
  useAuth: process.env.NEXT_PUBLIC_USE_AUTH !== 'false',

  /** Next.js `basePath`, normalised to `''` or `'/prefix'`. */
  basePath,

  /**
   * Absolute external URL of the app root including basePath
   * (e.g. `https://host/dave`). Used for SSR-side tRPC/`next-auth` URLs.
   */
  fullPath: process.env.NEXT_PUBLIC_FULL_PATH ?? '',

  /** Base URL of the separate docs/export service, if deployed. */
  docsBaseUrl: process.env.NEXT_PUBLIC_DOCS_BASE_URL ?? '',

  /** Model name shown in the LLM search UI (display only, not used for calls). */
  llmDisplayName: process.env.NEXT_PUBLIC_LLM_NAME ?? 'unknown',

  /**
   * Default RAG system prompt override. Empty when unset — call sites keep
   * their own hard-coded fallback prose for now (see modules/search).
   */
  systemPrompt: process.env.NEXT_PUBLIC_SYSTEM_PROMPT ?? '',

  /** Suggested chat questions; the env var is `-|`-separated. */
  suggestedQuestions:
    typeof process.env.NEXT_PUBLIC_QUESTIONS === 'string'
      ? process.env.NEXT_PUBLIC_QUESTIONS.split('-|').filter(Boolean)
      : [],

  /** Vercel deploy URL, if hosting on Vercel (client-visible variant). */
  vercelUrl: process.env.NEXT_PUBLIC_VERCEL_URL ?? '',

  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
} as const;

export type PublicConfig = typeof publicConfig;
