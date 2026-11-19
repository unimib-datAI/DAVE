import OpenAI from 'openai';

/**
 * Makes an OpenAI client tolerant to providers that reject parameters.
 *
 * Cloud providers (Azure, OpenAI, ...) and on-premise servers (llama.cpp,
 * vLLM, Unsloth, ...) each accept a slightly different set of parameters. On a
 * 400 error this wrapper reads the provider's message, fixes the request
 * (drops the unsupported parameter, picks the nearest allowed value, renames
 * max_tokens) and retries. What it learns is cached per endpoint + model, so
 * the retry cost is paid once.
 */

type Params = Record<string, any>;
type Fix = { action: 'drop' } | { action: 'set'; value: any } | { action: 'rename'; to: string };

const learned = new Map<string, Record<string, Fix>>();
const MAX_RETRIES = 5;

// Ordered scale used to map a requested reasoning effort to an allowed one.
const EFFORT_SCALE = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function nearestAllowed(requested: unknown, allowed: string[]): string | undefined {
  const idx = EFFORT_SCALE.indexOf(String(requested));
  if (idx === -1) return undefined;
  // never turn thinking on into "none" (or the opposite) unless asked for
  const candidates = allowed.filter(
    (a) => EFFORT_SCALE.includes(a) && (a === 'none') === (requested === 'none')
  );
  if (!candidates.length) return undefined;
  return candidates.sort((a, b) => {
    const da = Math.abs(EFFORT_SCALE.indexOf(a) - idx);
    const db = Math.abs(EFFORT_SCALE.indexOf(b) - idx);
    return da - db || EFFORT_SCALE.indexOf(b) - EFFORT_SCALE.indexOf(a);
  })[0];
}

function parseAllowed(message: string): string[] {
  const m = message.match(/(?:allowed|supported|valid) values? (?:are|is)\s*:?\s*([^\n]*)/i);
  if (!m) return [];
  return m[1]
    .replace(/\.\s*$/, '')
    .split(/,|\bor\b/)
    .map((v) => v.replace(/['"`\s]/g, ''))
    .filter(Boolean);
}

// Works out how to fix the request from a provider's 400 message.
function diagnose(err: any, params: Params): { param: string; fix: Fix } | null {
  if (err?.status !== 400) return null;
  const message: string = String(err?.error?.message ?? err?.message ?? '');

  // Azure: "Unrecognized request argument supplied: X"
  // OpenAI: "Unrecognized request argument(s) supplied: X" / "Unknown parameter: 'X'"
  // OpenAI: "Unsupported parameter: 'X'"
  const unknown =
    message.match(/Unrecognized request arguments? (?:\(s\) )?supplied:\s*([\w.,\s]+)/i)?.[1] ??
    message.match(/(?:Unknown|Unsupported) parameter:?\s*'?([\w.]+)'?/i)?.[1];
  if (unknown) {
    const name = unknown.split(/[,\s]+/)[0].split('.')[0];
    // o-series: "Unsupported parameter: 'max_tokens' ... Use 'max_completion_tokens' instead."
    const renameTo = message.match(/use '(\w+)' instead/i)?.[1];
    if (name in params) {
      return { param: name, fix: renameTo ? { action: 'rename', to: renameTo } : { action: 'drop' } };
    }
  }

  // Azure: "Property X has an invalid value: Y. Allowed values are: a, b."
  // OpenAI: "Invalid value: 'Y'. Supported values are: 'a' and 'b'."
  const param: string | undefined =
    err?.param ?? message.match(/Property (\w+) has an invalid value/i)?.[1];
  if (param && param in params && /values? (are|is)/i.test(message)) {
    const best = nearestAllowed(params[param], parseAllowed(message));
    return { param, fix: best ? { action: 'set', value: best } : { action: 'drop' } };
  }

  // OpenAI: "Unsupported value: 'temperature' does not support 0.7 with this model."
  const unsupportedValue = message.match(/Unsupported value: '(\w+)'/i)?.[1];
  if (unsupportedValue && unsupportedValue in params) {
    return { param: unsupportedValue, fix: { action: 'drop' } };
  }
  return null;
}

function applyFix(params: Params, param: string, fix: Fix) {
  if (fix.action === 'drop') delete params[param];
  else if (fix.action === 'set') params[param] = fix.value;
  else {
    params[fix.to] = params[param];
    delete params[param];
  }
}

export function withAdaptiveParams(client: OpenAI, baseURL: string): OpenAI {
  const original = client.chat.completions.create.bind(client.chat.completions);

  (client.chat.completions as any).create = async (body: Params, options?: any) => {
    const key = `${baseURL}|${body.model}`;
    const params: Params = { ...body };

    // Reuse what was learned for this endpoint + model.
    const known = learned.get(key) ?? {};
    for (const [p, fix] of Object.entries(known)) if (p in params) applyFix(params, p, fix);

    for (let attempt = 0; ; attempt++) {
      try {
        return await (original as any)(params, options);
      } catch (err) {
        const found = attempt < MAX_RETRIES ? diagnose(err, params) : null;
        if (!found) throw err;
        console.warn(
          `[LLM] ${baseURL} rejected "${found.param}" (${(err as any).message}); retrying with`,
          found.fix
        );
        learned.set(key, { ...(learned.get(key) ?? {}), [found.param]: found.fix });
        applyFix(params, found.param, found.fix);
      }
    }
  };
  return client;
}
