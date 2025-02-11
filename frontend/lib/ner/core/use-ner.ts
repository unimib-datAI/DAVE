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
};

const useNER = <T = {}, U = {}>(props: USENERProps<T, U>) => {
  // const { text, page, entities, sections = [] } = props;
  // const { startIndex, endIndex } = getStartAndEndIndexForPagination(page, text);

  // // console.log('textToNer', textToNer, startIndex, endIndex);
  // const document = useMemo(() => {
  //   if (sections && sections.length > 0) {
  //     return createSectionNodes(text, sections, entities);
  //   }
  //   return createNodes(text, entities);
  //   // const getSections = getSectionNodesFactory(text, sections, contentNodes);
  //   // return {
  //   //   contentNodes,
  //   //   getSections
  //   // }
  // }, [text, sections, entities]);

  // return document;

  let { text, page, entities, sections = [] } = props;
  const { startIndex, endIndex } = getStartAndEndIndexForPagination(page, text);

  let document;
  entities = entities.filter(
    (entity) => entity.start >= startIndex && entity.end <= endIndex
  );
  sections = sections.filter(
    (section) => section.start >= startIndex && section.end <= endIndex
  );
  if (sections && sections.length > 0) {
    document = createSectionNodes(text, sections, entities);
  } else {
    document = createNodes(text, entities);
  }

  return document;
};

export default useNER;
