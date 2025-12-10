import { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

/**
 * Server-side proxy for text generation using OpenAI-compatible API
 * This endpoint uses the OpenAI library to communicate with a local
 * OpenAI-compatible server with proper streaming support
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

    // Get the base URL for the OpenAI-compatible server
    const baseURL = process.env.API_LLM || 'http://localhost:8000/v1';

    console.log('OpenAI-compatible server address:', baseURL);

    // Initialize OpenAI client with custom base URL
    const openai = new OpenAI({
      baseURL: baseURL,
      apiKey: 'dummy-key', // Most local servers don't require a real API key
    });

    // Extract parameters from request body
    const {
      messages,
      prompt,
      max_tokens = 1000,
      temperature = 0.7,
      top_p = 0.9,
      model = 'phi4-mini',
      ...otherParams
    } = req.body;
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

    // Create streaming completion
    const stream = await openai.chat.completions.create({
      model: model,
      messages: chatMessages,
      max_tokens: max_tokens,
      temperature: temperature,
      top_p: top_p,
      stream: true,
      ...otherParams,
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
