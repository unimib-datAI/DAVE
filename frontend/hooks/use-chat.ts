import { activeCollectionAtom } from '@/atoms/collection';
import { DocumentWithChunk } from '@/server/routers/search';
import { getPromptAndMessage } from '@/utils/textGeneration';
import { llmSettingsAtom, DEFAULT_SYSTEM_PROMPT } from '@/atoms/llmSettings';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';
import { useChatState, useChatDispatch } from '@/modules/chat/ChatProvider';
import { useText } from '@/components/TranslationProvider';
import { globalAnonymizationAtom } from '@/utils/atoms';
import { splitSentences, findMatchingChunks } from '@/utils/stringUtilities';

export type AgentStep = {
  agent: string;
  step: string;
  status: 'running' | 'done';
  durationMs?: number;
};

export type Message = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  usrMessage?: string; // Original user message without system prompt
  context?: DocumentWithChunk[];
  isDoneStreaming?: boolean;
  devPrompt?: string; // Full prompt with context, question and instructions (for dev mode)
  wasAnonymized?: boolean; // Tracks if anonymization was enabled when this message was generated
  citations?: { [sentenceIndex: number]: string[] }; // sentence index (1-based) → cited chunk IDs
  chunkMap?: { [chunkId: string]: string }; // chunk ID → chunk text for popover display
  chunkIndexMap?: { [chunkId: string]: number }; // chunk ID → 1-based index in the flat chunk list
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
  /** Document IDs to restrict retrieval to (used by the multi-agent pipeline) */
  filterIds?: string[];
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
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);

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
    // Build processedChunks early so we can number them in the context string.
    const processedChunks: { chunk_id: string; text: string }[] = [];
    const chunkMap: { [chunkId: string]: string } = {};
    const chunkIndexMap: { [chunkId: string]: number } = {};
    const indexChunkMap: { [chunkNumber: number]: string } = {};
    if (context) {
      let chunkNum = 0;
      context.forEach((item, index) => {
        console.log('context item', item);
        const chunkLines = item.chunks.map((chunk) => {
          chunkNum++;
          const text = isAnonymized
            ? chunk.text_anonymized || chunk.text
            : chunk.text;
          processedChunks.push({ chunk_id: chunk.id, text });
          // Build the maps here using the exact chunkNum the LLM will see.
          chunkMap[chunk.id] = text;
          chunkIndexMap[chunk.id] = chunkNum;
          indexChunkMap[chunkNum] = chunk.id;
          return `[${chunkNum}] ${text}`;
        });
        const docContent = `Nome Documento ${
          item.title
        } - Contenuto:\n${chunkLines.join('\n')}`;
        contextStr += `<document id="DOC_${index + 1}" name="${
          item.title
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

    // When multi-agent is active the pipeline handles retrieval and context
    // internally, so we use a minimal system prompt instead of embedding context.
    let finalSystemPrompt: string;
    if (options.useMultiAgent) {
      finalSystemPrompt = 'You are a helpful AI assistant.';
    } else {
      finalSystemPrompt =
        devMode && options.system !== undefined
          ? options.system
          : defaultSystemPrompt;
      // Replace placeholders with actual context / question
      finalSystemPrompt = finalSystemPrompt
        .replace('{{CONTEXT}}', contextStr)
        .replace('{{QUESTION}}', message);
    }
    let userMessageContent = '';
    // Append citation instruction so the LLM cites passage numbers inline.
    // if (processedChunks.length > 0) {
    //   finalSystemPrompt +=
    //     '\n\nIMPORTANTE: Cita ogni affermazione inserendo il numero del passaggio tra parentesi quadre (es: [1], [2]) subito dopo la frase che lo usa, prima del punto. Usa solo i numeri dei passaggi forniti nel contesto.';
    // }

    const content = userMessageContent;
    console.log('received content', content);
    // Store the fully built system prompt including replaced context and question

    // Create a new user message
    const userMessage: Message = {
      role: 'user',
      content: message,
      context: context,
      usrMessage: finalSystemPrompt, // Preserve original user message
      isDoneStreaming: true, // Mark user messages as done streaming immediately
      devPrompt: finalSystemPrompt, // Store the actual prompt that was used
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
      const messagesToSend = (
        llmSettings.enableMessageHistory
          ? tempMessages // Send all messages (history enabled)
          : [tempMessages[tempMessages.length - 1]]
      ).filter((message) => message.role !== 'system'); // Only send the last (current) message

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
          // Pass filter IDs so the multi-agent pipeline can scope retrieval
          filterIds: options.filterIds,
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
      // rawAccumulator holds every byte received, including all sentinel data.
      // We strip sentinels progressively so the user only ever sees clean text.
      let rawAccumulator = '';
      let assistantContent = ''; // clean text (no sentinels) – set after loop
      let isFirstChunk = true;

      // Reset agent steps for this new query
      setAgentSteps([]);

      // Not loading anymore since we're streaming
      setIsLoading(false);

      // Regex constants for the two sentinel types
      const STEP_RE = /\x02DAVE_STEP\x1E([\s\S]*?)\x03/g;
      const CTX_PARTIAL_RE = /\x02DAVE_CTX\x1E[\s\S]*$/; // partial CTX at tail
      const CTX_FULL_RE = /\x02DAVE_CTX\x1E[\s\S]*?\x03/g;

      // Start reading the stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        rawAccumulator += decoder.decode(value, { stream: true });

        // ── Extract complete STEP sentinels and update progress state ────────
        const pendingSteps: {
          agent: string;
          step: string;
          status: string;
          durationMs?: number;
        }[] = [];
        rawAccumulator = rawAccumulator.replace(STEP_RE, (_, json) => {
          try {
            pendingSteps.push(JSON.parse(json));
          } catch {
            /* ignore */
          }
          return '';
        });
        if (pendingSteps.length > 0) {
          setAgentSteps((prev) => {
            const updated = [...prev];
            for (const s of pendingSteps) {
              if (s.status === 'done') {
                // Mark the last matching 'running' entry as done
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (
                    updated[i].agent === s.agent &&
                    updated[i].status === 'running'
                  ) {
                    updated[i] = {
                      agent: s.agent,
                      step: s.step,
                      status: 'done',
                      durationMs: s.durationMs,
                    };
                    break;
                  }
                }
              } else {
                updated.push({
                  agent: s.agent,
                  step: s.step,
                  status: 'running',
                });
              }
            }
            return updated;
          });
        }

        // ── Compute visible content (strip CTX sentinel from tail) ──────────
        const visibleContent = rawAccumulator
          .replace(CTX_FULL_RE, '')
          .replace(CTX_PARTIAL_RE, '');

        // Only start showing the assistant message once actual text is present
        if (isFirstChunk && visibleContent.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: visibleContent,
              isDoneStreaming: false,
              devPrompt: finalSystemPrompt,
              context: context,
              wasAnonymized: isAnonymized,
            },
          ]);
          isFirstChunk = false;
        } else if (!isFirstChunk) {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content: visibleContent,
                isDoneStreaming: false,
              };
            }
            return newMessages;
          });
        }
      }

      // ── Extract multi-agent retrieved context from sentinel ────────────────────
      // rawAccumulator still contains the CTX sentinel (STEP sentinels were
      // stripped during the loop). Parse and remove it, then set assistantContent.
      assistantContent = rawAccumulator;
      let multiAgentDocs: typeof context | undefined;
      let multiAgentChunkMap: { [id: string]: string } | undefined;
      let multiAgentChunkIndexMap: { [id: string]: number } | undefined;
      const CTX_RE = /\x02DAVE_CTX\x1E([\s\S]*?)\x03/;
      const ctxMatch = assistantContent.match(CTX_RE);
      if (ctxMatch) {
        try {
          const payload = JSON.parse(ctxMatch[1]);
          // Support both the old (array) and new (object) sentinel formats
          if (Array.isArray(payload)) {
            multiAgentDocs = payload;
          } else {
            multiAgentDocs = payload.docs;
            multiAgentChunkMap = payload.chunkMap;
            multiAgentChunkIndexMap = payload.chunkIndexMap;
          }
        } catch (e) {
          console.error(
            '[use-chat] Failed to parse multi-agent context sentinel',
            e
          );
        }
        assistantContent = assistantContent.replace(CTX_RE, '').trimEnd();
      }

      const finalText = assistantContent;

      // In multi-agent mode the pipeline already produced clean, well-formatted
      // Markdown. Sentence-splitting would destroy lists and bold headers by
      // splitting on periods inside numbering (e.g. "**1. Title**" → "**1." +
      // "Title**") and then re-joining with \n\n. Skip the whole pass and keep
      // the raw text as-is. Citations are also skipped (chunks live server-side).
      let displayText: string;
      let matchingChunks: { [sentenceIndex: number]: string[] } = {};

      if (options.useMultiAgent || processedChunks.length === 0) {
        // Preserve the full Markdown structure untouched.
        displayText = finalText;
      } else {
        // Standard path: strip any LLM-emitted [n] markers, match sentences to
        // source chunks, then inject [n] badges inline so the full markdown
        // structure is preserved (no sentence splitting and re-joining).
        const cleanText = finalText
          .replace(/\s*\[\d+(?:[,\s]+\d+)*\]/g, '')
          .replace(/(\s*,)+\s*(?=[,.]|$)/g, '')
          .trimEnd();

        const sentences = splitSentences(cleanText);

        try {
          matchingChunks =
            (await findMatchingChunks(sentences, processedChunks, 0.6)) || {};
        } catch (err) {
          console.error('Error computing matching chunks:', err);
        }

        // Inject [n] markers at sentence boundaries inside the original text so
        // CitedMarkdown can render them as hoverable tooltip badges without
        // altering any surrounding markdown formatting.
        const insertions: Array<{ pos: number; badge: string }> = [];
        let cursor = 0;
        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          const idx = cleanText.indexOf(sentence, cursor);
          if (idx === -1) continue;
          const endPos = idx + sentence.length;
          cursor = endPos;

          const chunkIds = matchingChunks[i + 1];
          if (!chunkIds || chunkIds.length === 0) continue;

          const nums = chunkIds
            .map((id) => chunkIndexMap[id])
            .filter((n): n is number => n !== undefined)
            .sort((a, b) => a - b);
          if (nums.length > 0) {
            insertions.push({
              pos: endPos,
              badge: nums.map((n) => `[${n}]`).join(''),
            });
          }
        }

        // Apply from end to start so earlier offsets stay valid.
        let annotated = cleanText;
        for (let i = insertions.length - 1; i >= 0; i--) {
          const { pos, badge } = insertions[i];
          annotated = annotated.slice(0, pos) + badge + annotated.slice(pos);
        }
        displayText = annotated;
      }
      // Final update: mark assistant message as done streaming, and attach
      // multi-agent context to the preceding user message so the context panel
      // renders exactly the same as in standard RAG mode.
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;

        // Update assistant message
        if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
          newMessages[lastIndex] = {
            ...newMessages[lastIndex],
            content: displayText,
            isDoneStreaming: true,
            citations: matchingChunks,
            // Prefer multi-agent maps (inline [n] citations) over the
            // standard-RAG maps (sentence-level citation matching).
            chunkMap: multiAgentChunkMap ?? chunkMap,
            chunkIndexMap: multiAgentChunkIndexMap ?? chunkIndexMap,
          };
        }

        // Back-fill context onto the user message so the resource panel appears
        if (multiAgentDocs && multiAgentDocs.length > 0) {
          const userIdx = lastIndex - 1;
          if (userIdx >= 0 && newMessages[userIdx].role === 'user') {
            newMessages[userIdx] = {
              ...newMessages[userIdx],
              context: multiAgentDocs,
            };
          }
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
      // NOTE: agentSteps are intentionally NOT cleared here.
      // We keep the completed pipeline summary visible until the user sends
      // a new message, where setAgentSteps([]) is called at the top of
      // appendMessage to reset for the new query.
    }
  };

  const restartChat = () => {
    // Reset to initial messages (create a new array)
    setMessages([...initialMessages]);
    setAgentSteps([]);
    dispatch({
      type: 'setConversationRated',
      payload: { rated: false },
    });
  };

  return {
    messages,
    appendMessage,
    restartChat,
    state: { messages: messages || [] },
    isStreaming,
    isLoading,
    agentSteps,
  };
}

export { useChat };
