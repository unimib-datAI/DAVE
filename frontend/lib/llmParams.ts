// Request parameters that switch a model's reasoning on or off, shared by the
// chat (pages/api/generate.ts) and background jobs.
//
// chat_template_kwargs is what llama.cpp and vLLM pass to the chat template
// (Qwen3, Gemma, gpt-oss read enable_thinking / reasoning_effort there);
// reasoning_effort is the OpenAI-style field for servers that read it from
// the request itself.

const THINKING_EFFORTS = ['low', 'medium', 'high'];

export function thinkingParams(thinking: unknown): Record<string, unknown> {
  if (typeof thinking === 'string' && THINKING_EFFORTS.includes(thinking)) {
    return {
      reasoning_effort: thinking,
      chat_template_kwargs: {
        enable_thinking: true,
        reasoning_effort: thinking,
      },
    };
  }
  const on = thinking === undefined && process.env.CHAT_LLM_THINKING === 'true';
  return on ? {} : { chat_template_kwargs: { enable_thinking: false } };
}
