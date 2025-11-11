import { getSpan } from '@/lib/ner/core';
import { Annotation, EntityNode as EntityNodeType } from '@/lib/ner/core/types';
import { ChildNodeWithColor, getAllNodeData } from '@/components/Tree';
import {
  AdditionalAnnotationProps,
  EntityAnnotation,
} from '@/server/routers/document';
import styled from '@emotion/styled';
import { Tooltip } from '@nextui-org/react';
import { darken } from 'polished';
import {
  ReactNode,
  useCallback,
  useMemo,
  MouseEvent,
  useEffect,
  useState,
} from 'react';
import { useNERContext } from './nerContext';
import { FiX } from '@react-icons/all-files/fi/FiX';
import { FiLink } from '@react-icons/all-files/fi/FiLink';
import { keyframes } from '@emotion/react';
import { useDocumentContext } from '../../modules/document/DocumentProvider/selectors';

type EntityNodeProps = EntityNodeType<AdditionalAnnotationProps>;

const pulse = keyframes`
0% {
  transform: scale(1);
  box-shadow: 0 0 0 0 rgba(66, 153, 225, 0.5);
}
30% {
  transform: scale(1.05);
  box-shadow: 0 0 0 8px rgba(66, 153, 225, 0.2);
}
60% {
  transform: scale(1.1);
  box-shadow: 0 0 0 12px rgba(66, 153, 225, 0.1);
}
100% {
  transform: scale(1);
  box-shadow: 0 0 0 0 rgba(66, 153, 225, 0);
}
`;

const Tag = styled.span<{ color: string; highlight: boolean }>(
  ({ color, highlight }) => ({
    display: 'inline-flex',
    gap: '5px',
    alignItems: 'center',
    position: 'relative',
    padding: '0px 5px',
    borderRadius: '6px',
    background: color,
    color: darken(0.7, color),
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
    border: `1px solid ${darken(0.05, color)}`,
    ...(highlight && {
      background: darken(0.1, color),
      animation: `${pulse} 1200ms ease-out`,
      zIndex: 9999,
      position: 'relative',
      border: `2px solid ${darken(0.3, color)}`,
    }),
    '& > button': {
      background: darken(0.1, color),
      '&:hover': {
        background: darken(0.2, color),
      },
    },
    transition: 'all 200ms ease-out',
  })
);

const TagLabel = styled.span<{ color: string }>(({ color }) => ({
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  padding: '0 3px',
  borderRadius: '4px',
  pointerEvents: 'none',
  background: darken(0.35, color),
  color: color,
  verticalAlign: 'middle',
}));

const DeleteButton = styled.button({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  fontSize: '12px',
  margin: 0,
  padding: '2px',
  borderRadius: '50%',
  cursor: 'pointer',
});

import React from 'react';

const EntityNodeInner = React.forwardRef<HTMLSpanElement, EntityNodeProps>(
  function EntityNodeComponent(props, ref) {
    const { text, start, annotation } = props;
    const [highlight, setHighlight] = useState(false);
    const {
      onTagClick,
      onTagEnter,
      onTagLeave,
      onTagDelete,
      getTaxonomyNode,
      renderContentHover,
      highlightAnnotation,
      showAnnotationDelete,
    } = useNERContext();
    const { deAnonimize } = useDocumentContext();

    useEffect(() => {
      if (highlightAnnotation === annotation.id) {
        // Force highlight state update for windowed rendering
        setHighlight(false); // Reset first

        // Use a single animation frame to reduce overhead
        requestAnimationFrame(() => {
          setHighlight(true);

          // Reset highlight after animation duration
          const resetTimeout = setTimeout(() => {
            setHighlight(false);
          }, 1200); // Match the animation duration

          return () => clearTimeout(resetTimeout);
        });
      } else {
        // Reset highlight if it's a different annotation
        setHighlight(false);
      }
    }, [highlightAnnotation, annotation.id]);

    const handleTagClick = useCallback(
      (ann: Annotation<AdditionalAnnotationProps>) => (event: MouseEvent) => {
        event.stopPropagation();

        if (onTagClick) {
          onTagClick(event, ann);
        }
      },
      [onTagClick]
    );

    const handleOnTagEnter = useCallback(
      (ann: Annotation<AdditionalAnnotationProps>) => (event: MouseEvent) => {
        event.stopPropagation();

        if (onTagEnter) {
          onTagEnter(event, ann);
        }
      },
      [onTagEnter]
    );

    const handleOnTagLeave = useCallback(
      (ann: Annotation<AdditionalAnnotationProps>) => (event: MouseEvent) => {
        // event.stopPropagation();

        if (onTagLeave) {
          onTagLeave(event, ann);
        }
      },
      [onTagLeave]
    );

    const handleOnTagDelete = useCallback(
      (ann: Annotation<AdditionalAnnotationProps>) => (event: MouseEvent) => {
        event.stopPropagation();

        if (onTagDelete) {
          onTagDelete(event, ann);
        }
      },
      [onTagDelete]
    );

    const { color } = useMemo(
      () => getTaxonomyNode(annotation.type),
      [getTaxonomyNode, annotation.type]
    );

    const getTypesText = useCallback(
      (ann: Annotation<AdditionalAnnotationProps>) => {
        const types_set = new Set(ann.features.types || []);
        types_set.add(ann.type);
        const types = Array.from(types_set);

        // Map each type to its label
        const typeLabels = types.map((t) => {
          const node = getTaxonomyNode(t);
          // If the node is the UNKNOWN node (Altro) but the original type isn't "UNKNOWN",
          // show "Altro/originalType"
          if (node.key === 'UNKNOWN' && t !== 'UNKNOWN') {
            return `${node.label}/${t}`;
          }
          return node.label;
        });

        const nMoreTypes = typeLabels.length - 1;
        if (nMoreTypes === 0) {
          return typeLabels[0];
        }
        return `${typeLabels[0]} +${nMoreTypes}`;
      },
      [getTaxonomyNode]
    );
    /**
     * Get a tag element
     */
    const getTag = useCallback(
      ({
        color,
        children,
        annotation,
      }: {
        color: string;
        children: ReactNode;
        annotation: Annotation<AdditionalAnnotationProps>;
      }) => {
        if (
          !deAnonimize &&
          typeof children === 'string' &&
          children.length > 15
        ) {
          children = children.slice(0, 15) + '...';
        }
        const tagElement = (
          <Tag
            id={`entity-tag-${annotation.id}`}
            highlight={highlight}
            color={color}
            onClick={handleTagClick(annotation)}
            onMouseEnter={handleOnTagEnter(annotation)}
            onMouseLeave={handleOnTagLeave(annotation)}
          >
            {children}
            <TagLabel color={color}>{getTypesText(annotation)}</TagLabel>
            {/* Removed url icon/link display */}
            {annotation.features.url &&
              annotation.features.url.startsWith('https://') && <FiLink />}
            {showAnnotationDelete && (
              <DeleteButton onClick={(e) => handleOnTagDelete(annotation)(e)}>
                <FiX />
              </DeleteButton>
            )}
          </Tag>
        );

        if (renderContentHover) {
          return (
            <Tooltip
              css={{ display: 'inline-block' }}
              placement="top"
              content={renderContentHover(annotation)}
            >
              {tagElement}
            </Tooltip>
          );
        }

        return tagElement;
      },
      [
        highlight,
        deAnonimize,
        handleTagClick,
        handleOnTagEnter,
        handleOnTagLeave,
        handleOnTagDelete,
        getTypesText,
        showAnnotationDelete,
        renderContentHover,
      ]
    );

    /**
     * Build an entity tag by constructing its nested entities
     */
    // const recurseTag = useCallback((): ReactNode => {
    //   let children: ReactNode = null;

    //   nesting.forEach((entityId, index) => {
    //     const curr = annotations[entityId];
    //     const { color } = getTaxonomyNode(curr.type);

    //     if (index === 0) {
    //       const textStart = curr.start - start;
    //       const textEnd = textStart + (curr.end - curr.start);
    //       const { text: span } = getSpan(text, textStart, textEnd);
    //       children = getTag({
    //         index,
    //         color,
    //         children: span,
    //         annotation: curr
    //       })
    //     } else {
    //       const prev = getPreviousNestedAnnotation(annotations, nesting, index);
    //       const leftSpan = getLeftText(text, prev, curr, start);
    //       const rightSpan = getRightText(text, prev, curr, start);
    //       children = getTag({
    //         index,
    //         color,
    //         annotation: curr,
    //         children: (
    //           <>
    //             {leftSpan}{children}{rightSpan}
    //           </>
    //         )
    //       })
    //     }
    //   });

    //   return children;
    // }, [props])

    // memoized the tag recursion so that it runs only when the tag prop changes
    // const tagContent = useMemo(() => recurseTag(), [recurseTag]);

    return (
      <>
        {text
          ? getTag({
              color,
              annotation,
              children: text.replace('vault:v1:', ''),
            })
          : null}
      </>
    );
  }
);

// Apply memo separately after naming the component
const EntityNode = React.memo(EntityNodeInner, (prevProps, nextProps) => {
  // Custom equality check to prevent unnecessary re-renders
  return (
    prevProps.text === nextProps.text &&
    prevProps.start === nextProps.start &&
    prevProps.annotation.id === nextProps.annotation.id &&
    prevProps.annotation.type === nextProps.annotation.type
  );
});

export default EntityNode;
