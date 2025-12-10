import { activeCollectionAtom } from '@/atoms/collection';
import { DocumentWithChunk } from '@/server/routers/search';
import { chatHistoryAtom, conversationRatedAtom } from '@/utils/atoms';
import { getPromptAndMessage } from '@/utils/textGeneration';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

export type Message = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  usrMessage?: string; // Original user message without system prompt
  context?: DocumentWithChunk[];
  isDoneStreaming?: boolean;
};

export type UseChatOptions = {
  endpoint: string;
  initialMessages: Message[];
};

export type GenerateOptions = {
  temperature?: number;
  max_new_tokens?: number;
  top_p?: number;
  top_k?: number;
  token_repetition_penalty_max?: number;
  system?: string;
  context?: DocumentWithChunk[];
};
const defaultSystemPropmt =
  "Sei un assistente che parla ITALIANO o INGLESE, scegli in base alla lingua della DOMANDA e del CONTESTO: se la domanda è formulata in INGLESE rispondi in INGLESE, se è formulata in ITALIANO rispondi in ITALIANO. La DOMANDA dell'utente si riferisce ai documenti che ti vengono forniti nel CONTESTO. Rispondi utilizzando solo le informazioni presenti nel CONTESTO. La risposta deve rielaborare le informazioni presenti nel CONTESTO. Argomenta in modo opportuno ed estensivo la risposta alla DOMANDA, devi generare risposte lunghe, non risposte da un paio di righe. Non rispondere con 'Risposta: ' o cose simili, deve essere un messaggio di chat vero e proprio. Se non conosci la risposta, limitati a dire che non lo sai.";
function useChat({ endpoint, initialMessages = [] }: UseChatOptions) {
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [activeCollection] = useAtom(activeCollectionAtom);
  const [conversationRated, setConversationRated] = useAtom(
    conversationRatedAtom,
  );

  // Initialize messages from chat history or initial messages
  const [messages, setMessages] = useState<Message[]>(() => {
    return chatHistory.messages && chatHistory.messages.length > 0
      ? chatHistory.messages
      : initialMessages || [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Update chat history when messages change
  useEffect(() => {
    setChatHistory({
      messages,
      contexts: [], // Legacy - not used anymore
      statuses: [], // Legacy - not used anymore
    });
  }, [messages, setChatHistory]);

  const appendMessage = async ({
    message,
    context,
    ...options
  }: GenerateOptions & {
    message: string;
    devMode?: boolean;
    system?: string;
  }) => {
    if (!message || message.trim() === '') {
      return;
    }
    console.log('received context', context);
    const contextValue = context
      ? context.map(
          (item) =>
            `Nome Documento ${item.title} - Contenuto: ${item.chunks
              .map((chunk) => chunk.text)
              .join(' ')}`,
        )
      : '';
    let content = '';
    if (options.system && options.system !== defaultSystemPropmt) {
      console.log('received system', options.system);
      content =
        options.system + `CONTESTO: ${contextValue} - DOMANDA: ${message}`;
    } else {
      content =
        defaultSystemPropmt + `CONTESTO: ${contextValue} - DOMANDA: ${message}`;
    }
    console.log('received content', content);
    // Create a new user message
    const userMessage: Message = {
      role: 'user',
      content: content,
      context: context,
      usrMessage: message, // Preserve original user message
      isDoneStreaming: true, // Mark user messages as done streaming immediately
    };

    // Add user message to the conversation - create a new array
    let tempMessages = [...messages, userMessage];
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setIsLoading(true);

    try {
      // Prepare messages for API - create a new array
      const messagesForAPI = [...messages, userMessage];

      // Normalize options to handle array values
      const normalizedOptions = {
        ...options,
        temperature: Array.isArray(options.temperature)
          ? options.temperature[0]
          : options.temperature,
        max_new_tokens: Array.isArray(options.max_new_tokens)
          ? options.max_new_tokens[0]
          : options.max_new_tokens,
        top_p: Array.isArray(options.top_p) ? options.top_p[0] : options.top_p,
        top_k: Array.isArray(options.top_k) ? options.top_k[0] : options.top_k,
        token_repetition_penalty_max: Array.isArray(
          options.token_repetition_penalty_max,
        )
          ? options.token_repetition_penalty_max[0]
          : options.token_repetition_penalty_max,
      };

      // Get formatted messages with system prompt
      const apiMessages = tempMessages.map((message, index) => {
        //check if is last user message
        if (message.role === 'user' && index === tempMessages.length - 1)
          return message;
        else {
          return {
            role: message.role,
            content: message.usrMessage,
          };
        }
      });
      console.log(
        'messages that will be sent, formatted and stripped',
        apiMessages,
      );

      // Call API through our server-side proxy endpoint
      const basePath =
        process.env.NEXT_PUBLIC_BASE_PATH === '/'
          ? ''
          : process.env.NEXT_PUBLIC_BASE_PATH || '';
      const response = await fetch(`${basePath}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...normalizedOptions,
          messages: apiMessages,
          collectionId: activeCollection,
        }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let assistantContent = '';
      let isFirstChunk = true;

      // Not loading anymore since we're streaming
      setIsLoading(false);

      // Start reading the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;

        if (isFirstChunk) {
          // Add initial assistant message (create a new message)
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: chunk,
              isDoneStreaming: false,
            },
          ]);
          isFirstChunk = false;
        } else {
          // Update the assistant message with the new content (create a new message)
          setMessages((prev) => {
            const newMessages = [...prev]; // Create a new array
            const lastIndex = newMessages.length - 1;

            if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
              // Create a new assistant message with updated content
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content: assistantContent,
                isDoneStreaming: false,
              };
            }

            return newMessages;
          });
        }
      }

      // Final update: mark assistant message as done streaming (create a new message)
      setMessages((prev) => {
        const newMessages = [...prev]; // Create a new array
        const lastIndex = newMessages.length - 1;

        if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
          // Create a new assistant message marked as done streaming
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            isDoneStreaming: true,
          };
        }

        return newMessages;
      });
    } catch (error) {
      console.error('Chat error:', error);
      // Add error message (create a new message)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, there was an error generating the response.',
          isDoneStreaming: true,
        },
      ]);
    } finally {
      setIsStreaming(false);
      setIsLoading(false);
    }
  };

  const restartChat = () => {
    // Reset to initial messages (create a new array)
    setMessages([...initialMessages]);
    setConversationRated(false);
  };

  return {
    messages,
    appendMessage,
    restartChat,
    state: { messages: messages || [] }, // Ensure messages is never undefined
    isStreaming,
    isLoading,
  };
}

export { useChat };
