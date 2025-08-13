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
  useCallback,
  useState,
} from 'react';
import {
  selectAddSelectionColor,
  selectDocumentAction,
  selectDocumentSectionAnnotations,
  selectDocumentTaxonomy,
  selectDocumentText,
  selectFilteredEntityAnnotationsWithSearch,
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

// Use memoization for the component
const DocumentViewer = () => {
  const dispatch = useDocumentDispatch();
  const viewIndex = useViewIndex();
  const text = useSelector(selectDocumentText);
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const action = useSelector(selectDocumentAction);
  const addSelectionColor = useSelector(selectAddSelectionColor);
  const highlightAnnotationId = useSelector(selectHighlightAnnotationId);
  const sectionsSidebar = useSelector(selectSectionsSidebar);

  // Cache the last selection to avoid unnecessary re-renders
  const [lastSelection, setLastSelection] = useState<SelectionNode | null>(
    null
  );

  // Memoize entity annotations to prevent unnecessary recalculations
  const entityAnnotations = useSelector((state) =>
    selectFilteredEntityAnnotationsWithSearch(state, viewIndex)
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

  // Memoize event handlers to prevent unnecessary re-renders
  const handleTagClick = useCallback(
    (event: MouseEvent, annotation: EntityAnnotation) => {
      // Log the full annotation to the console
      console.log('Entity annotation clicked:', annotation);

      // Batch related dispatch actions to improve performance
      requestAnimationFrame(() => {
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
      });
    },
    [dispatch, viewIndex]
  );

  const handleTagDelete = useCallback(
    (event: MouseEvent, annotation: EntityAnnotation) => {
      // Remove console.log to improve performance
      dispatch({
        type: 'deleteAnnotation',
        payload: {
          viewIndex,
          id: annotation.id,
        },
      });
    },
    [dispatch, viewIndex]
  );

  // Optimize text selection handler with debouncing
  const onTextSelection = useCallback(
    (selectionNode: SelectionNode, event: MouseEvent<HTMLDivElement>) => {
      if (action.value !== 'add') {
        return;
      }

      // Clear any highlighted annotation when selecting text for a new annotation
      if (highlightAnnotationId !== -1) {
        dispatch({
          type: 'highlightAnnotation',
          payload: { annotationId: -1 },
        });
      }

      // Prevent duplicate selections (common cause of performance issues)
      if (
        lastSelection &&
        lastSelection.start === selectionNode.start &&
        lastSelection.end === selectionNode.end
      ) {
        return;
      }

      // Update last selection to prevent duplicates
      setLastSelection(selectionNode);

      // Use requestAnimationFrame to avoid blocking the UI
      requestAnimationFrame(() => {
        dispatch({
          type: 'addAnnotation',
          payload: {
            viewIndex,
            type: action.data || '',
            ...selectionNode,
          },
        });
      });
    },
    [action.value, action.data, viewIndex, dispatch, lastSelection]
  );

  // Memoize the VirtualizedNER props to prevent unnecessary re-renders
  const nerProps = useMemo(
    () => ({
      taxonomy,
      text,
      entityAnnotations: allAnnotations,
      sectionAnnotations: allSectionAnnotations,
      highlightAnnotation: highlightAnnotationId,
      showAnnotationDelete: true,
      isAddMode: action.value === 'add',
      addSelectionColor,
      onTagClick: handleTagClick,
      onTextSelection,
      onTagDelete: handleTagDelete,
    }),
    [
      taxonomy,
      text,
      allAnnotations,
      allSectionAnnotations,
      highlightAnnotationId,
      action.value,
      addSelectionColor,
      handleTagClick,
      onTextSelection,
      handleTagDelete,
    ]
  );

  return (
    <Container>
      <DocumentContainer>
        <VirtualizedNER {...nerProps} />
      </DocumentContainer>
    </Container>
  );
};

export default DocumentViewer;
