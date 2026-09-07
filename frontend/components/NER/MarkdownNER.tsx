import styled from '@emotion/styled';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  createContext,
  memo,
  MouseEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { getAllNodeData, mapEntityType } from '@/components/Tree';
import { jsToPythonIndex } from '@/lib/ner/core';
import { EntityAnnotation } from '@/lib/types/document';
import { FlattenedTaxonomy } from '@/modules/document/DocumentProvider/types';
import {
  selectHighlightAnnotationId,
  useSelector,
} from '@/modules/document/DocumentProvider/selectors';
import {
  MarkdownEntity,
  prepareMarkdownEntities,
  remarkEntityAnnotations,
} from '@/lib/ner/markdown/remarkEntityAnnotations';
import {
  MarkdownBlock,
  splitMarkdownBlocks,
} from '@/lib/ner/markdown/splitMarkdownBlocks';
import { FiX } from '@react-icons/all-files/fi/FiX';
import { Tag, TagLabel, DeleteButton } from './EntityTag';
import { SelectionNode } from './TextNode';

type MarkdownNERProps = {
  text: string;
  entityAnnotations: EntityAnnotation[];
  taxonomy: FlattenedTaxonomy;
  highlightAnnotation?: number | null;
  isAddMode?: boolean;
  addSelectionColor?: string;
  deAnonimize?: boolean;
  showAnnotationDelete?: boolean;
  onTagClick?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTagDelete?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTextSelection?: (
    selection: SelectionNode,
    event: MouseEvent<HTMLDivElement>
  ) => void;
};

type MarkdownNERContextValue = {
  getTaxonomyNode: (type: string) => {
    key: string;
    label: string;
    color: string;
  };
  highlightId: number | null;
  deAnonimize: boolean;
  showAnnotationDelete: boolean;
  onTagClick: (event: MouseEvent, id: number) => void;
  onTagDelete: (event: MouseEvent, id: number) => void;
};

const MarkdownNERContext = createContext<MarkdownNERContextValue | undefined>(
  undefined
);

const stripVault = (value: string) => value.replace('vault:v1:', '');

// Trailing fragment of an entity that got split across inline markup / a hard
// break: plain highlight, no chip / delete / duplicate id.
const ContinuationMark = styled.span<{ color: string }>(({ color }) => ({
  background: color,
  padding: '0 1px',
  cursor: 'pointer',
}));

/** Renders one `<entity-mention>` produced by `remarkEntityAnnotations`. */
const EntityMentionRenderer = ({
  node,
  children,
}: {
  node?: any;
  children?: ReactNode;
}) => {
  const ctx = useContext(MarkdownNERContext);
  const properties = (node?.properties ?? {}) as Record<string, unknown>;
  const id = Number(properties['data-entity-id'] ?? NaN);

  if (!ctx || Number.isNaN(id)) return <>{children}</>;

  const isPrimary = properties['data-entity-primary'] != null;
  const type = (properties['data-entity-type'] as string) || 'UNKNOWN';
  const extraTypes = String(properties['data-entity-types'] || '')
    .split(',')
    .filter(Boolean);
  const { color } = ctx.getTaxonomyNode(type);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    ctx.onTagClick(event, id);
  };

  if (!isPrimary) {
    return (
      <ContinuationMark
        data-entity-id={id}
        data-entity-continuation="1"
        color={color}
        onClick={handleClick}
      >
        {children}
      </ContinuationMark>
    );
  }

  // Type chip: "Persona +2" - mirrors EntityNode.getTypesText.
  const typeKeys = Array.from(new Set([type, ...extraTypes]));
  const typeLabels = typeKeys.map((t) => {
    const taxonomyNode = ctx.getTaxonomyNode(t);
    return taxonomyNode.key === 'UNKNOWN' && t !== 'UNKNOWN'
      ? `${taxonomyNode.label}/${t}`
      : taxonomyNode.label;
  });
  const label =
    typeLabels.length > 1
      ? `${typeLabels[0]} +${typeLabels.length - 1}`
      : typeLabels[0];

  let content: ReactNode = children;
  if (typeof children === 'string') {
    let display = stripVault(children);
    if (!ctx.deAnonimize && display.length > 15) {
      display = `${display.slice(0, 15)}...`;
    }
    content = display;
  }

  const handleDelete = (event: MouseEvent) => {
    event.stopPropagation();
    ctx.onTagDelete(event, id);
  };

  return (
    <Tag
      id={`entity-tag-${id}`}
      data-entity-id={id}
      data-testid={`entity-node-${id}`}
      role="button"
      aria-label={`entity-${id}`}
      tabIndex={0}
      color={color}
      highlight={ctx.highlightId === id}
      onClick={handleClick}
    >
      {content}
      <TagLabel color={color}>{label}</TagLabel>
      {ctx.showAnnotationDelete && (
        <DeleteButton
          type="button"
          aria-label={`delete-entity-${id}`}
          onClick={handleDelete}
        >
          <FiX />
        </DeleteButton>
      )}
    </Tag>
  );
};

const mdComponents = {
  'entity-mention': EntityMentionRenderer,
} as unknown as Components;

/** Renders a single virtualized markdown block. */
const BlockRenderer = memo(
  ({
    source,
    entities,
  }: {
    source: string;
    entities: MarkdownEntity[];
  }) => {
    const remarkPlugins = useMemo(
      () => [remarkGfm, [remarkEntityAnnotations, { entities, softBreaks: true }]],
      [entities]
    );

    return (
      <Markdown
        skipHtml
        remarkPlugins={remarkPlugins as any}
        components={mdComponents}
      >
        {source}
      </Markdown>
    );
  }
);
BlockRenderer.displayName = 'BlockRenderer';

const Container = styled.div({
  padding: '0 20px',
});

const Card = styled.div({
  height: 'calc(100vh - 100px)',
  background: '#fff',
  maxWidth: '900px',
  borderRadius: '6px',
  margin: '0 auto',
  overflow: 'hidden',
});

const Scroller = styled.div<{ isAddMode: boolean; selectionColor?: string }>(
  ({ isAddMode, selectionColor }) => ({
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '24px 36px',
    fontSize: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: 'rgba(0, 0, 0, 0.8)',
    lineHeight: 1.7,
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
    ...(isAddMode && { cursor: 'text' }),
    ...(isAddMode &&
      selectionColor && {
        '& ::selection': { background: selectionColor },
      }),
    // Markdown prose
    '& p': { margin: '0 0 1em' },
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      margin: '1.4em 0 0.6em',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    '& h1': { fontSize: '1.7em' },
    '& h2': { fontSize: '1.4em' },
    '& h3': { fontSize: '1.2em' },
    '& ul, & ol': { margin: '0 0 1em', paddingLeft: '1.6em' },
    '& li': { margin: '0.25em 0' },
    '& li > p': { margin: 0 },
    '& blockquote': {
      margin: '0 0 1em',
      padding: '0.2em 1em',
      borderLeft: '3px solid rgba(0,0,0,0.15)',
      color: 'rgba(0,0,0,0.6)',
    },
    '& code': {
      background: 'rgba(0,0,0,0.05)',
      padding: '0.1em 0.35em',
      borderRadius: '4px',
      fontSize: '0.9em',
    },
    '& pre': {
      background: 'rgba(0,0,0,0.05)',
      padding: '12px 16px',
      borderRadius: '6px',
      overflowX: 'auto',
    },
    '& pre code': { background: 'none', padding: 0 },
    '& hr': {
      border: 'none',
      borderTop: '1px solid rgba(0,0,0,0.12)',
      margin: '1.5em 0',
    },
    '& a': { color: '#2563eb', textDecoration: 'underline' },
    '& table': {
      borderCollapse: 'collapse',
      width: '100%',
      margin: '0 0 1em',
      display: 'block',
      overflowX: 'auto',
    },
    '& th, & td': {
      border: '1px solid rgba(0,0,0,0.15)',
      padding: '6px 10px',
      textAlign: 'left',
    },
    '& img': { maxWidth: '100%' },
  })
);

const BlockItem = styled.div({
  '& > *:last-child': { marginBottom: 0 },
});

/**
 * Find `selected` (rendered text from `window.getSelection().toString()`)
 * inside `src` (the block's raw markdown source) and return its offsets.
 * `hint` is the approximate character offset of the selection in the block's
 * *rendered* text - used to pick the right occurrence when `selected` appears
 * more than once. Falls back to a whitespace/markdown-tolerant search.
 */
const locateInSource = (
  src: string,
  selected: string,
  hint: number
): { start: number; end: number } | null => {
  const trimmed = selected.trim();
  if (!trimmed) return null;

  // Prefer the occurrence closest to the hint (rendered text is a little
  // shorter than source, so search a bit before it too).
  const near = src.indexOf(trimmed, Math.max(0, hint - 12));
  const direct = near !== -1 ? near : src.indexOf(trimmed);
  if (direct !== -1) return { start: direct, end: direct + trimmed.length };

  // Normalize: drop markdown emphasis chars, collapse whitespace runs to one
  // space; keep a map from normalized index -> source index.
  const map: number[] = [];
  let norm = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '*' || c === '_' || c === '~' || c === '`') continue;
    if (/\s/.test(c)) {
      if (norm.endsWith(' ')) continue;
      norm += ' ';
    } else {
      norm += c;
    }
    map.push(i);
  }
  const normSel = trimmed.replace(/[*_~`]/g, '').replace(/\s+/g, ' ');
  if (normSel.length === 0) return null;
  let at = norm.indexOf(normSel, Math.max(0, hint - 12));
  if (at === -1) at = norm.indexOf(normSel);
  if (at === -1) return null;

  const start = map[at];
  const end = (map[at + normSel.length - 1] ?? src.length - 1) + 1;
  return { start, end };
};

const MarkdownNER = ({
  text,
  entityAnnotations,
  taxonomy,
  highlightAnnotation,
  isAddMode,
  addSelectionColor,
  deAnonimize = true,
  showAnnotationDelete = false,
  onTagClick,
  onTagDelete,
  onTextSelection,
}: MarkdownNERProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightId = useSelector(selectHighlightAnnotationId);

  const blocks: MarkdownBlock[] = useMemo(
    () => splitMarkdownBlocks(text),
    [text]
  );

  const entities: MarkdownEntity[] = useMemo(
    () => prepareMarkdownEntities(entityAnnotations, text),
    [entityAnnotations, text]
  );

  // annotation id -> the single block that renders it (its first).
  const entityBlockIndex = useMemo(() => {
    const map = new Map<number, number>();
    blocks.forEach((block, index) => {
      entities.forEach((e) => {
        if (e.start < block.end && e.end > block.start && !map.has(e.id)) {
          map.set(e.id, index);
        }
      });
    });
    return map;
  }, [blocks, entities]);

  // Per-block entity lists: an entity appears only in its own block, its `text`
  // re-sliced to the part that lives there (the plugin finds it by content).
  const blockEntities = useMemo(
    () =>
      blocks.map((block, index) => {
        const src = text.slice(block.start, block.end);
        return entities
          .filter((e) => entityBlockIndex.get(e.id) === index)
          .map((e) => {
            const start = Math.max(e.start, block.start) - block.start;
            const end = Math.min(e.end, block.end) - block.start;
            return { ...e, start, end, text: src.slice(start, end) };
          });
      }),
    [blocks, text, entities, entityBlockIndex]
  );

  const getTaxonomyNode = useCallback(
    (type: string) => getAllNodeData(taxonomy, mapEntityType(type)),
    [taxonomy]
  );

  const emitTagClick = useCallback(
    (event: MouseEvent, id: number) => {
      // DocumentViewer's handler only reads annotation.id.
      onTagClick?.(event, { id } as EntityAnnotation);
    },
    [onTagClick]
  );
  const emitTagDelete = useCallback(
    (event: MouseEvent, id: number) => {
      onTagDelete?.(event, { id } as EntityAnnotation);
    },
    [onTagDelete]
  );

  const contextValue = useMemo<MarkdownNERContextValue>(
    () => ({
      getTaxonomyNode,
      highlightId,
      deAnonimize,
      showAnnotationDelete,
      onTagClick: emitTagClick,
      onTagDelete: emitTagDelete,
    }),
    [
      getTaxonomyNode,
      highlightId,
      deAnonimize,
      showAnnotationDelete,
      emitTagClick,
      emitTagDelete,
    ]
  );

  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 8,
    measureElement: (element) =>
      element?.getBoundingClientRect().height || 120,
  });

  useEffect(() => {
    if (highlightAnnotation == null || highlightAnnotation < 0) return;
    const index = entityBlockIndex.get(highlightAnnotation);
    if (index == null) return;
    virtualizer.scrollToIndex(index, { align: 'center' });

    let tries = 0;
    const focus = () => {
      const el = document.getElementById(`entity-tag-${highlightAnnotation}`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (tries++ < 5) {
        timeout = window.setTimeout(focus, 80);
      }
    };
    let timeout = window.setTimeout(focus, 80);
    return () => window.clearTimeout(timeout);
  }, [highlightAnnotation, entityBlockIndex, virtualizer]);

  const lastSelectionAt = useRef(0);

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isAddMode || !onTextSelection) return;
      const now = Date.now();
      if (now - lastSelectionAt.current < 100) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }
      const selected = selection.toString();
      if (!selected.trim()) return;

      // Which block was the selection in?
      const range = selection.getRangeAt(0);
      const anchorEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as HTMLElement)
          : range.startContainer.parentElement;
      const blockEl = anchorEl?.closest('[data-index]') as HTMLElement | null;
      if (!blockEl) return;
      const blockIndex = Number(blockEl.dataset.index);
      const block = blocks[blockIndex];
      if (!block) return;

      // Approx offset of the selection start within the block's rendered text.
      let hint = 0;
      try {
        const pre = range.cloneRange();
        pre.selectNodeContents(blockEl);
        pre.setEnd(range.startContainer, range.startOffset);
        hint = pre.toString().length;
      } catch {
        hint = 0;
      }

      const src = text.slice(block.start, block.end);
      const loc = locateInSource(src, selected, hint);
      if (!loc) {
        // eslint-disable-next-line no-console
        console.warn(
          'Could not locate the selection in the document source - ignored. ' +
            'Try selecting a plain run of text (not across a tag).'
        );
        selection.removeAllRanges();
        return;
      }

      const start = block.start + loc.start;
      const end = block.start + loc.end;
      if (end - start < 1) return;

      const clash = entities.find((e) => e.start < end && e.end > start);
      if (clash) {
        // eslint-disable-next-line no-console
        console.warn(
          `Selection overlaps existing annotation ${clash.id} - ignored. ` +
            'Delete it first to re-annotate.'
        );
        selection.removeAllRanges();
        return;
      }

      lastSelectionAt.current = now;
      onTextSelection(
        {
          text: text.slice(start, end),
          // The rest of the app stores Python (codepoint) offsets.
          start: jsToPythonIndex(start, text),
          end: jsToPythonIndex(end, text),
        },
        event
      );
      selection.removeAllRanges();
    },
    [isAddMode, onTextSelection, text, entities, blocks]
  );

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Container>
      <MarkdownNERContext.Provider value={contextValue}>
        <Card>
          <Scroller
            ref={scrollRef}
            isAddMode={!!isAddMode}
            selectionColor={addSelectionColor}
            onMouseUp={handleMouseUp}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
                width: '100%',
              }}
            >
              {virtualItems.map((item) => (
                <BlockItem
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${item.start}px)`,
                    paddingBottom: '8px',
                  }}
                >
                  <BlockRenderer
                    source={text.slice(
                      blocks[item.index].start,
                      blocks[item.index].end
                    )}
                    entities={blockEntities[item.index]}
                  />
                </BlockItem>
              ))}
            </div>
          </Scroller>
        </Card>
      </MarkdownNERContext.Provider>
    </Container>
  );
};

export default MarkdownNER;
