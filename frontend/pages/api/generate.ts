import { NextApiRequest, NextApiResponse } from 'next';

/**
 * Server-side proxy for text generation
 * This endpoint simply proxies requests to the text generation server
 * with proper streaming support
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

    // Get the text generation server URL
    const textGenerationUrl = 'http://10.0.0.108:7862/generate';

    // Forward the request to the text generation server
    const response = await fetch(textGenerationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      console.error(
        `Text generation server responded with status: ${response.status}`
      );
      res.status(response.status).json({
        message: `Text generation server error: ${response.statusText}`,
      });
      return;
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    // Get the reader from the response body
    const reader = response.body.getReader();

    // Stream the response directly to the client
    // This is important for proper streaming behavior
    await streamResponse(reader, res);
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

/**
 * Streams data from a ReadableStreamDefaultReader to an HTTP response
 */
async function streamResponse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  res: NextApiResponse
) {
  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Write each chunk as it arrives
      // This is crucial for streaming - sending chunks immediately
      res.write(value);

      // Force immediate sending of the chunk without buffering
      // This ensures true streaming behavior
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }

    // End the response when done
    res.end();
  } catch (error) {
    console.error('Error streaming response:', error);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

export default handler;

// Configure the API route to disable response buffering
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
    externalResolver: true, // Let us handle the response
  },
};
