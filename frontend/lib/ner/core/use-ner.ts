import { memo } from '@/utils/shared';
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
  entities: Annotation<T>[];
  sections?: Annotation<U>[];
};

const useNER = <T = {}, U = {}>(props: USENERProps<T, U>) => {
  const { text, entities, sections = [] } = props;

  return useMemo(() => {
    // Use the entire text without pagination
    const visibleText = text;

    // Use all entities and sections without filtering
    const visibleEntities = entities;
    const visibleSections = sections;

    // Create nodes for the entire text
    let nodes;
    if (visibleSections.length > 0) {
      nodes = createSectionNodes(visibleText, visibleSections, visibleEntities);
    } else {
      nodes = createNodes(visibleText, visibleEntities);
    }

    return nodes;
  }, [text, entities, sections]);
};

export default useNER;
