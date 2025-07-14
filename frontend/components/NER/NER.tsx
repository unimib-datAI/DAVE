import useNER from '@/lib/ner/core/use-ner';
import { FlattenedTaxonomy } from '@/modules/document/DocumentProvider/types';
import { getAllNodeData } from '@/components/Tree';
import { EntityAnnotation, SectionAnnotation } from '@/server/routers/document';
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
import { getStartAndEndIndexForPagination } from '@/utils/shared';

type NERProps = {
  text: string;
  page: number;
  entityAnnotations: EntityAnnotation[];
  sectionAnnotations?: SectionAnnotation[];
  taxonomy: FlattenedTaxonomy;
  highlightAnnotation?: number | null;
  isAddMode?: boolean;
  addSelectionColor?: string;
  showAnnotationDelete?: boolean;
  renderContentHover?: (annotation: EntityAnnotation) => ReactNode;
  onTextSelection?: (event: MouseEvent, node: SelectionNode) => void;
  onTagClick?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTagEnter?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTagLeave?: (event: MouseEvent, annotation: EntityAnnotation) => void;
  onTagDelete?: (event: MouseEvent, annotation: EntityAnnotation) => void;
};

const NodesContainer = styled.div({
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  lineHeight: 1.7,
  position: 'relative',
  minHeight: 'auto',
});

const BUFFER_SIZE = 1000; // Smaller buffer for better performance

const NER = ({
  text,
  entityAnnotations,
  sectionAnnotations,
  taxonomy,
  page,
  highlightAnnotation,
  ...props
}: NERProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  // Get pagination range based on current page
  const { startIndex, endIndex } = useMemo(() => {
    return getStartAndEndIndexForPagination(page, text);
  }, [page, text]);

  // Create a visible range with buffer for smoother scrolling
  const visibleRange = useMemo(() => {
    const start = Math.max(0, startIndex - BUFFER_SIZE);
    const end = Math.min(text.length, endIndex + BUFFER_SIZE);
    return { start, end };
  }, [startIndex, endIndex, text.length]);

  // Process only the visible nodes
  const nodes = useNER({
    text,
    page,
    entities: entityAnnotations,
    sections: sectionAnnotations,
    visibleRange,
  });

  const getTaxonomyNode = useCallback(
    (key: string) => getAllNodeData(taxonomy, key),
    [taxonomy]
  );

  const contextValue = useMemo(
    () => ({
      getTaxonomyNode,
      ...props,
    }),
    [props, getTaxonomyNode]
  );

  // Handle scrolling to highlighted annotation
  useEffect(() => {
    if (highlightAnnotation === null || !containerRef.current) return;

    const highlightedNode = containerRef.current.querySelector(
      `[data-annotation-id="${highlightAnnotation}"]`
    );
    
    if (highlightedNode) {
      setIsScrolling(true);
      
      // Check if the highlighted annotation is within the current visible range
      const annotation = entityAnnotations.find(a => a.id === highlightAnnotation);
      if (annotation && (annotation.start < visibleRange.start || annotation.end > visibleRange.end)) {
        // Annotation is outside visible range, we need to scroll to it
        // The parent Scroller component should handle this
        return;
      }
      
      highlightedNode.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      const timeout = setTimeout(() => setIsScrolling(false), 1000);
      return () => clearTimeout(timeout);
    }
  }, [highlightAnnotation, entityAnnotations, visibleRange]);

  // Filter nodes that are actually within the visible range
  const visibleNodes = useMemo(() => {
    return nodes.filter(node => {
      // Only render nodes that overlap with the visible range
      return node.start < visibleRange.end && node.end > visibleRange.start;
    });
  }, [nodes, visibleRange]);

  return (
    <NERContext.Provider value={contextValue}>
      <NodesContainer ref={containerRef}>
        {visibleNodes.map((node) => {
          if (node.type === 'section') {
            const { key, ...sectionProps } = node;
            return (
              <Section
                key={key}
                {...sectionProps}
                data-start={node.start}
                data-end={node.end}
              >
                {node.contentNodes.map(({ key, ...nodeProps }) => {
                  if (nodeProps.type === 'text') {
                    return <TextNode key={key} {...nodeProps} />;
                  }
                  return <EntityNode key={key} {...nodeProps} />;
                })}
              </Section>
            );
          }
          if (node.type === 'text') {
            const { key, ...textProps } = node;
            return <TextNode key={key} {...textProps} />;
          }
          const { key, ...entityProps } = node;
          return <EntityNode key={key} {...entityProps} />;
        })}
      </NodesContainer>
    </NERContext.Provider>
  );
};

export default NER;
