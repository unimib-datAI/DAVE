import NER from '@/components/NER/NER';
import { SelectionNode } from '@/components/NER/TextNode';
import { useHashUrlId } from '@/hooks';
import useNER from '@/lib/ner/core/use-ner';
import { EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import {
  MouseEvent,
  PropsWithChildren,
  useEffect,
  useMemo,
} from 'react';
import {
  selectAddSelectionColor,
  selectDocumentAction,
  selectDocumentSectionAnnotations,
  selectDocumentTaxonomy,
  selectDocumentText,
  selectFilteredEntityAnnotations,
  selectHighlightAnnotationId,
  selectSectionsSidebar,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';
import { useViewIndex } from '../ViewProvider/ViewProvider';
import { documentPageAtom } from '@/utils/atoms';
import { getStartAndEndIndexForPagination } from '@/utils/shared';

const Container = styled.div({
  padding: '0 20px',
});

const DocumentContainer = styled.div`
  min-height: 100vh;
  background: #fff;
  max-width: 900px;
  padding: 24px 36px;
  border-radius: 6px;
  margin: 0 auto;
  content-visibility: auto;
  contain: layout style paint;
`;

const DocumentViewer = ({ page }: PropsWithChildren<{ page: number }>) => {
  const viewIndex = useViewIndex();
  const action = useSelector(selectDocumentAction);
  const text = useSelector(selectDocumentText);
  const sectionAnnotations = useSelector(selectDocumentSectionAnnotations);
  const sections = useSelector(selectSectionsSidebar);
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const filteredAnnotations = useSelector((state) =>
    selectFilteredEntityAnnotations(state, viewIndex)
  );
  const sectionUrlHashId = useHashUrlId();
  const highlightAnnotationId = useSelector(selectHighlightAnnotationId);
  const dispatch = useDocumentDispatch();

  // Get current page range for filtering annotations
  const { startIndex, endIndex } = useMemo(() => {
    return getStartAndEndIndexForPagination(page, text);
  }, [page, text]);

  // Filter annotations to only include those in the current page range
  const pageFilteredAnnotations = useMemo(() => {
    return filteredAnnotations.filter(
      (annotation) => annotation.start < endIndex && annotation.end > startIndex
    );
  }, [filteredAnnotations, startIndex, endIndex]);

  // Filter section annotations for the current page
  const pageFilteredSectionAnnotations = useMemo(() => {
    return sectionAnnotations?.filter(
      (section) => section.start < endIndex && section.end > startIndex
    ) || [];
  }, [sectionAnnotations, startIndex, endIndex]);

  useEffect(() => {
    const element = document.querySelector(`#${sectionUrlHashId}`);
    if (!element) {
      return;
    }
    element.scrollIntoView();
  }, [sectionUrlHashId]);

  const handleTagClick = (event: MouseEvent, annotation: EntityAnnotation) => {
    switch (action.value) {
      case 'select':
        {
          dispatch({
            type: 'setCurrentEntityId',
            payload: {
              viewIndex,
              annotationId: annotation.id,
            },
          });
        }
        break;
      //replicated case for clusters to allow easier navigation when selecting a cluster
      case 'clusters':
        {
          dispatch({
            type: 'setCurrentEntityId',
            payload: {
              viewIndex,
              annotationId: annotation.id,
            },
          });
        }
        break;
      case 'delete':
        {
          dispatch({
            type: 'deleteAnnotation',
            payload: {
              viewIndex,
              id: annotation.id,
            },
          });
        }
        break;
      default: {
        return;
      }
    }
  };

  const handleTagDelete = (event: MouseEvent, annotation: EntityAnnotation) => {
    dispatch({
      type: 'deleteAnnotation',
      payload: {
        viewIndex,
        id: annotation.id,
      },
    });
  };

  const onTextSelection = (event: MouseEvent, selectionNode: SelectionNode) => {
    dispatch({
      type: 'addAnnotation',
      payload: {
        viewIndex,
        type: action.data || '',
        ...selectionNode,
      },
    });
  };

  return (
    <Container>
      <DocumentContainer>
        <NER
          taxonomy={taxonomy}
          text={text}
          entityAnnotations={pageFilteredAnnotations}
          sectionAnnotations={pageFilteredSectionAnnotations}
          highlightAnnotation={highlightAnnotationId}
          showAnnotationDelete
          isAddMode={action.value === 'add'}
          onTagClick={handleTagClick}
          onTextSelection={onTextSelection}
          onTagDelete={handleTagDelete}
          page={page}
        />
      </DocumentContainer>
    </Container>
  );
};

export default DocumentViewer;
