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
  const dispatch = useDocumentDispatch();
  const router = useRouter();
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

  const handleSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Set status to saving
    setSaveStatus('saving');
    lastSaveTimeRef.current = Date.now();

    console.log('Saving document with features:', document.features);
    console.log('Clusters being saved:', document.features?.clusters);

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

          dispatch({
            type: 'udpateAnnotationSets',
            payload: {
              annotationSets: data,
            },
          });
          // Force a reset of the annotation version to avoid conflicts
          annotationVersion.current = Date.now();

          // Set status to saved
          setSaveStatus('saved');
          setLastSaveTime(new Date());

          // Force clear unsaved changes immediately to avoid UI confusion
          setHasUnsavedChanges(false);

          // Reset to idle after 3 seconds
          setTimeout(() => {
            setSaveStatus('idle');
          }, 3000);

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

    // Only update if the status is not already saving - prevents flickering during save operations
    if (saveStatus !== 'saving') {
      setHasUnsavedChanges(hasChanges);
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
            : hasUnsavedChanges
            ? 'warning'
            : saveStatus === 'saved'
            ? 'success'
            : 'primary'
        }
        css={{ marginLeft: '10px', minWidth: '120px' }}
      >
        {saveStatus === 'saving'
          ? t('toolbar.saving')
          : hasUnsavedChanges
          ? `${t('toolbar.save')} *`
          : t('toolbar.save')}
      </Button>
    </Container>
  );
};

export default ToolbarContent;
