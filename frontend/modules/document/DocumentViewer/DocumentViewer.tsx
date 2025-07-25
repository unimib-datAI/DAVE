import VirtualizedNER from '@/components/NER/VirtualizedNER';
import { SelectionNode } from '@/components/NER/TextNode';
import { useHashUrlId } from '@/hooks';
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

const Container = styled.div({
  padding: '0 20px',
});

const DocumentContainer = styled.div({
  height: 'calc(100vh - 100px)', // Fixed height for virtualization
  background: '#fff',
  maxWidth: '900px',
  padding: '24px 36px',
  borderRadius: '6px',
  margin: '0 auto',
  contentVisibility: 'auto',
  overflow: 'hidden', // Let VirtualizedNER handle scrolling
});

const DocumentViewer = () => {
  const dispatch = useDocumentDispatch();
  const viewIndex = useViewIndex();
  const text = useSelector(selectDocumentText);
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const action = useSelector(selectDocumentAction);
  const addSelectionColor = useSelector(selectAddSelectionColor);
  const highlightAnnotationId = useSelector(selectHighlightAnnotationId);
  const sectionsSidebar = useSelector(selectSectionsSidebar);
  const entityAnnotations = useSelector((state) => 
    selectFilteredEntityAnnotations(state, viewIndex)
  );
  const sectionAnnotations = useSelector(selectDocumentSectionAnnotations);
  const hashUrlId = useHashUrlId();

  // Use all annotations - no pagination filtering
  const allAnnotations = useMemo(() => {
    return entityAnnotations || [];
  }, [entityAnnotations]);

  const allSectionAnnotations = useMemo(() => {
    return sectionAnnotations || [];
  }, [sectionAnnotations]);

  // Handle annotation highlight from URL
  useEffect(() => {
    if (hashUrlId) {
      dispatch({
        type: 'highlightAnnotation',
        payload: { annotationId: parseInt(hashUrlId) },
      });
    }
  }, [hashUrlId, dispatch]);

  const handleTagClick = (annotation: EntityAnnotation) => {
    dispatch({
      type: 'highlightAnnotation',
      payload: { annotationId: annotation.id },
    });
    
    // Set the current entity to open the sidebar annotation details
    dispatch({
      type: 'setCurrentEntityId',
      payload: {
        viewIndex,
        annotationId: annotation.id,
      },
    });
  };

  const handleTagDelete = (annotation: EntityAnnotation, event?: MouseEvent) => {
    /* if (event) {
      event.preventDefault();
      event.stopPropagation();
    } */
   console.log('Deleting annotation:', annotation.id);
    dispatch({
      type: 'deleteAnnotation',
      payload: {
        viewIndex,
        id: annotation.id,
      },
    });
  };

  const onTextSelection = (
    selectionNode: SelectionNode,
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (action.value !== 'add') {
      return;
    }

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
        <VirtualizedNER
          taxonomy={taxonomy}
          text={text}
          entityAnnotations={allAnnotations}
          sectionAnnotations={allSectionAnnotations}
          highlightAnnotation={highlightAnnotationId}
          showAnnotationDelete
          isAddMode={action.value === 'add'}
          addSelectionColor={addSelectionColor}
          onTagClick={handleTagClick}
          onTextSelection={onTextSelection}
          onTagDelete={handleTagDelete}
        />
      </DocumentContainer>
    </Container>
  );
};

export default DocumentViewer;
