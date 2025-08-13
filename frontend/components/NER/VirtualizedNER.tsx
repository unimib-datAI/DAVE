import { useVirtualizer } from '@tanstack/react-virtual';
import { getAllNodeData, mapEntityType } from '@/components/Tree';
import { EntityAnnotation, SectionAnnotation } from '@/server/routers/document';
import { FlattenedTaxonomy } from '@/modules/document/DocumentProvider/types';
import useNER from '@/lib/ner/core/use-ner';
import styled from '@emotion/styled';
import {
  useCallback,
  useMemo,
  MouseEvent,
  ReactNode,
  useRef,
  useEffect,
  useState,
  memo,
} from 'react';
import EntityNode from './EntityNode';
import { NERContext } from './nerContext';
import Section from './Section';
import TextNode, { SelectionNode } from './TextNode';

type VirtualizedNERProps = {
  text: string;
  entityAnnotations: EntityAnnotation[];
  sectionAnnotations?: SectionAnnotation[];
  taxonomy: FlattenedTaxonomy;
  highlightAnnotation?: number | null;
  isAddMode?: boolean;
  addSelectionColor?: string;
  showAnnotationDelete?: boolean;
  renderContentHover?: (annotation: EntityAnnotation) => ReactNode;
  onTagClick?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTagDelete?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTextSelection?: (
    selection: SelectionNode,
    event: MouseEvent<HTMLDivElement>
  ) => void;
};

const Container = styled.div({
  position: 'relative',
  width: '100%',
  height: '100%',
});

const VirtualContainer = styled.div({
  width: '100%',
  height: '100%',
  overflow: 'auto',
  scrollBehavior: 'smooth',
});

const VirtualContent = styled.div({
  position: 'relative',
  width: '100%',
  minHeight: '100%',
});

const VirtualItem = styled.div({
  width: '100%',
  fontSize: '16px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: 'rgba(0, 0, 0, 0.8)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  lineHeight: 1.7,
  display: 'block',
  boxSizing: 'border-box',
  // Allow natural content sizing - no height restrictions
});

const VirtualizedNER = memo(
  ({
    text,
    entityAnnotations,
    sectionAnnotations = [],
    taxonomy,
    highlightAnnotation,
    isAddMode,
    addSelectionColor,
    showAnnotationDelete,
    renderContentHover,
    onTagClick,
    onTagDelete,
    onTextSelection,
  }: VirtualizedNERProps) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Memoize entityAnnotations to prevent unnecessary recalculations
    const memoizedEntityAnnotations = useMemo(
      () => entityAnnotations,
      [
        // Only update if the actual annotations have changed
        JSON.stringify(
          entityAnnotations.map(
            (ann) => `${ann.id}-${ann.start}-${ann.end}-${ann.type}`
          )
        ),
      ]
    );

    // Process all nodes using the existing NER logic
    const allNodes = useNER({
      text,
      entities: memoizedEntityAnnotations,
      sections: sectionAnnotations,
    });

    // Group nodes into logical chunks (by paragraphs/sections)
    const virtualizedChunks = useMemo(() => {
      const chunks: any[] = [];
      let currentChunk: any[] = [];

      allNodes.forEach((node: any, index: number) => {
        if (node.type === 'section') {
          // Sections are their own chunks
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
          }
          chunks.push([node]);
        } else {
          // Group text and entity nodes together until we hit a natural break
          currentChunk.push(node);

          // Check if this node ends with a paragraph break or significant whitespace
          const nodeText = node.type === 'text' ? node.text : '';

          // Break on paragraph boundaries or line breaks
          if (nodeText.includes('\n\n') || nodeText.endsWith('\n')) {
            chunks.push(currentChunk);
            currentChunk = [];
          }

          // Also break chunks if they get too large (prevent oversized chunks)
          if (currentChunk.length > 20) {
            // Reduced to create smaller chunks for better performance
            chunks.push(currentChunk);
            currentChunk = [];
          }

          // Break on very long text content
          const totalTextLength = currentChunk.reduce((sum, chunkNode) => {
            if (chunkNode.type === 'text') {
              return sum + (chunkNode.text?.length || 0);
            }
            return sum + 10; // Approximate entity length
          }, 0);

          if (totalTextLength > 500) {
            // Break if chunk gets too text-heavy (reduced from 800)
            chunks.push(currentChunk);
            currentChunk = [];
          }
        }
      });

      // Add any remaining nodes
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      return chunks;
    }, [allNodes]);

    // Create virtualizer for the chunks
    const virtualizer = useVirtualizer({
      count: virtualizedChunks.length,
      getScrollElement: () => containerRef.current,
      estimateSize: () => 80, // Simple base estimate, will be measured dynamically
      overscan: 5, // Increased overscan to reduce visible loading
      // Enable dynamic sizing - each item will be measured after rendering
      measureElement: (element) => {
        if (!element) return 80;
        const height = element.getBoundingClientRect().height;
        return height || 80;
      },
    });

    const getTaxonomyNode = useCallback(
      (key: string) => {
        // First try to map the entity type to handle English variants
        const mappedKey = mapEntityType(key);
        return getAllNodeData(taxonomy, mappedKey);
      },
      [taxonomy]
    );

    // Transform event handlers to match NERContext interface
    const handleTextSelection = useCallback(
      (event: MouseEvent, node: SelectionNode) => {
        if (onTextSelection) {
          onTextSelection(node, event as MouseEvent<HTMLDivElement>);
        }
      },
      [onTextSelection]
    );

    const handleTagClick = useCallback(
      (event: MouseEvent, annotation: EntityAnnotation) => {
        if (onTagClick) {
          onTagClick(event, annotation);
        }
      },
      [onTagClick]
    );

    const handleTagDelete = useCallback(
      (event: MouseEvent, annotation: EntityAnnotation) => {
        if (onTagDelete) {
          onTagDelete(event, annotation);
        }
      },
      [onTagDelete]
    );

    const contextValue = useMemo(
      () => ({
        getTaxonomyNode,
        highlightAnnotation,
        isAddMode,
        addSelectionColor,
        showAnnotationDelete,
        renderContentHover,
        onTextSelection: handleTextSelection,
        onTagClick: handleTagClick,
        onTagDelete: handleTagDelete,
      }),
      [
        getTaxonomyNode,
        highlightAnnotation,
        isAddMode,
        addSelectionColor,
        showAnnotationDelete,
        renderContentHover,
        handleTextSelection,
        handleTagClick,
        handleTagDelete,
      ]
    );

    // Scroll to annotation when highlighted
    useEffect(() => {
      if (highlightAnnotation === null || !containerRef.current) return;

      const handleHighlight = () => {
        // Find the chunk index that contains this annotation
        const chunkIndex = virtualizedChunks.findIndex((chunk: any[]) => {
          return chunk.some((node: any) => {
            if (node.type === 'entity') {
              return node.annotation?.id === highlightAnnotation;
            }
            if (node.type === 'section') {
              return node.contentNodes?.some(
                (contentNode: any) =>
                  contentNode.type === 'entity' &&
                  contentNode.annotation?.id === highlightAnnotation
              );
            }
            return false;
          });
        });

        if (chunkIndex >= 0) {
          virtualizer.scrollToIndex(chunkIndex, { align: 'center' });
        }
      };

      // Small delay to ensure content is rendered
      const timeoutId = setTimeout(handleHighlight, 100);
      return () => clearTimeout(timeoutId);
    }, [highlightAnnotation, virtualizedChunks, virtualizer]);

    // Render a single node
    const renderNode = useCallback(
      (node: any) => {
        if (node.type === 'section') {
          const { key, ...sectionProps } = node;
          return (
            <Section
              key={key}
              {...sectionProps}
              data-start={node.start}
              data-end={node.end}
            >
              {node.contentNodes.map(({ key, ...nodeProps }: any) => {
                if (nodeProps.type === 'text') {
                  return (
                    <TextNode
                      key={key}
                      {...nodeProps}
                      data-start={nodeProps.start}
                      data-end={nodeProps.end}
                    />
                  );
                }
                return (
                  <EntityNode
                    key={key}
                    {...nodeProps}
                    data-start={nodeProps.start}
                    data-end={nodeProps.end}
                  />
                );
              })}
            </Section>
          );
        }
        if (node.type === 'text') {
          const { key, ...textProps } = node;
          return (
            <TextNode
              key={key}
              {...textProps}
              data-start={node.start}
              data-end={node.end}
            />
          );
        }
        const { key, ...entityProps } = node;
        return (
          <EntityNode
            key={key}
            {...entityProps}
            data-start={node.start}
            data-end={node.end}
          />
        );
      },
      // Add dependencies that actually affect rendering
      [highlightAnnotation, isAddMode, addSelectionColor, showAnnotationDelete]
    );

    // Render a chunk of nodes (maintains inline flow)
    const renderChunk = useCallback(
      (chunk: any[]) => {
        return (
          <span style={{ display: 'inline' }}>
            {chunk.map((node: any) => renderNode(node))}
          </span>
        );
      },
      [renderNode]
    );

    const virtualItems = virtualizer.getVirtualItems();

    return (
      <NERContext.Provider value={contextValue}>
        <Container>
          <VirtualContainer ref={containerRef}>
            <VirtualContent
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualItem) => {
                const chunk = virtualizedChunks[virtualItem.index];
                return (
                  <VirtualItem
                    key={virtualItem.key}
                    ref={virtualizer.measureElement} // This enables dynamic measurement
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingBottom: '8px', // Consistent padding
                      boxSizing: 'border-box',
                    }}
                    data-index={virtualItem.index}
                  >
                    {renderChunk(chunk)}
                  </VirtualItem>
                );
              })}
            </VirtualContent>
          </VirtualContainer>
        </Container>
      </NERContext.Provider>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality function to prevent unnecessary re-renders
    // Only re-render if text content changed or annotations meaningfully changed
    const annotationsEqual =
      prevProps.entityAnnotations.length ===
        nextProps.entityAnnotations.length &&
      prevProps.highlightAnnotation === nextProps.highlightAnnotation;

    // For text, we only care if it's the same reference since text rarely changes
    const textEqual = prevProps.text === nextProps.text;

    // For section annotations, we only check if the length changed
    const sectionsEqual =
      (!prevProps.sectionAnnotations && !nextProps.sectionAnnotations) ||
      prevProps.sectionAnnotations?.length ===
        nextProps.sectionAnnotations?.length;

    // For UI state, we check specific props that affect rendering
    const uiStateEqual =
      prevProps.isAddMode === nextProps.isAddMode &&
      prevProps.addSelectionColor === nextProps.addSelectionColor &&
      prevProps.showAnnotationDelete === nextProps.showAnnotationDelete;

    return textEqual && annotationsEqual && sectionsEqual && uiStateEqual;
  }
);

// Ensure the component is properly exported with memo
export default VirtualizedNER;
