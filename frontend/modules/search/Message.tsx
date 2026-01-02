import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';
import { DocumentWithChunk } from '@/server/routers/search';
import { Tooltip } from "@heroui/react";
import { AnimatePresence, Variants, motion } from 'framer-motion';
import { Sparkles, User, Link2 } from 'lucide-react';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageProps = {
  role: 'system' | 'assistant' | 'user';
  content: string;
  isDoneStreaming?: boolean;
  context?: DocumentWithChunk[];
  usrMessage?: string; // For backward compatibility
};

function urlToPathArray(url: string) {
  return url.split('/').filter(Boolean); // Split on / and remove empty strings
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
}: MessageProps) => {
  // Only return early for assistant messages with empty content
  // For user messages, we want to display them even with empty content
  if (role === 'assistant' && (!content || content.trim() === '')) return null;

  // For user messages, prioritize usrMessage if available
  // For other roles, use the regular content
  // Ensure we handle empty strings properly for user messages
  const displayContent =
    role === 'user' && usrMessage ? usrMessage : content || '';

  // Determine if we should show context for this message
  const showContext =
    role === 'user' && context && Array.isArray(context) && context.length > 0;

  return (
    <div className="w-full">
      {/* Message with avatar */}
      <motion.div
        animate={{ translateY: 0 }}
        initial={{ translateY: 20 }}
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
            {role === 'assistant' ? 'Dave' : 'You'}
          </div>

          <div className="text-black">
            {role === 'user' ? (
              <div className="whitespace-pre-wrap">
                {displayContent || '...'}
              </div>
            ) : (
              <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
            )}
          </div>
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
            Context sources:
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

                  <Link href={`/documents/${doc.id || ''}`} passHref>
                    <a className="text-blue-700 text-base tracking-wide font-medium">
                      {doc.title || 'Document'}
                    </a>
                  </Link>

                  <div className="text-xs tracking-wide text-slate-700">
                    {doc.preview || ''}
                  </div>

                  {doc.chunks &&
                    Array.isArray(doc.chunks) &&
                    doc.chunks.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        <span className="text-xs leading-tight font-semibold">
                          Relevant passages:
                        </span>
                        <div className="flex flex-row items-center flex-wrap gap-2">
                          {!doc.full_docs ? (
                            doc.chunks.map((chunk, chunkIndex) => (
                              <Tooltip
                                content={
                                  <div className="max-w-xs">
                                    {chunk.text_anonymized || chunk.text || ''}
                                  </div>
                                }
                                key={`${chunk.id || ''}-${chunkIndex}`}
                              >
                                <div className="whitespace-nowrap max-w-[200px] text-ellipsis overflow-hidden text-xs bg-slate-100 rounded-md px-2 py-1 cursor-help">
                                  {chunk.text_anonymized || chunk.text
                                    ? (
                                        chunk.text_anonymized || chunk.text
                                      ).slice(0, 50)
                                    : ''}
                                  {(chunk.text_anonymized || chunk.text) &&
                                  (chunk.text_anonymized || chunk.text).length >
                                    50
                                    ? '...'
                                    : ''}
                                </div>
                              </Tooltip>
                            ))
                          ) : (
                            <Tooltip
                              content={
                                <div className="max-w-xs">Full document</div>
                              }
                              key={`${doc.id || ''}`}
                            >
                              <div className="whitespace-nowrap max-w-[200px] text-ellipsis overflow-hidden text-xs bg-slate-100 rounded-md px-2 py-1 cursor-help">
                                Full document
                              </div>
                            </Tooltip>
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
