// Self-healing chat completions for OpenAI-compatible servers.
//
// DAVE talks to many kinds of servers through one OpenAI client: llama.cpp,
// vLLM, SGLang, OpenAI, Azure AI... Their request schemas differ. Some
// parameters only make sense on some servers (`chat_template_kwargs` is a
// vLLM/llama.cpp extension; `reasoning_effort` only exists for reasoning
// models; o-series models refuse `max_tokens` and `temperature`), and strict
// servers reject the whole request with a 400 when they see one they do not
// know:
//
//   400 Unrecognized request argument supplied: chat_template_kwargs
//
// healClient() wraps a client so that such a request repairs itself:
//   1. the error message is read to find WHICH parameter the server rejected
//      (rejectedParams below - many wordings, see the unit tests);
//   2. that parameter is removed (or renamed, max_tokens -> max_completion_tokens)
//      and the request is sent again, up to MAX_RETRIES times;
//   3. the fix is remembered per server + model, so later requests to the
//      same endpoint skip the parameter straight away (no failed round trip).
// Only optional tuning parameters are ever dropped - never model, messages or
// stream - and any other error is rethrown unchanged.

/** Parameters that may be removed when a server rejects them. */
export const OPTIONAL_PARAMS = [
  'chat_template_kwargs',
  'reasoning_effort',
  'reasoning',
  'thinking',
  'top_p',
  'top_k',
  'temperature',
  'frequency_penalty',
  'presence_penalty',
  'repetition_penalty',
  'min_p',
  'seed',
  'stop',
  'logit_bias',
  'user',
  'n',
  'parallel_tool_calls',
  'response_format',
  'stream_options',
  'max_tokens',
];

/** What to do with a rejected parameter: drop it, or send its value under another name. */
export type ParamFix = { param: string; renameTo?: string };

const MAX_RETRIES = 4;

/** The error text of an OpenAI SDK error (message, error body, details). */
function errorText(error: any): string {
  const parts = [
    error?.message,
    error?.error?.message,
    error?.error?.details,
    typeof error?.error === 'string' ? error.error : undefined,
  ];
  // FastAPI/pydantic servers list the offending fields in `detail[].loc`.
  const detail = error?.error?.detail ?? error?.detail;
  if (Array.isArray(detail)) {
    for (const d of detail) {
      if (Array.isArray(d?.loc)) parts.push(`${d.msg ?? ''} loc:${d.loc.join('.')}`);
    }
  } else if (typeof detail === 'string') {
    parts.push(detail);
  }
  return parts.filter((p) => typeof p === 'string' && p).join(' | ');
}

/**
 * Which parameters of `params` the server rejected, read from its error.
 * Empty when the error is not about a request parameter (it is then rethrown).
 */
export function rejectedParams(error: any, params: Record<string, unknown>): ParamFix[] {
  const status = error?.status ?? error?.statusCode;
  if (status !== undefined && status !== 400 && status !== 422) return [];
  const text = errorText(error);
  if (!text) return [];
  const present = OPTIONAL_PARAMS.filter((p) => params[p] !== undefined);
  if (present.length === 0) return [];

  const fixes = new Map<string, ParamFix>();
  const add = (param: string, renameTo?: string) => {
    if (present.includes(param) && !fixes.has(param)) fixes.set(param, { param, renameTo });
  };

  // "Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens' instead."
  const rename = /['"`]?max_tokens['"`]?[^|]*?\buse ['"`]?(max_completion_tokens)['"`]?/i.exec(text);
  if (rename) add('max_tokens', rename[1]);

  // Explicit lists: "Unrecognized request argument(s) supplied: a, b",
  // "Unknown parameter(s): a", "Extra inputs are not permitted loc:body.a".
  const listRe =
    /(?:unrecognized request arguments? supplied|unrecognized (?:arguments?|parameters?|fields?)|unknown (?:arguments?|parameters?|fields?|keys?)|unsupported (?:arguments?|parameters?)|unexpected (?:keyword )?(?:arguments?|parameters?|fields?)|extra (?:inputs|fields) (?:are|is) not permitted[^|]*?loc:(?:body\.)?)\s*:?\s*([\w.,'"` -]+)/gi;
  for (const m of Array.from(text.matchAll(listRe))) {
    for (const name of m[1].split(/[,\s'"`]+/)) add(name.split('.')[0]);
  }
  // A quoted parameter next to a rejection word, in either order:
  // "'reasoning_effort' is not supported with this model",
  // "Unsupported value: 'temperature' does not support 0.7".
  for (const p of present) {
    const q = `['"\`]${p}['"\`]`;
    const near = new RegExp(
      `${q}[^|]{0,80}(not supported|unsupported|not allowed|not permitted|unrecognized|unknown|invalid|does not support)|` +
        `(not supported|unsupported|not allowed|not permitted|unrecognized|unknown|invalid)[^|]{0,40}${q}`,
      'i'
    );
    if (near.test(text)) add(p);
  }
  // Last resort: the message names exactly one optional parameter we sent,
  // with a rejection word somewhere - that parameter is the culprit.
  if (fixes.size === 0 && /not supported|unsupported|unrecognized|unknown|not permitted|not allowed|invalid/i.test(text)) {
    const named = present.filter((p) => new RegExp(`\\b${p}\\b`).test(text));
    if (named.length === 1) add(named[0]);
  }
  return Array.from(fixes.values());
}

/** Applies fixes to a request (returns a new object). */
export function applyFixes(params: Record<string, unknown>, fixes: ParamFix[]): Record<string, unknown> {
  const out = { ...params };
  for (const { param, renameTo } of fixes) {
    if (!(param in out)) continue;
    if (renameTo && out[renameTo] === undefined) out[renameTo] = out[param];
    delete out[param];
  }
  return out;
}

// Fixes learned per endpoint (base URL + model). On `global` so a Next.js dev
// hot reload does not forget them.
declare global {
  // eslint-disable-next-line no-var
  var __llmParamFixes: Map<string, ParamFix[]> | undefined;
}
const learned: Map<string, ParamFix[]> = (global.__llmParamFixes ??= new Map());

/** Fixes learned so far for an endpoint (for tests and diagnostics). */
export function learnedFixes(baseURL: string | undefined, model: string | undefined): ParamFix[] {
  return learned.get(`${baseURL ?? ''}|${model ?? ''}`) ?? [];
}

/**
 * Sends a chat completion, healing rejected parameters (see top of file).
 * `send` performs the actual call with the given parameters.
 */
export async function createWithHealing<T>(
  endpoint: { baseURL?: string; model?: string },
  params: Record<string, unknown>,
  send: (params: Record<string, unknown>) => Promise<T>
): Promise<T> {
  const key = `${endpoint.baseURL ?? ''}|${endpoint.model ?? (params.model as string) ?? ''}`;
  let current = applyFixes(params, learned.get(key) ?? []);
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(current);
    } catch (error) {
      const fixes = attempt < MAX_RETRIES ? rejectedParams(error, current) : [];
      if (fixes.length === 0) throw error;
      const known = learned.get(key) ?? [];
      learned.set(key, [...known, ...fixes.filter((f) => !known.some((k) => k.param === f.param))]);
      console.warn(
        `[llm] ${endpoint.baseURL ?? ''} (${current.model}) rejected ${fixes
          .map((f) => (f.renameTo ? `${f.param} (now sent as ${f.renameTo})` : f.param))
          .join(', ')}: retrying without it; later requests to this endpoint skip it.`
      );
      current = applyFixes(current, fixes);
    }
  }
}

/**
 * Makes `client.chat.completions.create` self-healing (see top of file) and
 * returns the same client. Safe to call more than once.
 */
export function healClient<C extends { baseURL?: string; chat: { completions: { create: any } } }>(
  client: C
): C {
  const completions: any = client.chat.completions;
  if (completions.__healing) return client;
  const original = completions.create.bind(completions);
  completions.create = (params: any, options?: any) =>
    createWithHealing({ baseURL: client.baseURL, model: params?.model }, params, (p) =>
      original(p, options)
    );
  completions.__healing = true;
  return client;
}
