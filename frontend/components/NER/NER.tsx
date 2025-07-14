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

  // FIXED: Always use infinite loading - no windowing
  const { startIndex, endIndex } = useMemo(() => {
    return getStartAndEndIndexForPagination(page, text);
  }, [page, text]);

  // Create visible range for infinite loading
  const visibleRange = useMemo(() => {
    return { start: startIndex, end: endIndex };
  }, [startIndex, endIndex]);

  // Process only the visible nodes with windowed approach
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
      highlightAnnotation,
      ...props,
    }),
    [props, getTaxonomyNode, highlightAnnotation]
  );

  // Improved scroll to annotation with better infinite loading support
  useEffect(() => {
    if (highlightAnnotation === null || !containerRef.current) return;

    // Smoother delay for content rendering
    const handleHighlight = () => {
      const highlightedNode = containerRef.current?.querySelector(
        `#entity-tag-${highlightAnnotation}`
      );
      
      if (highlightedNode) {
        setIsScrolling(true);
        
        // For infinite loading, all content is rendered from start to current page
        // So we only need to check if the annotation is within the loaded range
        const annotation = entityAnnotations.find(a => a.id === highlightAnnotation);
        if (annotation) {
          const isInLoadedRange = annotation.start >= visibleRange.start && 
                                 annotation.end <= visibleRange.end;
          
          if (!isInLoadedRange) {
            // Annotation is outside loaded range, no need to scroll
            setIsScrolling(false);
            return;
          }
        }
        
        // Use intersection observer for smoother scrolling
        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            observer.disconnect();
            setIsScrolling(false);
          }
        }, {
          rootMargin: '0px',
          threshold: 0.1
        });
        
        observer.observe(highlightedNode);
        
        // Smooth scroll to the element
        highlightedNode.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Cleanup after timeout
        const timeout = setTimeout(() => {
          observer.disconnect();
          setIsScrolling(false);
        }, 2000);
        
        return () => {
          clearTimeout(timeout);
          observer.disconnect();
        };
      }
    };

    // Shorter delay for better responsiveness
    const timeoutId = setTimeout(handleHighlight, 50);
    
    return () => clearTimeout(timeoutId);
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
            return <TextNode key={key} {...textProps} data-start={node.start} data-end={node.end} />;
          }
          const { key, ...entityProps } = node;
          return <EntityNode key={key} {...entityProps} data-start={node.start} data-end={node.end} />;
        })}
      </NodesContainer>
    </NERContext.Provider>
  );
};

export default NER;
