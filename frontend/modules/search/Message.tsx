import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';
import { DocumentWithChunk } from '@/server/routers/search';
import { Tooltip } from '@heroui/react';
import { AnimatePresence, Variants, motion } from 'framer-motion';
import { Sparkles, User, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useText } from '@/components/TranslationProvider';
import { useAtom } from 'jotai';
import { globalAnonymizationAtom } from '@/utils/atoms';
import { useMemo, useState } from 'react';
import { splitSentences } from '@/utils/stringUtilities';

type MessageProps = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  isDoneStreaming?: boolean;
  context?: DocumentWithChunk[];
  usrMessage?: string; // For backward compatibility
  wasAnonymized?: boolean; // Anonymization state at generation time
  devPrompt?: string; // Full prompt with context for dev mode
  citations?: { [sentenceIndex: number]: string[] };
  chunkMap?: { [chunkId: string]: string };
  chunkIndexMap?: { [chunkId: string]: number };
};

// Render markdown content annotated with inline citation badges.
// Split on paragraph boundaries (\\n\\n) so markdown formatting like **bold**
// Each sentence gets its citation badge rendered immediately after it.
function AnnotatedMarkdown({
  content,
  citations,
  chunkMap,
  chunkIndexMap,
}: {
  content: string;
  citations: { [sentenceIndex: number]: string[] };
  chunkMap: { [chunkId: string]: string };
  chunkIndexMap: { [chunkId: string]: number };
}) {
  // Must match the split used in use-chat.ts exactly so sentence indices align
  const sentences = splitSentences(content);

  return (
    <>
      {sentences.map((sentence, i) => {
        const globalIdx = i + 1;
        const chunkIds = citations[globalIdx] ?? [];
        const badges = chunkIds.map((chunkId) => {
          const n = chunkIndexMap[chunkId] ?? '?';
          const chunkText = chunkMap[chunkId] || '';
          return (
            <Tooltip
              key={chunkId}
              content={
                <div className="max-w-xs text-xs p-2 whitespace-pre-wrap">
                  {chunkText}
                </div>
              }
            >
              <sup
                className="cursor-help text-blue-600 font-semibold ml-0.5 select-none inline align-bottom"
                style={{ verticalAlign: 'sub', fontSize: '0.7em' }}
              >
                [{n}]
              </sup>
            </Tooltip>
          );
        });

        return (
          <div key={i}>
            <Markdown remarkPlugins={[remarkGfm]}>{sentence}</Markdown>
            {badges.length > 0 && <span className="ml-0.5">{badges}</span>}
          </div>
        );
      })}
    </>
  );
}

function urlToPathArray(url: string) {
  return url.split('/').filter(Boolean); // Split on / and remove empty strings
}

/**
 * Renders markdown that contains inline [n] citation markers produced by the
 * multi-agent CitationAgent.
 *
 * Strategy: replace every standalone [n] (not already part of a markdown link)
 * with a markdown link [n](#cite-n). react-markdown renders that as an <a> tag;
 * our custom `a` component intercepts hrefs starting with "#cite-" and renders
 * a tooltip badge showing the chunk text instead.
 */
function CitedMarkdown({
  content,
  chunkMap,
  chunkIndexMap,
}: {
  content: string;
  chunkMap: { [chunkId: string]: string };
  chunkIndexMap: { [chunkId: string]: number };
}) {
  // Build reverse map: display number → chunk ID
  const indexToChunkId = useMemo(() => {
    const map: Record<number, string> = {};
    for (const [id, n] of Object.entries(chunkIndexMap)) {
      map[n] = id;
    }
    return map;
  }, [chunkIndexMap]);

  // Convert standalone [n] → [n](#cite-n) so react-markdown treats them as links.
  // The negative-lookahead (?!\() ensures we don’t touch real markdown links like [text](url).
  const processedContent = useMemo(
    () => content.replace(/\[(\d+)\](?!\()/g, (_, n) => `[${n}](#cite-${n})`),
    [content]
  );

  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Intercept #cite-n links and render as tooltip badge superscripts.
        // All other links render normally.
        a({
          href,
          children,
          ...props
        }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
          children?: React.ReactNode;
        }) {
          if (href?.startsWith('#cite-')) {
            const n = parseInt(href.replace('#cite-', ''), 10);
            const chunkId = indexToChunkId[n];
            const chunkText = chunkId ? chunkMap[chunkId] ?? '' : '';
            return (
              <Tooltip
                content={
                  <div className="max-w-xs text-xs p-2 whitespace-pre-wrap leading-relaxed">
                    <span className="font-semibold text-blue-600 mr-1">
                      [{n}]
                    </span>
                    {chunkText || `Chunk ${n}`}
                  </div>
                }
              >
                <sup
                  className="cursor-help text-blue-600 font-semibold ml-0.5 select-none"
                  style={{ fontSize: '0.75em' }}
                >
                  [{n}]
                </sup>
              </Tooltip>
            );
          }
          return (
            <a href={href} {...props}>
              {children}
            </a>
          );
        },
      }}
    >
      {processedContent}
    </Markdown>
  );
}

const SkeletonMessage = () => {
  return (
    <div className="flex flex-row gap-2">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex flex-col gap-2 flex-grow">
        <Skeleton className="w-5/6 h-2" />
        <Skeleton className="w-2/6 h-2" />
        <Skeleton className="w-4/6 h-2" />
        <Skeleton className="w-3/6 h-2" />
      </div>
    </div>
  );
};

const variants: Variants = {
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
    },
  }),
  hidden: { opacity: 0, y: -50 },
};

const Message = ({
  role,
  content,
  context,
  isDoneStreaming,
  usrMessage,
  wasAnonymized,
  devPrompt,
  citations,
  chunkMap,
  chunkIndexMap,
}: MessageProps) => {
  const [isAnonymized, setIsAnonimized] = useAtom(globalAnonymizationAtom);
  const t = useText('chat');
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  // Use the anonymization state from when the message was generated, fallback to current state
  const effectiveAnonymization =
    wasAnonymized !== undefined ? wasAnonymized : isAnonymized;
  // Only return early for assistant messages with empty content
  // For user messages, we want to display them even with empty content
  if (role === 'assistant' && (!content || content.trim() === '')) return null;

  // For user messages, prioritize usrMessage if available
  // For other roles, use the regular content
  // Ensure we handle empty strings properly for user messages
  const displayContent = content;
  // Determine if we should show context for this message
  const showContext =
    role === 'user' && context && Array.isArray(context) && context.length > 0;

  return (
    <div className="w-full">
      {/* Message with avatar */}
      <motion.div
        animate={{ translateY: 0 }}
        initial={{ translateY: 20 }}
        data-testid={
          role === 'user' ? 'chat-message-user' : 'chat-message-assistant'
        }
        className={cn('flex gap-2', {
          'justify-end': role === 'user', // Right-align user messages
        })}
      >
        {/* Avatar */}
        <div
          className={cn(
            'rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0',
            {
              'bg-slate-100': role === 'assistant',
              'bg-orange-100': role === 'user',
              'order-2': role === 'user', // Put avatar on the right for user messages
            }
          )}
        >
          {role === 'assistant' ? <Sparkles size={18} /> : <User size={18} />}
        </div>

        {/* Message content */}
        <div
          className={cn(
            'flex flex-col max-w-[70%]', // Limit width for better readability
            {
              'bg-slate-50 p-3 rounded-xl': role === 'assistant',
              'bg-orange-50 p-3 rounded-xl': role === 'user',
              'order-1': role === 'user', // Put content on the left for user messages
            }
          )}
        >
          <div className="text-sm font-semibold mb-1">
            {role === 'assistant' ? t('dave') : t('you')}
          </div>

          <div className="text-black">
            {role === 'user' ? (
              <div className="whitespace-pre-wrap">
                {displayContent || '...'}
              </div>
            ) : chunkMap &&
              chunkIndexMap &&
              Object.keys(chunkMap).length > 0 &&
              /\[\d+\]/.test(displayContent) ? (
              // Multi-agent: answer contains inline [n] markers — render with
              // CitedMarkdown so each [n] becomes a hoverable tooltip badge.
              <CitedMarkdown
                content={displayContent}
                chunkMap={chunkMap}
                chunkIndexMap={chunkIndexMap}
              />
            ) : citations && isDoneStreaming && chunkMap && chunkIndexMap ? (
              <AnnotatedMarkdown
                content={displayContent}
                citations={citations}
                chunkMap={chunkMap}
                chunkIndexMap={chunkIndexMap}
              />
            ) : (
              <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
            )}
          </div>

          {/* Expandable prompt section for assistant messages */}
          {role === 'assistant' && devPrompt && (
            <div className="mt-3">
              <button
                onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 transition-colors border-none bg-transparent p-0 cursor-pointer"
              >
                {isPromptExpanded ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
                {isPromptExpanded
                  ? t('hidePrompt') || 'Hide Full Prompt'
                  : t('showPrompt') || 'Show Full Prompt'}
              </button>
              <AnimatePresence>
                {isPromptExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-3 bg-slate-100 rounded text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                      {devPrompt}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>

      {/* Context display (for user messages) */}
      {showContext && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.3 }}
          className="mt-2 ml-10 mr-10 mb-4"
        >
          <div className="w-full h-[1px] bg-orange-200 my-3" />
          <div className="text-xs font-semibold mb-2 text-slate-600">
            {t('contextSources')}
          </div>
          <div className="flex flex-col gap-2">
            {Array.isArray(context) &&
              context.map((doc, i) => (
                <motion.div
                  key={`${doc.id}-${i}`}
                  className="flex flex-col p-2 gap-2 bg-white rounded-lg border border-orange-100"
                  variants={variants}
                  custom={i}
                  initial="hidden"
                  animate="visible"
                >
                  <div className="flex flex-row items-center gap-2">
                    <Link2 size={14} />
                    <span className="text-neutral-900/80 tracking-wide text-sm whitespace-nowrap text-ellipsis overflow-hidden">
                      {doc.id
                        ? urlToPathArray(`/documents/${doc.id}`).join(' > ')
                        : ''}
                    </span>
                  </div>

                  <Link href={`/documents/${doc.id || ''}`}>
                    <span className="text-blue-700 text-base tracking-wide font-medium">
                      {doc.title || t('document')}
                    </span>
                  </Link>

                  <div className="text-xs tracking-wide text-slate-700">
                    {doc.preview || ''}
                  </div>

                  {doc.chunks &&
                    Array.isArray(doc.chunks) &&
                    doc.chunks.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        <span className="text-xs leading-tight font-semibold">
                          {t('relevantPassages')}
                        </span>
                        <div className="flex flex-row items-center flex-wrap gap-2 z-[9994]">
                          {!doc.full_docs ? (
                            doc.chunks.map((chunk, chunkIndex) => (
                              <div
                                key={`${chunk.id || ''}-${chunkIndex}`}
                                style={{ zIndex: 10000, position: 'relative' }}
                              >
                                <Tooltip
                                  content={(() => {
                                    const text = effectiveAnonymization
                                      ? chunk.text_anonymized ||
                                        chunk.text ||
                                        ''
                                      : chunk.text || '';
                                    return text || 'No content available';
                                  })()}
                                >
                                  <div className="whitespace-nowrap max-w-[200px] text-ellipsis overflow-hidden text-xs bg-slate-100 rounded-md px-2 py-1 cursor-help">
                                    {(() => {
                                      const previewText = effectiveAnonymization
                                        ? chunk.text_anonymized ||
                                          chunk.text ||
                                          ''
                                        : chunk.text || '';
                                      return previewText
                                        ? previewText.slice(0, 50)
                                        : '';
                                    })()}
                                    {(() => {
                                      const previewText = effectiveAnonymization
                                        ? chunk.text_anonymized ||
                                          chunk.text ||
                                          ''
                                        : chunk.text || '';
                                      return previewText &&
                                        previewText.length > 50
                                        ? '...'
                                        : '';
                                    })()}
                                  </div>
                                </Tooltip>
                              </div>
                            ))
                          ) : (
                            <div
                              style={{ zIndex: 10000, position: 'relative' }}
                            >
                              <Tooltip content={t('fullDocument')}>
                                <div className="whitespace-nowrap max-w-[200px] text-ellipsis overflow-hidden text-xs bg-slate-100 rounded-md px-2 py-1 cursor-help">
                                  {t('fullDocument')}
                                </div>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </motion.div>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export { Message, SkeletonMessage };
