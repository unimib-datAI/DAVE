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
      max_tokens = 1000,
      temperature = 0.7,
      top_p = 0.9,
      model = 'phi4-mini',
      useMultiAgent = false,
      customSettings, // Custom LLM settings from frontend
      ...otherParams
    } = req.body;

    // Determine which settings to use
    let baseURL = process.env.API_LLM || 'http://localhost:8000/v1';
    let apiKey = 'dummy-key'; // Most local servers don't require a real API key
    let modelToUse = model;

    // If custom settings are provided and enabled, use them
    if (customSettings?.useCustomSettings) {
      console.log('Using custom LLM settings from user configuration');
      baseURL = customSettings.baseURL || baseURL;
      apiKey = customSettings.apiKey || apiKey;
      modelToUse = customSettings.model || modelToUse;
    }

    console.log('OpenAI-compatible server address:', baseURL);
    console.log('Using model:', modelToUse);

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
      console.log(
        'calling generation with ',
        JSON.stringify({
          model: modelToUse,
          messages: chatMessages,
          max_tokens: max_tokens,
          temperature: temperature,
          top_p: top_p,
          stream: true,
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
        ...filteredOtherParams,
      });

      // Stream the response to the client
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          // Write each chunk as it arrives
          res.write(content);

          // Force immediate sending of the chunk without buffering
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        }
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
