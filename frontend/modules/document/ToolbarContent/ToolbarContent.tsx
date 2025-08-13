import styled from '@emotion/styled';
import {
  selectDocumentData,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';
import { HiArrowLeft } from '@react-icons/all-files/hi/HiArrowLeft';
import { Text } from '@nextui-org/react';
import { IconButton, Button, useText } from '@/components';
import Link from 'next/link';
import { useMutation } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { MouseEvent, useEffect, useRef, useState, useMemo } from 'react';
import SaveStatusIndicator from './SaveStatusIndicator';
import { useAtom } from 'jotai';
import { annotationsAtom } from '@/atoms/annotations';

const Container = styled.div({
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '20px',
  paddingRight: '15px',
  minWidth: 0,
});

const ToolbarContent = () => {
  const t = useText('document');
  const document = useSelector(selectDocumentData);
  const save = useMutation(['document.save']);
  const addAnnotationsMutation = useMutation(['search.addAnnotations']);
  const dispatch = useDocumentDispatch();
  const router = useRouter();
  const [annotations, setAnnotations] = useAtom(annotationsAtom);
  const [hasUnsavedAnnotations, setHasUnsavedAnnotations] = useState(false);
  const documentId = router.query.id as string;
  const indexName = process.env.NEXT_PUBLIC_ELASTIC_INDEX || 'documents';
  // Keep track of annotation version to detect changes
  const annotationVersion = useRef(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track save status separately from the mutation loading state
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  // Track the last successful save time
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  // Ref to track the last save timestamp
  const lastSaveTimeRef = useRef<number>(0);
  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Store a snapshot of the last saved annotation sets
  const [lastSavedAnnotationSets, setLastSavedAnnotationSets] =
    useState<string>('');
  // Track when the component first mounts
  const isInitialMount = useRef(true);
  // Track if we need to show the save button as saved
  const savedStatus = useRef(false);

  // Listen for annotation events

  useEffect(() => {
    if (!documentId) return;

    const handleAnnotationAdd = (event: CustomEvent) => {
      if (!event.detail) return;

      // Reset saved status when adding a new annotation
      savedStatus.current = false;

      // Force status to idle to show unsaved changes immediately
      if (saveStatus === 'saved') {
        setSaveStatus('idle');
      }

      // Explicitly set the unsaved flags to true when adding annotations
      setHasUnsavedAnnotations(true);
      setHasUnsavedChanges(true);

      // Create a new annotation with to_delete flag set to false
      let newAnnotation = { ...event.detail, to_delete: false };

      // Get the next available ID for this annotation
      // Find the maximum ID in the existing annotations and increment it
      const docAnnotations = annotations[documentId] || [];
      let nextId = 1; // Default starting ID if nothing else is found

      // Find the maximum next_annid from document's annotation sets
      if (document.annotation_sets) {
        const annotationSets = Object.values(document.annotation_sets);
        if (annotationSets.length > 0) {
          const maxNextId = Math.max(
            ...annotationSets.map((set) => set.next_annid || 0)
          );
          if (maxNextId > 0) {
            nextId = maxNextId;
          }
        }
      }

      // Also check existing annotations in local state
      if (docAnnotations.length > 0) {
        const maxLocalId = Math.max(
          ...docAnnotations.map((ann) =>
            typeof ann.id === 'number'
              ? ann.id
              : parseInt(String(ann.id), 10) || 0
          )
        );
        // Use whichever is larger
        nextId = Math.max(nextId, maxLocalId + 1);
      }

      // Assign the ID
      newAnnotation.id = nextId;

      // Set id_ER to Wikipedia URL format
      if (!newAnnotation.id_ER) {
        newAnnotation.id_ER = `https://en.wikipedia.org/wiki?curid=${nextId}`;
      }

      // Ensure id_ER is always in Wikipedia URL format even if it exists
      if (
        newAnnotation.id_ER &&
        !newAnnotation.id_ER.includes('wikipedia.org')
      ) {
        newAnnotation.id_ER = `https://en.wikipedia.org/wiki?curid=${nextId}`;
      }

      console.log('Tracking annotation:', newAnnotation);
      console.log('Using Wikipedia URL id_ER:', newAnnotation.id_ER);

      setAnnotations((prev) => {
        const docAnnotations = prev[documentId] || [];
        return {
          ...prev,
          [documentId]: [...docAnnotations, newAnnotation],
        };
      });
      setHasUnsavedAnnotations(true);
    };

    const handleAnnotationDelete = (event: CustomEvent) => {
      if (!event.detail) return;

      // Reset saved status when deleting an annotation
      savedStatus.current = false;

      // Force status to idle to show unsaved changes immediately
      if (saveStatus === 'saved') {
        setSaveStatus('idle');
      }

      // Explicitly set the unsaved flags to true when deleting annotations
      setHasUnsavedAnnotations(true);
      setHasUnsavedChanges(true);

      console.log('Tracking annotation deletion:', event.detail);

      setAnnotations((prev) => {
        const docAnnotations = prev[documentId] || [];

        // Mark annotations as deleted instead of removing them
        if (event.detail.id) {
          // Find by ID if available
          return {
            ...prev,
            [documentId]: docAnnotations.map((ann) =>
              ann.id === event.detail.id
                ? {
                    ...ann,
                    to_delete: true,
                    // Always use Wikipedia URL format for id_ER
                    id_ER: `https://en.wikipedia.org/wiki?curid=${ann.id}`,
                  }
                : ann
            ),
          };
        }

        // Fallback to finding by mention text
        return {
          ...prev,
          [documentId]: docAnnotations.map((ann) =>
            ann.mention === event.detail.mention
              ? {
                  ...ann,
                  to_delete: true,
                  // Always use Wikipedia URL format for id_ER
                  id_ER: `https://en.wikipedia.org/wiki?curid=${ann.id}`,
                }
              : ann
          ),
        };
      });

      console.log(
        'Annotation marked for deletion, id_ER preserved:',
        event.detail
      );
      setHasUnsavedAnnotations(true);
    };

    // Add event listeners
    window.addEventListener(
      'annotation:add',
      handleAnnotationAdd as EventListener
    );
    window.addEventListener(
      'annotation:delete',
      handleAnnotationDelete as EventListener
    );

    // Clean up
    return () => {
      window.removeEventListener(
        'annotation:add',
        handleAnnotationAdd as EventListener
      );
      window.removeEventListener(
        'annotation:delete',
        handleAnnotationDelete as EventListener
      );
    };
  }, [documentId, setAnnotations, setHasUnsavedAnnotations]);

  // Check for annotations whenever document ID changes
  useEffect(() => {
    if (documentId) {
      const docAnnotations = annotations[documentId] || [];
      // Only count non-deleted annotations as unsaved
      const activeAnnotations = docAnnotations.filter((ann) => !ann.to_delete);

      // Only update if we're not in the process of saving or just saved
      if (saveStatus !== 'saving' && saveStatus !== 'saved') {
        setHasUnsavedAnnotations(activeAnnotations.length > 0);
        setHasUnsavedChanges(
          (prevState) => activeAnnotations.length > 0 || prevState
        );
      }
    }
  }, [documentId, annotations, saveStatus]);

  const handleSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Prevent duplicate saves in quick succession
    // If we're already in a "saved" state and the last save was recent (within 3 seconds)
    if (saveStatus === 'saved' && Date.now() - lastSaveTimeRef.current < 3000) {
      console.log('Ignoring save request - already in saved state');
      return;
    }

    // Set status to saving
    setSaveStatus('saving');
    lastSaveTimeRef.current = Date.now();

    console.log('Saving document with features:', document.features);
    console.log('Clusters being saved:', document.features?.clusters);

    // Helper function for generating Wikipedia URL format
    const createWikipediaUrl = (id: number) =>
      `https://en.wikipedia.org/wiki?curid=${id}`;

    // First save the document
    save.mutate(
      {
        docId: document.id,
        annotationSets: document.annotation_sets,
        features: document.features,
      },
      {
        onSuccess: (data) => {
          console.log('Server response after save:', data);
          console.log(
            'Current document features before update:',
            document.features
          );

          // Also save any pending annotations silently
          const docAnnotations = annotations[documentId] || [];
          if (documentId && docAnnotations.length > 0) {
            console.log(
              '==================== ANNOTATIONS SAVE ===================='
            );
            console.log('Document ID:', documentId);
            console.log('Index name:', indexName);
            console.log('Number of annotations:', docAnnotations.length);
            console.log(
              'Annotations before deduplication:',
              JSON.stringify(docAnnotations, null, 2)
            );

            // Log the id_ER values for debugging
            console.log(
              'Annotation id_ER values:',
              docAnnotations.map((ann) => ({
                id: ann.id,
                id_ER: ann.id_ER,
                to_delete: ann.to_delete,
              }))
            );

            // Deduplicate annotations based on start/end indices and mention
            const uniqueAnnotations = [];
            const seen = new Set();

            // Log how many annotations are marked for deletion
            const deletedCount = docAnnotations.filter(
              (ann) => ann.to_delete
            ).length;
            console.log(`Annotations marked for deletion: ${deletedCount}`);

            docAnnotations.forEach((ann) => {
              // Create a unique key for each annotation based on start, end, and mention
              const key = `${ann.start}-${ann.end}-${ann.mention}`;

              // Only add if we haven't seen this combination before
              if (!seen.has(key)) {
                seen.add(key);

                // Ensure ID is a numerical value
                if (typeof ann.id !== 'number') {
                  // Try to parse the ID as an integer
                  const parsedId = parseInt(String(ann.id), 10);
                  if (!isNaN(parsedId)) {
                    // If parsing succeeds, use the parsed value
                    ann.id = parsedId;
                  } else {
                    // If parsing fails, find the next available ID
                    let nextId = 1; // Default starting ID

                    // Check document's next_annid values
                    if (document.annotation_sets) {
                      const maxDocId = Math.max(
                        ...Object.values(document.annotation_sets).map(
                          (set) => set.next_annid || 0
                        )
                      );
                      nextId = Math.max(nextId, maxDocId);
                    }

                    // Check already processed annotations in this batch
                    if (uniqueAnnotations.length > 0) {
                      const maxBatchId = Math.max(
                        ...uniqueAnnotations.map((a) =>
                          typeof a.id === 'number' ? a.id : 0
                        )
                      );
                      nextId = Math.max(nextId, maxBatchId + 1);
                    }

                    ann.id = nextId;
                  }
                }

                // Make sure the to_delete flag is set if it wasn't already
                if (ann.to_delete === undefined) {
                  ann.to_delete = false;
                }

                // Ensure the ID is within Elasticsearch integer range (max 2^31-1)
                if (ann.id > 2147483647) {
                  ann.id = ann.id % 2147483647; // Keep it within the safe range
                }

                // Ensure id_ER is in Wikipedia URL format
                if (!ann.id_ER || !ann.id_ER.includes('wikipedia.org')) {
                  ann.id_ER = createWikipediaUrl(ann.id);
                }

                // For deleted annotations, make sure they have a proper id_ER too
                if (
                  ann.to_delete &&
                  (!ann.id_ER || !ann.id_ER.includes('wikipedia.org'))
                ) {
                  ann.id_ER = createWikipediaUrl(ann.id);
                }

                uniqueAnnotations.push(ann);
              } else {
                console.log(
                  `Skipping duplicate annotation: ${key}, id_ER: ${ann.id_ER}`
                );
              }
            });

            console.log(
              'Annotations after deduplication:',
              JSON.stringify(uniqueAnnotations, null, 2)
            );
            console.log(
              'Final annotation id_ER values:',
              uniqueAnnotations.map((ann) => ({
                id: ann.id,
                id_ER: ann.id_ER,
                to_delete: ann.to_delete,
              }))
            );
            console.log(
              '=========================================================='
            );

            addAnnotationsMutation.mutate(
              {
                indexName,
                documentId,
                annotations: uniqueAnnotations,
              },
              {
                onSuccess: (result) => {
                  console.log(
                    '==================== ANNOTATIONS SAVED SUCCESSFULLY ===================='
                  );
                  console.log('Response:', result);
                  console.log('Document ID:', documentId);
                  console.log('Annotations count:', uniqueAnnotations.length);
                  console.log(
                    'Deleted annotations:',
                    uniqueAnnotations.filter((ann) => ann.to_delete).length
                  );
                  console.log(
                    '====================================================================='
                  );

                  // Immediately reset the flags after a successful save
                  setHasUnsavedAnnotations(false);
                  setHasUnsavedChanges(false);

                  // Force reset document version to avoid stale state comparisons
                  annotationVersion.current = Date.now();

                  // After successful save, we can clear annotations marked for deletion
                  if (documentId) {
                    // Update the annotations state
                    setAnnotations((prev) => {
                      const docAnnotations = prev[documentId] || [];
                      // Log deleted annotations for debugging
                      const deletedAnnotations = docAnnotations.filter(
                        (ann) => ann.to_delete
                      );
                      console.log(
                        'Removing deleted annotations:',
                        deletedAnnotations
                      );
                      console.log(
                        'Deleted annotation id_ER values:',
                        deletedAnnotations.map((ann) => ({
                          id: ann.id,
                          id_ER: ann.id_ER,
                        }))
                      );

                      // Remove annotations marked for deletion
                      const updatedAnnotations = {
                        ...prev,
                        [documentId]: docAnnotations.filter(
                          (ann) => !ann.to_delete
                        ),
                      };

                      return updatedAnnotations;
                    });
                  }

                  // Force update status with a small delay to ensure UI is updated
                  // Use a timeout to ensure we see the saved state
                  setTimeout(() => {
                    // Store the timestamp when we set to saved state
                    lastSaveTimeRef.current = Date.now();
                    // Set to saved state and stay there until changes are made
                    setSaveStatus('saved');
                    setHasUnsavedAnnotations(false);
                    setHasUnsavedChanges(false);
                    // Mark that we've saved successfully to keep the saved status
                    savedStatus.current = true;

                    // Clear the state of any remaining annotations marked for deletion
                    if (documentId) {
                      setAnnotations((prev) => {
                        // Only keep annotations that aren't marked for deletion
                        const cleanedAnnotations = {
                          ...prev,
                          [documentId]: (prev[documentId] || []).filter(
                            (ann) => !ann.to_delete
                          ),
                        };
                        return cleanedAnnotations;
                      });
                    }

                    // Force a second update after a short delay
                    setTimeout(() => {
                      setHasUnsavedAnnotations(false);
                      setHasUnsavedChanges(false);
                    }, 500);
                  }, 200);
                },
                onError: (error) => {
                  console.error(
                    '==================== ANNOTATIONS SAVE ERROR ===================='
                  );
                  console.error('Error:', error);
                  console.error('Document ID:', documentId);
                  console.error('Annotations:', uniqueAnnotations);
                  console.error(
                    '=============================================================='
                  );
                },
              }
            );
          }

          dispatch({
            type: 'udpateAnnotationSets',
            payload: {
              annotationSets: data,
            },
          });
          // Force a reset of the annotation version to avoid conflicts
          annotationVersion.current = Date.now();

          // Also save the annotations
          if (annotations.length > 0) {
            saveAnnotations()
              .then((result) => {
                console.log('Annotations save result:', result);
                if (result.success) {
                  console.log('Successfully saved annotations');
                } else {
                  console.error('Failed to save annotations:', result.error);
                }
              })
              .catch((error) => {
                console.error('Error saving annotations:', error);
              });
          }

          // Set status to saved
          setSaveStatus('saved');
          setLastSaveTime(new Date());

          // Force clear unsaved changes immediately to avoid UI confusion
          setHasUnsavedChanges(false);
          setHasUnsavedAnnotations(false);

          // Store the timestamp when we set to saved state
          lastSaveTimeRef.current = Date.now();

          // Keep the saved status until user makes changes
          // Do not automatically reset to idle

          // IMPORTANT: Update the saved annotation sets with the server's response
          // This ensures we're comparing against what was actually saved
          const serializedState = JSON.stringify({
            annotation_sets: Array.isArray(data)
              ? data.reduce((obj, set) => {
                  obj[set.name] = set;
                  return obj;
                }, {})
              : data,
            features: document.features, // Preserve features since server doesn't return them
          });

          setLastSavedAnnotationSets(serializedState);
          console.log(
            'Updated saved annotation reference after successful save'
          );
        },
        onError: (error) => {
          console.error('Failed to save annotations:', error);
          // Set status to error
          setSaveStatus('error');

          // Retry save after 5 seconds on failure
          saveTimeoutRef.current = setTimeout(() => {
            handleSave();
          }, 5000);
        },
      }
    );
  };

  // Check for unsaved changes whenever annotations change
  useEffect(() => {
    // Update version reference when document changes
    annotationVersion.current++;

    // Skip the initial render
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Initialize last saved state on first load
      setLastSavedAnnotationSets(
        JSON.stringify({
          annotation_sets: document.annotation_sets,
          features: document.features,
        })
      );
      return;
    }

    // Deep comparison for detecting unsaved changes
    const hasChanges = (() => {
      // Skip if we're in the middle of saving
      if (saveStatus === 'saving') return hasUnsavedChanges;

      try {
        // Skip if lastSavedAnnotationSets is empty or not initialized
        if (!lastSavedAnnotationSets) {
          return false;
        }

        // Get current state as parsed objects, not strings
        const currentSets = document.annotation_sets;
        const savedData = JSON.parse(lastSavedAnnotationSets);
        const savedSets = savedData.annotation_sets || savedData;

        // Check if clusters have changed
        if (
          document.features?.clusters &&
          (!savedData.features?.clusters ||
            JSON.stringify(document.features.clusters) !==
              JSON.stringify(savedData.features?.clusters))
        ) {
          return true;
        }

        // Compare the number of annotation sets
        const currentSetKeys = Object.keys(currentSets);
        const savedSetKeys = Object.keys(savedSets);

        if (currentSetKeys.length !== savedSetKeys.length) {
          return true;
        }

        // Check each annotation set
        for (const setKey of currentSetKeys) {
          const currentSet = currentSets[setKey];
          const savedSet = savedSets[setKey];

          // If set doesn't exist in saved state or next_annid is different
          if (!savedSet || currentSet.next_annid !== savedSet.next_annid) {
            return true;
          }

          // Compare annotation counts
          if (currentSet.annotations.length !== savedSet.annotations.length) {
            return true;
          }

          // Compare individual annotations by ID
          const currentAnnotationsById = new Map(
            currentSet.annotations.map((ann) => [ann.id, ann])
          );

          for (const savedAnn of savedSet.annotations) {
            const currentAnn = currentAnnotationsById.get(savedAnn.id);
            if (
              !currentAnn ||
              currentAnn.type !== savedAnn.type ||
              currentAnn.start !== savedAnn.start ||
              currentAnn.end !== savedAnn.end
            ) {
              return true;
            }
          }
        }

        return false;
      } catch (e) {
        console.error('Error comparing annotation sets:', e);
        return true; // Default to showing unsaved changes if comparison fails
      }
    })();

    // Force reset all flags when in saving or saved states
    if (saveStatus === 'saving' || saveStatus === 'saved') {
      setHasUnsavedChanges(false);
      setHasUnsavedAnnotations(false);

      // Mark that we've saved successfully to keep the saved status
      if (saveStatus === 'saved') {
        savedStatus.current = true;
      }

      // If we're in saved state, only update the snapshot if enough time has passed
      // This prevents flickering when we've just saved
      if (
        saveStatus === 'saving' ||
        (saveStatus === 'saved' && Date.now() - lastSaveTimeRef.current > 1000)
      ) {
        // Create a snapshot of the current annotations state for comparison
        setLastSavedAnnotationSets(
          JSON.stringify({
            annotation_sets: document.annotation_sets,
            features: document.features,
          })
        );
      }

      return; // Skip further processing
    }

    // Update in any state except during saving
    if (saveStatus !== 'saving') {
      // Consider both document changes and annotation changes
      const hasUnsaved = hasChanges || hasUnsavedAnnotations;
      setHasUnsavedChanges(hasUnsaved);

      // If we have unsaved changes, we're no longer in a clean saved state
      if (hasUnsaved) {
        savedStatus.current = false;

        // If we were previously in saved state, switch to idle to show yellow button
        if (saveStatus === 'saved') {
          setSaveStatus('idle');
        }
      }

      // Double check if we have active annotations that need to be shown as unsaved
      if (
        documentId &&
        annotations[documentId]?.some((ann) => !ann.to_delete)
      ) {
        // If we have annotations that aren't marked for deletion, make sure we're not showing saved
        if (savedStatus.current) {
          savedStatus.current = false;
          if (saveStatus === 'saved') {
            setSaveStatus('idle');
          }
        }
      }
    }

    // Debug logs to help troubleshoot save issues
    if (hasChanges && annotationVersion.current % 5 === 0) {
      console.log('Unsaved changes detected:', {
        currentVersion: annotationVersion.current,
        annotationsCount: Object.values(document.annotation_sets).reduce(
          (total, set) => total + set.annotations.length,
          0
        ),
        saveStatus,
        hasUnsavedChanges,
      });

      // Record which annotation sets have changes
      const changedSets = [];
      try {
        // Skip if lastSavedAnnotationSets is empty or not initialized
        if (!lastSavedAnnotationSets) {
          return;
        }

        const currentSets = document.annotation_sets;
        const savedData = JSON.parse(lastSavedAnnotationSets);
        const savedSets = savedData.annotation_sets || savedData;

        for (const setKey of Object.keys(currentSets)) {
          const currentCount = currentSets[setKey].annotations.length;
          const savedCount = savedSets[setKey]?.annotations?.length || 0;

          if (currentCount !== savedCount) {
            changedSets.push({
              name: setKey,
              currentCount,
              savedCount,
              diff: currentCount - savedCount,
            });
          }
        }

        if (changedSets.length > 0) {
          console.log('Sets with changes:', changedSets);
        }
      } catch (e) {
        console.error('Error analyzing changed sets:', e);
      }
    }

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [document.annotation_sets, lastSavedAnnotationSets]);
  const handleBack = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    // Check if we have a referrer from the same origin
    const referrer = document.referrer;
    const isFromSameOrigin =
      referrer && referrer.startsWith(window.location.origin);

    if (isFromSameOrigin) {
      // Normal navigation - go back
      router.back();
    } else {
      // Opened in new tab - try to close tab first, then redirect as fallback
      window.close();

      // If tab closing is blocked, redirect to documents list
      setTimeout(() => {
        router.push('/documents');
      }, 100);
    }
  };
  // Determine button label based on status and annotations
  const hasAnnotationsToSave =
    documentId &&
    (annotations[documentId]?.some((ann) => !ann.to_delete) || false);

  const saveButtonLabel =
    saveStatus === 'saving'
      ? t('toolbar.saving')
      : (saveStatus === 'saved' || savedStatus.current) &&
        !hasUnsavedChanges &&
        !hasAnnotationsToSave
      ? t('toolbar.saved')
      : hasUnsavedChanges || hasAnnotationsToSave
      ? `${t('toolbar.save')} *`
      : t('toolbar.save');

  return (
    <Container>
      <IconButton onClick={handleBack} as="a">
        <HiArrowLeft />
      </IconButton>
      <Text
        h4
        css={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '500px',
        }}
      >
        {document.name}
      </Text>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 'auto',
          gap: 10,
        }}
      >
        <SaveStatusIndicator
          status={saveStatus}
          lastSaveTime={lastSaveTime}
          onRetry={handleSave}
          hasUnsavedChanges={hasUnsavedChanges}
          documentVersion={annotationVersion.current}
        />
        <Button
          auto
          size="sm"
          loading={saveStatus === 'saving'}
          onClick={handleSave}
          color={
            saveStatus === 'error'
              ? 'error'
              : (saveStatus === 'saved' || savedStatus.current) &&
                !hasUnsavedChanges &&
                !hasUnsavedAnnotations
              ? 'success'
              : saveStatus === 'saving'
              ? 'primary'
              : hasUnsavedChanges || hasUnsavedAnnotations
              ? 'warning'
              : 'primary'
          }
          css={{ marginLeft: '10px', minWidth: '120px' }}
        >
          {saveButtonLabel}
        </Button>
      </div>
    </Container>
  );
};

export default ToolbarContent;
