import { useVirtualizer } from '@tanstack/react-virtual';
import { getAllNodeData } from '@/components/Tree';
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
  onTagClick?: (annotation: EntityAnnotation) => void;
  onTagDelete?: (annotation: EntityAnnotation) => void;
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
});

const VirtualContent = styled.div({
  position: 'relative',
  width: '100%',
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
});

const VirtualizedNER = ({
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

  // Process all nodes using the existing NER logic
  const allNodes = useNER({
    text,
    entities: entityAnnotations,
    sections: sectionAnnotations,
  });

  // Create virtualizer for the nodes
  const virtualizer = useVirtualizer({
    count: allNodes.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 50, // Estimate height per node
    overscan: 10, // Render extra items for smoother scrolling
  });

  const getTaxonomyNode = useCallback(
    (key: string) => getAllNodeData(taxonomy, key),
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
        onTagClick(annotation);
      }
    },
    [onTagClick]
  );

  const handleTagDelete = useCallback(
    (event: MouseEvent, annotation: EntityAnnotation) => {
      if (onTagDelete) {
        onTagDelete(annotation);
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
      // Find the node index that contains this annotation
      const nodeIndex = allNodes.findIndex((node: any) => {
        if (node.type === 'entity') {
          return node.annotation?.id === highlightAnnotation;
        }
        if (node.type === 'section') {
          return node.contentNodes?.some((contentNode: any) => 
            contentNode.type === 'entity' && contentNode.annotation?.id === highlightAnnotation
          );
        }
        return false;
      });

      if (nodeIndex >= 0) {
        virtualizer.scrollToIndex(nodeIndex, { align: 'center' });
      }
    };

    // Small delay to ensure content is rendered
    const timeoutId = setTimeout(handleHighlight, 100);
    return () => clearTimeout(timeoutId);
  }, [highlightAnnotation, allNodes, virtualizer]);

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
    []
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
              const node = allNodes[virtualItem.index];
              return (
                <VirtualItem
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  data-index={virtualItem.index}
                >
                  {renderNode(node)}
                </VirtualItem>
              );
            })}
          </VirtualContent>
        </VirtualContainer>
      </Container>
    </NERContext.Provider>
  );
};

export default VirtualizedNER;
