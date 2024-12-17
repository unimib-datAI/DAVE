import { Message } from '@/hooks/use-chat';
import { DocumentWithChunk } from '@/server/routers/search';
import { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'stream';

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
  "Sei un assistente che parla esclusivamente italiano. La DOMANDA dell'utente si riferisce ai documenti che ti vengono forniti nel CONTESTO. Rispondi utilizzando solo le informazioni presenti nel CONTESTO. La risposta deve rielaborare le informazioni presenti nel CONTESTO. Argomenta in modo opportuno ed estensivo la risposta alla DOMANDA, devi generare risposte lunghe, non risposte da un paio di righe. Non rispondere con 'Risposta: ' o cose simili, deve essere un messaggio di chat vero e proprio. Se non conosci la risposta, limitati a dire che non lo sai.";
const defaultSystemPrompt = "Rispondi alle domande dell'utente.";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  console.log('called generate');
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
    console.log('setting search system prompt');
    systemContent = defaultSystemPromptSearch;
  }

  // add system prompt
  params.messages.unshift({ role: 'system', content: systemContent });
  // remove display message only used in the app
  // const messages = params.messages.map(({ usrMessage, ...rest }) => rest);
  const messages = params.messages;
  console.log('messages', messages);
  try {
    //      `${process.env.NEXT_PUBLIC_TEXT_GENERATION}/generate`,
    console.log('calling', process.env.NODE_ENV === 'development'
        ? `${process.env.NEXT_PUBLIC_TEXT_GENERATION}/generate`
        : `${process.env.NEXT_PUBLIC_TEXT_GENERATION}/generate`,)
    const response = await fetch(
      process.env.NODE_ENV === 'development'
        ? `${process.env.NEXT_PUBLIC_TEXT_GENERATION}/generate`
        : `${process.env.NEXT_PUBLIC_TEXT_GENERATION}/generate`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body: JSON.stringify({
          ...params,
          messages,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }
    // const reader = response.body.getReader();
    // const decoder = new TextDecoder('utf-8');

    // let receivedData = '';

    // res.setHeader('Content-Type', 'text/plain');
    // res.setHeader('Transfer-Encoding', 'chunked');

    // while (true) {
    //   const { value, done } = await reader.read();

    //   if (value) {
    //     receivedData += decoder.decode(value, { stream: true });
    //     const lines = receivedData.split('\n\n');

    //     lines.forEach((line, index) => {
    //       if (index < lines.length - 1 || line.startsWith('data:')) {
    //         res.write(line);
    //       }
    //     });

    //     receivedData = lines[lines.length - 1].startsWith('data:')
    //       ? lines[lines.length - 1]
    //       : '';
    //   }

    //   if (done) {
    //     break;
    //   }
    // }
    // res.end();
    const readableStream = response.body;
    const reader = readableStream.getReader();
    const nodeStream = new Readable({
      async read() {
        const { value, done } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          if (!this.push(value)) {
            // If push returns false, stop reading until _read is called again
            await new Promise((resolve) => this.once('drain', resolve));
          }
        }
      },
    });
    nodeStream.pipe(res);
  } catch (exception) {
    console.log(exception);
  }
};

export default handler;
