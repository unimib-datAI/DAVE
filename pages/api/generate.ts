import { Message } from '@/hooks/use-chat';
import { DocumentWithChunk } from '@/server/routers/search';
import { NextApiRequest, NextApiResponse } from 'next';

export type GenerateRequest = {
  messages: Message[];
  system?: string;
  temperature?: number;
  max_new_tokens?: number;
  top_p?: number;
  token_repetition_penalty_max?: number;
  devMode?: boolean;
};

const defaultSystemPromptSearch =
  "Sei un assistente che parla esclusivamente italiano. La DOMANDA dell'utente si riferisce ai documenti che ti vengono forniti nel CONTESTO. Rispondi utilizzando solo le informazioni nel CONTESTO. Se non conosci la risposta, limitati a dire che non lo sai.";
const defaultSystemPrompt = "Rispondi alle domande dell'utente.";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method Not Allowed' });
    return;
  }

  const params = req.body as GenerateRequest;

  if (!params.messages) {
    res.status(401).json({ message: 'messages is required' });
  }

  let systemContent = '';

  if (params.system) {
    systemContent = params.system;
  } else if (params.devMode) {
    systemContent = defaultSystemPrompt;
  } else {
    systemContent = defaultSystemPromptSearch;
  }

  // add system prompt
  params.messages.unshift({ role: 'system', content: systemContent });
  // remove display message only used in the app
  const messages = params.messages.map(({ usrMessage, ...rest }) => rest);
  console.log('messages used', messages);
  try {
    const response = await fetch(`${process.env.API_LLM}/generate`, {
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        ...params,
        messages,
      }),
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }
    const readableStream = response.body as unknown as NodeJS.ReadableStream;
    readableStream.pipe(res);
  } catch (exception) {
    console.log(exception);
  }
};

export default handler;
