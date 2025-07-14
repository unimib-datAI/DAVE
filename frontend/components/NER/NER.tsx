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

type NERProps = {
  text: string;
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
  highlightAnnotation,
  ...props
}: NERProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  // Render the full document - no pagination
  const nodes = useNER({
    text,
    entities: entityAnnotations,
    sections: sectionAnnotations,
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

  // Scroll to annotation when highlighted
  useEffect(() => {
    if (highlightAnnotation === null || !containerRef.current) return;

    const handleHighlight = () => {
      const highlightedNode = containerRef.current?.querySelector(
        `#entity-tag-${highlightAnnotation}`
      );
      
      if (highlightedNode) {
        setIsScrolling(true);
        
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
  }, [highlightAnnotation, entityAnnotations]);

  return (
    <NERContext.Provider value={contextValue}>
      <NodesContainer ref={containerRef}>
        {nodes.map((node) => {
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
