import styled from '@emotion/styled';
import {
  selectDocumentData,
  useDocumentDispatch,
  useSelector,
  selectCurrentAnnotationSetName,
} from '../DocumentProvider/selectors';
import { HiArrowLeft } from '@react-icons/all-files/hi/HiArrowLeft';
import { Text } from '@nextui-org/react';
import { IconButton, Button, useText } from '@/components';
import { useMutation } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { MouseEvent, useEffect, useRef, useState } from 'react';
import SaveStatusIndicator from './SaveStatusIndicator';
import { AnnotationType } from '../DocumentProvider/types';
import { EntityAnnotation } from '@/server/routers/document';

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
  const router = useRouter();
  const currentAnnotationSetName = useSelector(selectCurrentAnnotationSetName);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('saved');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAnnotationSets, setLastSavedAnnotationSets] =
    useState<string>('');
  const isInitialMount = useRef(true);

  const handleSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Prevent duplicate saves in quick succession
    if (saveStatus === 'saved' && Date.now() - lastSaveTimeRef.current < 3000) {
      return;
    }

    setSaveStatus('saving');
    lastSaveTimeRef.current = Date.now();

    // Save the document with annotation sets and features
    save.mutate(
      {
        docId: String(document.id),
        annotationSets: document.annotation_sets,
        features: document.features,
      },
      {
        onSuccess: (data) => {
          // Set saved state
          setTimeout(() => {
            lastSaveTimeRef.current = Date.now();
            setSaveStatus('saved');
            setHasUnsavedChanges(false);
            setLastSaveTime(new Date());
          }, 200);

          // Update the saved annotation sets reference
          const serializedState = JSON.stringify({
            annotation_sets: Array.isArray(data)
              ? data.reduce((obj, set) => {
                  obj[set.name] = set;
                  return obj;
                }, {} as any)
              : data,
            features: document.features,
          });

          setLastSavedAnnotationSets(serializedState);
        },
        onError: (error) => {
          console.error('Failed to save document:', error);
          setSaveStatus('error');

          // Retry save after 5 seconds on failure
          saveTimeoutRef.current = setTimeout(() => {
            handleSave();
          }, 5000);
        },
      }
    );
  };

  // Check for unsaved changes whenever document state changes
  useEffect(() => {
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
      setSaveStatus('saved');
      return;
    }

    // Skip if we're in the middle of saving
    if (saveStatus === 'saving') return;

    // Deep comparison for detecting unsaved changes
    const hasChanges = (() => {
      try {
        // Skip if lastSavedAnnotationSets is empty or not initialized
        if (!lastSavedAnnotationSets) {
          return false;
        }

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
        return true;
      }
    })();

    // Update unsaved changes state
    if (hasChanges) {
      setHasUnsavedChanges(true);
      if (saveStatus === 'saved') {
        setSaveStatus('idle');
      }
    } else if (!hasChanges && saveStatus === 'idle') {
      setHasUnsavedChanges(false);
    }

    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    document.annotation_sets,
    document.features,
    lastSavedAnnotationSets,
    saveStatus,
  ]);

  const handleBack = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    // Check if we have a referrer from the same origin
    const referrer = window.document.referrer || '';
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

  // Determine button label based on status
  const saveButtonLabel =
    saveStatus === 'saving'
      ? t('toolbar.saving')
      : saveStatus === 'saved' && !hasUnsavedChanges
      ? t('toolbar.saved')
      : hasUnsavedChanges
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
        />
        <Button
          auto
          size="sm"
          loading={saveStatus === 'saving'}
          onClick={handleSave}
          color={
            saveStatus === 'error'
              ? 'error'
              : saveStatus === 'saved' && !hasUnsavedChanges
              ? 'success'
              : saveStatus === 'saving'
              ? 'primary'
              : hasUnsavedChanges
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
