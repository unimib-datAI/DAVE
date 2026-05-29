import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';
import { DocumentWithChunk } from '@/server/routers/search';
import { Tooltip } from '@heroui/react';
import { AnimatePresence, Variants, motion } from 'framer-motion';
import {
  Sparkles,
  User,
  Link2,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
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
  return url.split('/').filter(Boolean);
}

// ── Source card ──────────────────────────────────────────────────────────────
function SourceCard({
  doc,
  i,
  effectiveAnonymization,
}: {
  doc: DocumentWithChunk;
  i: number;
  effectiveAnonymization: boolean;
}) {
  const t = useText('chat');
  const [chunksOpen, setChunksOpen] = useState(false);
  const hasChunks =
    doc.chunks && Array.isArray(doc.chunks) && doc.chunks.length > 0;

  const getChunkText = (chunk: DocumentWithChunk['chunks'][number]) =>
    effectiveAnonymization
      ? chunk.text_anonymized || chunk.text || ''
      : chunk.text || '';

  return (
    <motion.div
      className="flex flex-col gap-1.5 bg-white rounded-xl border border-orange-100 overflow-hidden"
      variants={{
        visible: (idx: number) => ({
          opacity: 1,
          y: 0,
          transition: { delay: idx * 0.06 },
        }),
        hidden: { opacity: 0, y: -12 },
      }}
      custom={i}
      initial="hidden"
      animate="visible"
    >
      {/* Card header */}
      <div className="flex flex-col gap-1 px-3 pt-3 pb-2">
        {/* Breadcrumb path */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <FileText size={11} />
          <span className="truncate">
            {doc.id ? urlToPathArray(`/documents/${doc.id}`).join(' › ') : ''}
          </span>
        </div>

        {/* Title */}
        <Link href={`/documents/${doc.id || ''}`}>
          <span className="text-sm font-semibold text-blue-700 hover:underline leading-snug">
            {doc.title || t('document')}
          </span>
        </Link>

        {/* Preview */}
        {doc.preview && (
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {doc.preview}
          </p>
        )}
      </div>

      {/* Passages toggle */}
      {hasChunks && (
        <div className="border-t border-orange-50">
          <button
            onClick={() => setChunksOpen((o) => !o)}
            className="flex items-center gap-1.5 w-full px-3 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-orange-50/60 transition-colors text-left"
          >
            <motion.span
              animate={{ rotate: chunksOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex"
            >
              <ChevronDown size={12} />
            </motion.span>
            {chunksOpen
              ? 'Hide passages'
              : `${doc.chunks!.length} ${t('relevantPassages')}`}
          </button>

          <AnimatePresence initial={false}>
            {chunksOpen && (
              <motion.div
                key="chunks"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {!doc.full_docs ? (
                    doc.chunks!.map((chunk, ci) => {
                      const text = getChunkText(chunk);
                      return (
                        <div
                          key={`${chunk.id || ''}-${ci}`}
                          className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-2.5 py-2 border border-slate-100"
                        >
                          {text || 'No content available'}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-[11px] text-slate-500 italic">
                      {t('fullDocument')}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ── Sources accordion ─────────────────────────────────────────────────────────
function SourcesAccordion({
  context,
  effectiveAnonymization,
}: {
  context: DocumentWithChunk[];
  effectiveAnonymization: boolean;
}) {
  const t = useText('chat');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full rounded-xl border border-orange-200 bg-orange-50/40 overflow-hidden">
      {/* Accordion trigger */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-orange-100/50 transition-colors"
      >
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="inline-flex text-orange-500"
        >
          <ChevronDown size={15} />
        </motion.span>
        <span className="text-xs font-semibold text-slate-700">
          {t('contextSources')}
        </span>
        <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
          {context.length} {context.length === 1 ? 'source' : 'sources'}
        </span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="sources"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
              {context.map((doc, i) => (
                <SourceCard
                  key={`${doc.id}-${i}`}
                  doc={doc}
                  i={i}
                  effectiveAnonymization={effectiveAnonymization}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
              // Inline [n] citation markers present (multi-agent or standard RAG).
              // Render with CitedMarkdown so each [n] becomes a hoverable tooltip.
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
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-2 ml-10 mr-10 mb-4"
        >
          <SourcesAccordion
            context={context!}
            effectiveAnonymization={effectiveAnonymization}
          />
        </motion.div>
      )}
    </div>
  );
};

export { Message, SkeletonMessage };
