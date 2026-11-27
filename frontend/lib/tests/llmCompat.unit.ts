// Unit tests of the self-healing chat completions (lib/llmCompat.ts).
// Run with `npm run test:unit`.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyFixes, createWithHealing, learnedFixes, rejectedParams } from '../llmCompat';

const base = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  max_tokens: 100,
  temperature: 0.7,
  top_p: 0.95,
  reasoning_effort: 'none',
  chat_template_kwargs: { enable_thinking: false },
};
const err = (status: number, message: string, extra: any = {}) =>
  Object.assign(new Error(`${status} ${message}`), { status, error: { message, ...extra } });

describe('rejectedParams', () => {
  it('reads Azure "Unrecognized request argument supplied"', () => {
    const e = err(400, 'Unrecognized request argument supplied: chat_template_kwargs', {
      code: 'unrecognized_request_argument',
    });
    assert.deepEqual(rejectedParams(e, base), [{ param: 'chat_template_kwargs', renameTo: undefined }]);
  });

  it('reads a list of arguments', () => {
    const e = err(400, 'Unrecognized request arguments supplied: chat_template_kwargs, reasoning_effort');
    assert.deepEqual(rejectedParams(e, base).map((f) => f.param).sort(), ['chat_template_kwargs', 'reasoning_effort']);
  });

  it('reads OpenAI "Unsupported parameter" and renames max_tokens', () => {
    const e = err(
      400,
      "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."
    );
    assert.deepEqual(rejectedParams(e, base), [{ param: 'max_tokens', renameTo: 'max_completion_tokens' }]);
  });

  it('reads "Unsupported value" for temperature', () => {
    const e = err(400, "Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported.");
    assert.deepEqual(rejectedParams(e, base).map((f) => f.param), ['temperature']);
  });

  it('reads pydantic "Extra inputs are not permitted"', () => {
    const e = Object.assign(new Error('422'), {
      status: 422,
      error: { detail: [{ loc: ['body', 'chat_template_kwargs'], msg: 'Extra inputs are not permitted' }] },
    });
    assert.deepEqual(rejectedParams(e, base).map((f) => f.param), ['chat_template_kwargs']);
  });

  it('reads an invalid value of reasoning_effort', () => {
    const e = err(400, "Invalid value for 'reasoning_effort': 'none'. Supported values are: 'low', 'medium', 'high'.");
    assert.deepEqual(rejectedParams(e, base).map((f) => f.param), ['reasoning_effort']);
  });

  it('ignores other errors and other statuses', () => {
    assert.deepEqual(rejectedParams(err(400, 'This model maximum context length is 8192 tokens'), base), []);
    assert.deepEqual(rejectedParams(err(401, 'Unrecognized request argument supplied: chat_template_kwargs'), base), []);
    assert.deepEqual(rejectedParams(err(500, 'internal error'), base), []);
  });

  it('never touches model, messages or stream', () => {
    const e = err(400, 'Unrecognized request argument supplied: messages, model, stream');
    assert.deepEqual(rejectedParams(e, base), []);
  });
});

describe('applyFixes', () => {
  it('drops and renames', () => {
    const out = applyFixes(base, [{ param: 'chat_template_kwargs' }, { param: 'max_tokens', renameTo: 'max_completion_tokens' }]);
    assert.equal(out.chat_template_kwargs, undefined);
    assert.equal(out.max_tokens, undefined);
    assert.equal(out.max_completion_tokens, 100);
  });
});

describe('createWithHealing', () => {
  it('retries without the rejected parameters and remembers them', async () => {
    const endpoint = { baseURL: 'https://strict.example', model: 'm' };
    const seen: Record<string, unknown>[] = [];
    const strict = async (p: Record<string, unknown>) => {
      seen.push(p);
      if (p.chat_template_kwargs) throw err(400, 'Unrecognized request argument supplied: chat_template_kwargs');
      if (p.reasoning_effort === 'none') throw err(400, "Invalid value for 'reasoning_effort': 'none'.");
      return 'ok';
    };
    assert.equal(await createWithHealing(endpoint, base, strict), 'ok');
    assert.equal(seen.length, 3);
    assert.deepEqual(learnedFixes(endpoint.baseURL, endpoint.model).map((f) => f.param), ['chat_template_kwargs', 'reasoning_effort']);

    // The next request skips them straight away.
    seen.length = 0;
    assert.equal(await createWithHealing(endpoint, base, strict), 'ok');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].top_p, 0.95);
  });

  it('rethrows errors it cannot heal', async () => {
    const boom = err(400, 'context length exceeded');
    await assert.rejects(
      createWithHealing({ baseURL: 'https://x', model: 'y' }, base, async () => {
        throw boom;
      }),
      (e) => e === boom
    );
  });
});
