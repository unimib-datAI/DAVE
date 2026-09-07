import { getSpan } from '@/lib/ner/core';
import { Annotation, EntityNode as EntityNodeType } from '@/lib/ner/core/types';
import { ChildNodeWithColor, getAllNodeData } from '@/components/Tree';
import {
  AdditionalAnnotationProps,
  EntityAnnotation,
} from '@/lib/types/document';
import { Tooltip } from '@heroui/react';
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
import { Tag, TagLabel, DeleteButton } from './EntityTag';
import { useDocumentContext } from '../../modules/document/DocumentProvider/selectors';

type EntityNodeProps = EntityNodeType<AdditionalAnnotationProps>;

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
            data-testid={`entity-node-${annotation.id}`}
            data-entity-id={annotation.id}
            role="button"
            aria-label={`entity-${annotation.id}`}
            tabIndex={0}
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
    prevProps.annotation.type === nextProps.annotation.type &&
    JSON.stringify(prevProps.annotation.features?.types) ===
      JSON.stringify(nextProps.annotation.features?.types)
  );
});

export default EntityNode;
