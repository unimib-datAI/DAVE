import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { executeMultiAgent } from '@/lib/multiAgent';

/**
 * Server-side proxy for text generation using OpenAI-compatible API
 * This endpoint uses the OpenAI library to communicate with a local
 * OpenAI-compatible server with proper streaming support
 *
 * Supports custom LLM settings passed via request body
 */
const THINKING_EFFORTS = ['low', 'medium', 'high'];

// The model-side switches for the chat's thinking select. chat_template_kwargs
// is what llama.cpp and vLLM pass to the chat template (Qwen3, Gemma, gpt-oss
// read enable_thinking / reasoning_effort there); reasoning_effort is the
// OpenAI-style field for servers that read it from the request itself.
function thinkingParams(thinking: unknown): Record<string, unknown> {
  if (typeof thinking === 'string' && THINKING_EFFORTS.includes(thinking)) {
    return {
      reasoning_effort: thinking,
      chat_template_kwargs: { enable_thinking: true, reasoning_effort: thinking },
    };
  }
  const on = thinking === undefined && process.env.CHAT_LLM_THINKING === 'true';
  return on ? {} : { chat_template_kwargs: { enable_thinking: false } };
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  console.log('request', req.body);

  try {
    // Set appropriate headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Prevents proxy buffering
    res.setHeader('Transfer-Encoding', 'chunked');

    // Extract parameters from request body
    const {
      messages,
      prompt,
      max_tokens: maxTokensParam,
      max_new_tokens, // sent by the chat UI
      thinking_effort, // 'off' | 'low' | 'medium' | 'high'
      temperature = 0.7,
      top_p = 0.9,
      model,
      useMultiAgent = false,
      customSettings, // Custom LLM settings from frontend
      collectionId, // Collection to restrict retrieval to
      filterIds, // Document IDs to restrict retrieval to
      thinking, // 'off' | 'low' | 'medium' | 'high' (chat's thinking select)
      ...otherParams
    } = req.body;

    const max_tokens = max_new_tokens ?? maxTokensParam ?? 8192;

    // Determine which settings to use
    let baseURL = process.env.API_LLM || 'http://localhost:8000/v1';
    let apiKey = process.env.LLM_KEY || 'dummy-key';
    // Prefer model from request, then environment, then fallback default
    const envModel =
      process.env.LLM_NAME || process.env.DEFAULT_MODEL || 'phi4-mini';
    let modelToUse = model ?? envModel;

    // If custom settings are provided and enabled, use them
    if (customSettings?.useCustomSettings) {
      baseURL = customSettings.baseURL || baseURL;
      apiKey = customSettings.apiKey || apiKey;
      modelToUse = customSettings.model || modelToUse;
    }

    // Initialize OpenAI client with configured settings
    const openai = new OpenAI({
      baseURL: baseURL,
      apiKey: apiKey,
    });
    let rawMessages = messages;
    if (!rawMessages && prompt) {
      rawMessages = [
        {
          role: 'user',
          content: prompt,
        },
      ];
    }
    if (!rawMessages || rawMessages.length === 0) {
      throw new Error('No messages or prompt provided');
    }

    // Clean and normalize messages
    const chatMessages = rawMessages
      .map((msg: any) => ({
        role: msg.role,
        // Handle both 'content' and 'usrMessage' fields
        content: msg.content || msg.usrMessage || '',
      }))
      .filter((msg: any) => {
        // Filter out messages with empty content or invalid roles
        return (
          msg.content &&
          msg.content.trim() !== '' &&
          (msg.role === 'user' ||
            msg.role === 'assistant' ||
            msg.role === 'system')
        );
      });

    if (chatMessages.length === 0) {
      throw new Error('No valid messages after filtering');
    }

    // Check if multi-agent system should be used
    if (useMultiAgent) {
      console.log('[API] Using Multi-Agent System');

      // Execute multi-agent system with streaming
      await executeMultiAgent(
        chatMessages,
        {
          baseURL: baseURL,
          apiKey: apiKey,
          model: modelToUse,
          temperature: temperature,
          max_tokens: max_tokens,
          // Retrieval params – used by the multi-agent's internal retrievers
          indexerBaseURL: process.env.API_INDEXER,
          indexName: process.env.ELASTIC_INDEX,
          // collectionId may arrive as a full collection object or a plain string
          collectionId:
            typeof collectionId === 'string'
              ? collectionId
              : collectionId?.id ?? undefined,
          filterIds: Array.isArray(filterIds) ? filterIds : undefined,
        },
        (chunk: string) => {
          // Stream each chunk to the client
          res.write(chunk);

          // Force immediate sending of the chunk without buffering
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      );

      // End the response when done
      res.end();
    } else {
      console.log('[API] Using Standard Generation');

      // Create streaming completion
      // Only forward a small, explicit whitelist of parameters to the OpenAI-compatible API.
      // This prevents passing provider-specific or custom fields (e.g. collectionId, max_new_tokens, system, etc.)
      // which newer OpenAI clients will reject with "Unrecognized request arguments".
      const ALLOWED_OPENAI_PARAMS = new Set([
        'max_tokens',
        'temperature',
        'top_p',
        'n',
        'stop',
        'presence_penalty',
        'frequency_penalty',
        'logit_bias',
        'user',
      ]);

      const filteredOtherParams: Record<string, any> = {};
      if (otherParams && typeof otherParams === 'object') {
        for (const [k, v] of Object.entries(otherParams)) {
          if (ALLOWED_OPENAI_PARAMS.has(k)) {
            filteredOtherParams[k] = v;
          }
        }
      }
      // Thinking control. `reasoning_effort` is the OpenAI-compatible knob;
      // `chat_template_kwargs.enable_thinking` is honoured by vLLM/SGLang
      // chat templates (Qwen3, etc.) to switch thinking off entirely.
      const thinkingParams: Record<string, any> = {};
      if (['off', 'low', 'medium', 'high'].includes(thinking_effort)) {
        if (thinking_effort === 'off') {
          thinkingParams.reasoning_effort = 'none';
          thinkingParams.chat_template_kwargs = { enable_thinking: false };
        } else {
          thinkingParams.reasoning_effort = thinking_effort;
          thinkingParams.chat_template_kwargs = { enable_thinking: true };
        }
      }
      console.log(
        'calling generation with ',
        JSON.stringify({
          model: modelToUse,
          messages: chatMessages,
          max_tokens: max_tokens,
          temperature: temperature,
          top_p: top_p,
          stream: true,
          ...thinkingParams,
          ...filteredOtherParams,
        })
      );
      const stream = await openai.chat.completions.create({
        model: modelToUse,
        messages: chatMessages,
        max_tokens: max_tokens,
        temperature: temperature,
        top_p: top_p,
        stream: true,
        ...thinkingParams,
        ...filteredOtherParams,
      } as any);

      // Stream the response to the client
      let answered = false;
      let finishReason: string | null | undefined;
      for await (const chunk of stream as any) {
        finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) answered = true;

        if (content) {
          // Write each chunk as it arrives
          res.write(content);

          // Force immediate sending of the chunk without buffering
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
      }

      if (!answered) {
        // reasoning_content is not forwarded, so an empty stream would show an
        // empty message with no clue why.
        console.warn(`[API] The model returned no answer (finish_reason: ${finishReason})`);
        res.write(
          finishReason === 'length'
            ? 'The model used its whole token limit before answering (it was probably still reasoning). Increase the max tokens in the chat settings or use a model without thinking.'
            : 'The model returned an empty answer.'
        );
      }

      // End the response when done
      res.end();
    }
  } catch (error) {
    console.error('Error in generate API:', error);
    if (!res.writableEnded) {
      res.status(500).json({
        message: `Internal server error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }
};

export default handler;

// Configure the API route to disable response buffering
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true, // Let us handle the response
  },
};
