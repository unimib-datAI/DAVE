import { activeCollectionAtom } from '@/atoms/collection';
import { DocumentWithChunk } from '@/server/routers/search';
import { getPromptAndMessage } from '@/utils/textGeneration';
import { llmSettingsAtom, DEFAULT_SYSTEM_PROMPT } from '@/atoms/llmSettings';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useChatState, useChatDispatch } from '@/modules/chat/ChatProvider';
import { useText } from '@/components/TranslationProvider';
import { globalAnonymizationAtom } from '@/utils/atoms';

export type Message = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  usrMessage?: string; // Original user message without system prompt
  context?: DocumentWithChunk[];
  isDoneStreaming?: boolean;
  devPrompt?: string; // Full prompt with context, question and instructions (for dev mode)
  wasAnonymized?: boolean; // Tracks if anonymization was enabled when this message was generated
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
  useMultiAgent?: boolean;
};

function useChat({ endpoint, initialMessages = [] }: UseChatOptions) {
  const chatState = useChatState();
  const dispatch = useChatDispatch();
  const [activeCollection] = useAtom(activeCollectionAtom);
  const [llmSettings] = useAtom(llmSettingsAtom);
  const [isAnonymized] = useAtom(globalAnonymizationAtom);
  const t = useText('chat');

  // Initialize messages from chat history or initial messages
  const [messages, setMessages] = useState<Message[]>(() => {
    return chatState.messages && chatState.messages.length > 0
      ? chatState.messages
      : initialMessages || [];
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Update chat state when messages change
  useEffect(() => {
    dispatch({
      type: 'setMessages',
      payload: { messages },
    });
  }, [messages, dispatch]);

  const appendMessage = async ({
    message,
    context,
    devMode,
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
    let contextStr = '';
    if (context) {
      context.forEach((item, index) => {
        const docContent = `Nome Documento ${
          item.title
        } - Contenuto: ${item.chunks
          .map((chunk) =>
            isAnonymized ? chunk.text_anonymized || chunk.text : chunk.text
          )
          .join(' ')}`;
        contextStr += `<document id="DOC_${
          index + 1
        }">\n${docContent}\n</document>\n`;
      });
    }

    // Apply generation defaults from llmSettings when options are undefined.
    // Important: when devMode is active we want the values coming from the dev UI
    // to be authoritative — i.e. the dev-mode options should override saved
    // settings. When not in devMode, fall back to the saved generation defaults.
    const appliedOptions = devMode
      ? { ...options } // use dev UI values as-is (ChatPanel initializes them from llmSettings)
      : {
          ...options,
          temperature:
            options.temperature ?? llmSettings.defaultTemperature ?? 0.7,
          max_new_tokens:
            options.max_new_tokens ?? llmSettings.defaultMaxTokens ?? 1024,
          top_p: options.top_p ?? llmSettings.defaultTopP ?? 0.65,
          top_k: options.top_k ?? llmSettings.defaultTopK ?? 40,
          token_repetition_penalty_max:
            options.token_repetition_penalty_max ??
            llmSettings.defaultFrequencyPenalty ??
            1.15,
        };

    // Determine system prompt: Always use settings prompt, unless in devMode with custom system
    const defaultSystemPrompt =
      llmSettings.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT;
    let finalSystemPrompt =
      devMode && options.system !== undefined
        ? options.system
        : defaultSystemPrompt;
    let userMessageContent = '';

    // Always build the prompt by replacing placeholders
    finalSystemPrompt = finalSystemPrompt
      .replace('{{CONTEXT}}', contextStr)
      .replace('{{QUESTION}}', message);
    userMessageContent = finalSystemPrompt; // Send the plain question as user message

    const content = userMessageContent;
    console.log('received content', content);
    // Store the fully built system prompt including replaced context and question

    // Create a new user message
    const userMessage: Message = {
      role: 'user',
      content: content,
      context: context,
      usrMessage: message, // Preserve original user message
      isDoneStreaming: true, // Mark user messages as done streaming immediately
      devPrompt: userMessageContent, // Store the actual prompt that was used
      wasAnonymized: isAnonymized, // Store anonymization state at generation time
    };

    // Add user message to the conversation - create a new array
    let tempMessages = [...messages, userMessage];
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setIsLoading(true);

    try {
      // Prepare messages for API - create a new array
      const messagesForAPI = [...messages, userMessage];

      // Normalize options to handle array values (use applied defaults)
      const normalizedOptions = {
        ...appliedOptions,
        temperature: Array.isArray(appliedOptions.temperature)
          ? appliedOptions.temperature[0]
          : appliedOptions.temperature,
        max_new_tokens: Array.isArray(appliedOptions.max_new_tokens)
          ? appliedOptions.max_new_tokens[0]
          : appliedOptions.max_new_tokens,
        top_p: Array.isArray(appliedOptions.top_p)
          ? appliedOptions.top_p[0]
          : appliedOptions.top_p,
        top_k: Array.isArray(appliedOptions.top_k)
          ? appliedOptions.top_k[0]
          : appliedOptions.top_k,
        token_repetition_penalty_max: Array.isArray(
          appliedOptions.token_repetition_penalty_max
        )
          ? appliedOptions.token_repetition_penalty_max[0]
          : appliedOptions.token_repetition_penalty_max,
      };

      // Get formatted messages with system prompt
      // Filter message history based on enableMessageHistory setting
      const messagesToSend = llmSettings.enableMessageHistory
        ? tempMessages // Send all messages (history enabled)
        : [tempMessages[tempMessages.length - 1]]; // Only send the last (current) message

      const apiMessages = [
        { role: 'system', content: finalSystemPrompt },
        ...messagesToSend.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ];
      console.log(
        'messages that will be sent, formatted and stripped',
        apiMessages
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
          customSettings: llmSettings.useCustomSettings
            ? llmSettings
            : undefined,
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
              devPrompt: userMessageContent, // Store the actual prompt that was used
              context: context,
              wasAnonymized: isAnonymized,
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
          content: t('errorGeneratingResponse'),
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
    dispatch({
      type: 'setConversationRated',
      payload: { rated: false },
    });
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
