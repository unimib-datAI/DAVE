import { getStartAndEndIndexForPagination, memo } from '@/utils/shared';
import { useCallback, useMemo } from 'react';
import {
  createNodes,
  createSectionNodes,
  getSectionNodesFactory,
  orderAnnotations,
} from '.';
import { Annotation } from './types';

type USENERProps<T, U> = {
  text: string;
  page: number;
  entities: Annotation<T>[];
  sections?: Annotation<U>[];
  visibleRange?: { start: number; end: number };
};

const useNER = <T = {}, U = {}>(props: USENERProps<T, U>) => {
  const { text, page, entities, sections = [], visibleRange } = props;

  return useMemo(() => {
    // Use visible range if provided, otherwise use page-based pagination
    let startIndex: number;
    let endIndex: number;

    if (visibleRange) {
      startIndex = visibleRange.start;
      endIndex = visibleRange.end;
    } else {
      const range = getStartAndEndIndexForPagination(page, text);
      startIndex = range.startIndex;
      endIndex = range.endIndex;
    }

    // Ensure indices are within bounds
    startIndex = Math.max(0, startIndex);
    endIndex = Math.min(text.length, endIndex);

    // Extract only the visible text
    const visibleText = text.slice(startIndex, endIndex);

    // Filter and adjust entities for the visible range
    const visibleEntities = entities.filter(
      (entity) => entity.start < endIndex && entity.end > startIndex
    ).map(entity => {
      // Adjust entity positions relative to visible text
      const adjustedStart = Math.max(0, entity.start - startIndex);
      const adjustedEnd = Math.min(entity.end - startIndex, visibleText.length);
      
      return {
        ...entity,
        start: adjustedStart,
        end: adjustedEnd,
      };
    });

    // Filter and adjust sections for the visible range
    const visibleSections = sections.filter(
      (section) => section.start < endIndex && section.end > startIndex
    ).map(section => {
      // Adjust section positions relative to visible text
      const adjustedStart = Math.max(0, section.start - startIndex);
      const adjustedEnd = Math.min(section.end - startIndex, visibleText.length);
      
      return {
        ...section,
        start: adjustedStart,
        end: adjustedEnd,
      };
    });

    // Create nodes for the visible range
    let nodes;
    if (visibleSections.length > 0) {
      nodes = createSectionNodes(visibleText, visibleSections, visibleEntities);
    } else {
      nodes = createNodes(visibleText, visibleEntities);
    }

    // Restore absolute positions for proper rendering and data attributes
    return nodes.map(node => {
      if (node.type === 'section') {
        return {
          ...node,
          start: node.start + startIndex,
          end: node.end + startIndex,
          contentNodes: node.contentNodes.map(contentNode => ({
            ...contentNode,
            start: contentNode.start + startIndex,
            end: contentNode.end + startIndex,
          })),
        };
      } else {
        return {
          ...node,
          start: node.start + startIndex,
          end: node.end + startIndex,
        };
      }
    });
  }, [text, page, entities, sections, visibleRange]);
};

export default useNER;
