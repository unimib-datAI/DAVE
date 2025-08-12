import { TextNode as TextNodeType } from '@/lib/ner/core/types';
import styled from '@emotion/styled';
import { MouseEvent, useCallback, memo } from 'react';
import { useNERContext } from './nerContext';

type TextNodeProps = TextNodeType;

export type SelectionNode = {
  text: string;
  start: number;
  end: number;
};

// Memoized selection processing functions to improve performance

/**
 * Get the text selection
 */
const getTextSelection = () => {
  const selection = window.getSelection();
  if (
    !selection ||
    !selection.anchorNode ||
    selection.anchorOffset === selection.focusOffset
  ) {
    return null;
  }
  return selection;
};

/**
 * Get startOffset - optimized to reduce calculations
 */
const getNodeSelectionOffset = (selection: Selection) => {
  const { anchorNode, anchorOffset, focusOffset } = selection;
  if (!anchorNode || !anchorNode.nodeValue) {
    return null;
  }

  // Quick calculation of offsets
  const startOffsetNode =
    anchorOffset > focusOffset ? focusOffset : anchorOffset;
  const endOffsetNode =
    startOffsetNode === anchorOffset ? focusOffset : anchorOffset;

  return {
    startOffsetNode,
    endOffsetNode,
  };
};

// Cache for recently calculated offsets to avoid recalculating
const offsetCache = new Map<string, { start: number; end: number }>();

const getOriginalOffset = ({
  start,
  end,
  startOffsetNode,
  endOffsetNode,
}: {
  start: number;
  end: number;
  startOffsetNode: number;
  endOffsetNode: number;
}) => {
  // Create a cache key using the parameters
  const cacheKey = `${start}-${end}-${startOffsetNode}-${endOffsetNode}`;

  // Return cached result if available
  if (offsetCache.has(cacheKey)) {
    return offsetCache.get(cacheKey)!;
  }

  const originalStart = start + startOffsetNode;
  const originalEnd = originalStart + (endOffsetNode - startOffsetNode);

  const result = {
    start: originalStart,
    end: originalEnd,
  };

  // Cache the result (limit cache size to prevent memory leaks)
  if (offsetCache.size > 100) {
    // Clear the cache if it gets too large
    offsetCache.clear();
  }
  offsetCache.set(cacheKey, result);

  return result;
};

type SpanProps = {
  isAddMode: boolean;
  selectionColor: string | undefined;
};

const Span = styled.span<SpanProps>(({ isAddMode, selectionColor }) => ({
  ...(isAddMode && {
    '::selection': {
      background: selectionColor,
    },
  }),
}));

// Use React.memo to prevent unnecessary re-renders
const TextNode = memo(
  (props: TextNodeProps) => {
    const { isAddMode, addSelectionColor, onTextSelection } = useNERContext();

    const { text, start, end } = props;

    // Memoize the handler to prevent unnecessary function recreation
    const handleMouseUp = useCallback(
      (event: MouseEvent) => {
        if (!isAddMode || !onTextSelection) return;

        // Debounce/throttle selection handling
        // Skip processing if another selection was processed very recently
        if (
          TextNode.lastSelectionTime &&
          Date.now() - TextNode.lastSelectionTime < 100
        ) {
          return;
        }

        // get user text selection
        const selection = getTextSelection();
        if (!selection) {
          return;
        }

        // get offset of what it is selected inside the node where the selection happens
        const nodeSelectionOffset = getNodeSelectionOffset(selection);
        if (!nodeSelectionOffset) {
          return;
        }

        // get the offset to the original text
        const offset = getOriginalOffset({
          start,
          end,
          ...nodeSelectionOffset,
        });
        if (!offset) {
          return;
        }

        const selectedText = selection.toString();
        const selectionNode = { text: selectedText, ...offset };

        // Track when we last processed a selection
        TextNode.lastSelectionTime = Date.now();

        // Fire the event
        onTextSelection(event, selectionNode);
      },
      [isAddMode, onTextSelection, start, end]
    );

    // Skip rendering if text is empty
    if (!text) return null;

    return (
      <Span
        isAddMode={!!isAddMode}
        selectionColor={addSelectionColor}
        onMouseUp={handleMouseUp}
      >
        {text}
      </Span>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check to prevent unnecessary re-renders
    // Only re-render if the text content changed or position changed
    return (
      prevProps.text === nextProps.text &&
      prevProps.start === nextProps.start &&
      prevProps.end === nextProps.end
    );
  }
);

// Static property to track last selection time for throttling
TextNode.lastSelectionTime = 0;

export default TextNode;
