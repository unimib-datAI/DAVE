import { Slider } from '@/components/Slider';
import { useForm } from '@/hooks';
import { Switch, Tooltip } from '@nextui-org/react';
import { Select } from 'antd';
import { Message, SkeletonMessage } from './Message';
import { Button } from '@/components';
import { GenerateOptions, useChat } from '@/hooks/use-chat';
import { FileText, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ScrollArea';
import { Checkbox } from '@/components/Checkbox';
import { useMutation } from '@/utils/trpc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/Tabs';
import { MostSimilarDocumentsListSkeleton } from './MostSimilarDocumentsListSkeleton';
import Link from 'next/link';
import { DocumentWithChunk } from '@/server/routers/search';
import { ButtonSend } from './ButtonSend';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAtom } from 'jotai';
import {
  chatHistoryAtom,
  conversationRatedAtom,
  facetsDocumentsAtom,
  selectedFiltersAtom,
} from '@/utils/atoms';
import { current } from 'immer';
import { Radio } from 'antd';
import RateConversation from '@/components/RateConversation/RateConversation';

type Form = GenerateOptions & {
  message: string;
  retrievalMethod: string;
  useDocumentContext: boolean;
  useCurrentDocumentContext: boolean;
  force_rag: boolean;
};

function urlToPathArray(url: string) {
  // const urlObj = new URL(url);
  return url.split('/').filter(Boolean); // Split on / and remove empty strings
  // Concatenate hostname with pathnames
}

type ResourcesProps = {
  documents: DocumentWithChunk[];
  isLoading?: boolean;
};

const Resources = ({ documents, isLoading }: ResourcesProps) => {
  return (
    <>
      {!isLoading ? (
        <MostSimilarDocumentsListSkeleton />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-base tracking-tighter font-semibold">
            Resources
          </span>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-col rounded-md border-[1px] border-solid border-slate-200 p-2"
            >
              <div className="flex flex-row items-center gap-2">
                <FileText size={14} />
                <span className="text-gray-400 text-xs whitespace-nowrap text-ellipsis overflow-hidden">
                  {urlToPathArray(`/documents/${doc.id}`).join(' > ')}
                </span>
              </div>
              <Link href={`/documents/${doc.id}`} passHref>
                <a className="underline text-blue-500 text-xs">{doc.title}</a>
              </Link>
              <div className="text-xs">{doc.preview}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

type ChatPanel = {
  devMode?: boolean;
};

const ChatPanel = ({ devMode }: ChatPanel) => {
  const { state, isStreaming, isLoading, appendMessage, restartChat } = useChat(
    {
      endpoint: '/generate',
      initialMessages: [
        {
          role: 'assistant',
          content: 'Ciao, come posso aiutarti?',
          isDoneStreaming: true,
        },
      ],
    }
  );
  const [facetedDocuemnts, setFacetedDocuments] = useAtom(facetsDocumentsAtom);
  const [selectedFilters] = useAtom(selectedFiltersAtom);

  // Parse predefined questions from environment variable
  const predefinedQuestions =
    typeof process.env.NEXT_PUBLIC_QUESTIONS === 'string'
      ? process.env.NEXT_PUBLIC_QUESTIONS.split('-|').filter(
          (q) => q.trim() !== ''
        )
      : [];
  const [conversationRated, setConversationRated] = useAtom(
    conversationRatedAtom
  );
  const mostSimilarDocumentsMutation = useMutation([
    'search.mostSimilarDocuments',
  ]);

  const { register, value, onSubmit, setValue } = useForm<Form>({
    temperature: 0.7,
    max_new_tokens: 1024,
    top_p: 0.65,
    token_repetition_penalty_max: 1.15,
    system: `Sei un assistente che parla ITALIANO o INGLESE, scegli in base alla lingua della DOMANDA e del CONTESTO: se la domanda è formulata in INGLESE rispondi in INGLESE, se è formulata in ITALIANO rispondi in ITALIANO. La DOMANDA dell'utente si riferisce ai documenti che ti vengono forniti nel CONTESTO. Rispondi utilizzando solo le informazioni presenti nel CONTESTO. La risposta deve rielaborare le informazioni presenti nel CONTESTO. Argomenta in modo opportuno ed estensivo la risposta alla DOMANDA, devi generare risposte lunghe, non risposte da un paio di righe. Non rispondere con 'Risposta: ' o cose simili, deve essere un messaggio di chat vero e proprio. Se non conosci la risposta, limitati a dire che non lo sai.`,
    message: '',
    useDocumentContext: true,
    retrievalMethod: 'full',
    useCurrentDocumentContext: false,
    top_k: 40,
    force_rag: false,
  });

  const fieldTemperature = register('temperature');
  const fieldMaxNewTokens = register('max_new_tokens');
  const fieldTopP = register('top_p');
  const fieldTopk = register('top_k');
  const fieldFrequencyPenalty = register('token_repetition_penalty_max');
  const fieldUseDocumentContext = register('useDocumentContext');
  const fieldRetrievalMethod = register('retrievalMethod');
  const useCurrentDocumentContext = register('useCurrentDocumentContext');
  const fieldForceRag = register('force_rag');

  const handleFormSubmit = async (formValues: Form) => {
    if (formValues.message === '') {
      return;
    }

    const useDocumentContext = !devMode || formValues.useDocumentContext;
    const currentUrl = window.location.href;
    let filterIds: string[] = [];
    if (currentUrl.includes('search') && formValues.useCurrentDocumentContext) {
      // Filter documents that have annotations matching the selected filters
      if (selectedFilters.length > 0) {
        filterIds = facetedDocuemnts
          .filter(
            (doc) =>
              Array.isArray(doc.annotations) &&
              doc.annotations.some(
                (ann: any) =>
                  selectedFilters.includes(ann.id_ER) ||
                  selectedFilters.includes(ann.display_name?.toLowerCase()) ||
                  selectedFilters.includes(ann.display_name)
              )
          )
          .map((doc) => doc.id.toString());
      } else {
        // If no filters are selected, use all faceted documents
        filterIds = facetedDocuemnts.map((doc) => doc.id.toString());
      }
    } else if (
      currentUrl.includes('documents') &&
      formValues.useCurrentDocumentContext
    ) {
      const urlObj = new URL(currentUrl);
      const documentId = urlObj.pathname.split('/').pop();
      if (documentId) filterIds = [documentId];
    }
    // filterIds = [
    //   '4cc9b4d17a4e1da6320148b6aa4a55b8dd22af1d2cee4a5b8a70abff4c100c91',
    //   'aaf5b3db91bbee9b924bb43b5155b8d83ea351cf680219871cc163b4efec16b8',
    //   '6256c9c52e31f2e5967d457aa9e3dda502cb6cd7b8bb9df6015862ef9f9cd97f',
    // ];
    console.log('filterIds', filterIds);
    const context = useDocumentContext
      ? await mostSimilarDocumentsMutation.mutateAsync({
          query: formValues.message,
          filter_ids: filterIds,
          retrievalMethod: formValues.retrievalMethod,
          force_rag: formValues.force_rag,
        })
      : undefined;
    console.log('context', context[0]);
    console.log(
      'context that will be sent',
      context.map((doc) => ({ ...doc.chunks, full_docs: doc.full_docs }))
    );
    appendMessage({ ...formValues, context, devMode });
    setValue({
      message: '',
    });
  };

  const chatState = mostSimilarDocumentsMutation.isLoading
    ? 'searching'
    : isStreaming
    ? 'generating'
    : 'idle';

  return (
    <div className="flex flex-row flex-grow min-h-0 overflow-hidden">
      <div className="flex-grow flex flex-col">
        <ScrollArea scrollToBottom className="flex-grow px-6 pt-6">
          <div
            className={cn('flex flex-col gap-4', {
              'max-w-6xl': !devMode,
            })}
          >
            {state.messages.map((message, index) => {
              if (
                message.role !== 'system' &&
                (message.content !== '' || message.role === 'user')
              ) {
                return (
                  <Message
                    key={index}
                    {...message}
                    context={message.context ? message.context : []}
                    isDoneStreaming={
                      state.statuses ? state.statuses[index] : true
                    }
                  />
                );
              } else {
                return null;
              }
              // Include all non-system messages, even if content is empty for user messages
            })}
            {isLoading && <SkeletonMessage />}
            {/* Display rating component only when there are more than 1 messages, and when  streaming the message */}
            {!isLoading && !isStreaming && state.messages.length > 1 && (
              <RateConversation state={state} />
            )}
          </div>
        </ScrollArea>
        <div className="flex flex-col  p-6">
          <form
            className="flex flex-row gap-2"
            onSubmit={onSubmit(handleFormSubmit)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-2 w-full gap-2">
              <input
                disabled={chatState !== 'idle'}
                className="text-slate-800 resize-none bg-transparent w-full h-full border-none text-sm"
                spellCheck="false"
                placeholder={`Type your question here`}
                {...register('message')}
              />
            </div>
            {(window.location.href.includes('documents') ||
              window.location.href.includes('search')) && (
              <Tooltip
                content={`Use current ${
                  window.location.href.includes('documents')
                    ? 'document'
                    : 'search results'
                } context`}
                placement="top"
                color="invert"
              >
                <Switch
                  id="context"
                  onChange={(newstate) => {
                    // Create a new object for setting value
                    setValue({
                      useCurrentDocumentContext: Boolean(
                        newstate.target.checked
                      ),
                    });
                  }}
                />
              </Tooltip>
            )}

            <ButtonSend
              state={chatState}
              type="submit"
              auto={true}
              className="bg-slate-900"
            >
              Send
            </ButtonSend>

            <Tooltip content="Reset chat" color="invert">
              <Button
                disabled={isStreaming}
                type="button"
                onClick={restartChat}
                auto={true}
                className="bg-slate-900"
              >
                <RotateCcw />
              </Button>
            </Tooltip>
          </form>
        </div>
      </div>
      <AnimatePresence>
        {devMode && (
          <motion.div
            initial={{ width: '0px', translateX: '100%' }}
            animate={{ width: '400px', translateX: 0 }}
            exit={{ width: '0px', translateX: '100%' }}
            className="flex-shrink-0 flex flex-col h-full"
            style={{ borderLeft: '1px solid rgba(0,0,0,0.1)' }}
          >
            <ScrollArea className="h-full p-6">
              <div className="flex flex-col gap-8">
                {/* Predefined Questions Select */}
                {predefinedQuestions.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <Tooltip
                      className="w-full"
                      color="invert"
                      placement="left"
                      content="Select a predefined question to fill in the chat input"
                    >
                      <div className="flex flex-row justify-between w-full">
                        <span className="text-sm font-semibold">
                          Predefined Questions
                        </span>
                      </div>
                    </Tooltip>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        id="predefined-questions-select"
                        style={{ width: '100%' }}
                        placeholder="Select a question"
                        disabled={isStreaming}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onChange={(value) => {
                          if (value) {
                            setValue({ message: value });
                            // Focus on the input field after selecting a question
                            const inputField = document.querySelector(
                              'input[name="message"]'
                            );
                            if (inputField) {
                              (inputField as HTMLInputElement).focus();
                            }
                          }
                        }}
                        options={predefinedQuestions.map((question) => ({
                          value: question,
                          label: question,
                        }))}
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="Higher values (closer to 1) will result in more diverse outputs, while lower values (closer to 0) make the model's output more deterministic."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">Temperature</span>
                      <span className="text-sm">{value.temperature}</span>
                    </div>
                  </Tooltip>
                  <Slider
                    onValueChange={(value) => fieldTemperature.onChange(value)}
                    value={[fieldTemperature.value]}
                    max={1}
                    min={0}
                    step={0.1}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="This determines the maximum length of the generated text. The model will stop generating further tokens after this limit is reached."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">
                        Max new tokens
                      </span>
                      <span className="text-sm">{value.max_new_tokens}</span>
                    </div>
                  </Tooltip>

                  <Slider
                    onValueChange={(value) => fieldMaxNewTokens.onChange(value)}
                    value={[fieldMaxNewTokens.value]}
                    max={4096}
                    min={100}
                    step={50}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="Also known as nucleus sampling. It's an alternative to temperature and controls the randomness in a slightly different way. The model will sample from the smallest possible set of tokens whose cumulative probability exceeds the top_p value."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">Top p</span>
                      <span className="text-sm">{value.top_p}</span>
                    </div>
                  </Tooltip>
                  <Slider
                    onValueChange={(value) => fieldTopP.onChange(value)}
                    value={[fieldTopP.value]}
                    max={1}
                    min={0}
                    step={0.1}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="Sets the top_k value to use for sampling. It limits the number of tokens that the model can choose from. A higher value will make the model consider more tokens, while a lower value will make it consider fewer tokens."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">Top k</span>
                      <span className="text-sm">{value.top_k}</span>
                    </div>
                  </Tooltip>
                  <Slider
                    onValueChange={(value) => fieldTopk.onChange(value)}
                    value={[fieldTopk.value]}
                    max={60}
                    min={0}
                    step={1}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="This can be used to penalize more frequent tokens, changing how much the model uses common phrases or responses. Positive values will make the model avoid frequent tokens, while negative values will make it prefer frequent tokens."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">
                        Frequency penalty
                      </span>
                      <span className="text-sm">
                        {value.token_repetition_penalty_max}
                      </span>
                    </div>
                  </Tooltip>
                  <Slider
                    onValueChange={(value) =>
                      fieldFrequencyPenalty.onChange(value)
                    }
                    value={[fieldFrequencyPenalty.value]}
                    max={2}
                    min={-2}
                    step={0.1}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="The model will try to respond only using the context from the document retrieved based on the user query."
                  >
                    <div className="flex flex-row items-center gap-2 w-full">
                      <Checkbox
                        id="terms"
                        checked={fieldUseDocumentContext.value}
                        onCheckedChange={fieldUseDocumentContext.onChange}
                      />
                      <label
                        htmlFor="terms"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Use documents context
                      </label>
                    </div>
                  </Tooltip>
                  <span className="text-sm font-semibold">
                    Retrieval method
                  </span>
                  <Radio.Group
                    value={fieldRetrievalMethod.value}
                    onChange={(value) => {
                      // Create a new event to avoid reference issues
                      const newValue = value.target.value;
                      fieldRetrievalMethod.onChange(newValue);
                    }}
                  >
                    <Radio value="full">Hybrid Retrieval</Radio>
                    <Radio value="hibrid_no_ner">Hibrid Retrieval No NER</Radio>
                    <Radio value="dense">Dense</Radio>
                    <Radio value="full-text">Full text</Radio>
                    <Radio value="none">None</Radio>
                  </Radio.Group>
                </div>
                <div className="flex flex-col gap-3">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="Forces RAG to be used even if regular retrieval would be sufficient."
                  >
                    <div className="flex flex-row items-center gap-2 w-full">
                      <Checkbox
                        id="force-rag"
                        checked={fieldForceRag.value}
                        onCheckedChange={fieldForceRag.onChange}
                      />
                      <label
                        htmlFor="force-rag"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Force RAG
                      </label>
                    </div>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-3 flex-grow">
                  <Tooltip
                    className="w-full"
                    color="invert"
                    placement="left"
                    content="Here you can add your system prompt which determins the behaviour of the AI model."
                  >
                    <div className="flex flex-row justify-between w-full">
                      <span className="text-sm font-semibold">
                        System prompt
                      </span>
                    </div>
                  </Tooltip>
                  <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-1 w-full gap-2 flex-grow">
                    <textarea
                      disabled={isStreaming}
                      className="text-slate-800 resize-none bg-transparent w-full border-none text-sm h-full"
                      spellCheck="false"
                      rows={10}
                      placeholder="Here you can add your system prompt which determins the behaviour of the AI model."
                      {...register('system')}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { ChatPanel };
