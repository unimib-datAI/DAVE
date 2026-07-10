import styled from '@emotion/styled';
import {
  selectDocumentData,
  selectDocumentDirty,
  useDocumentDispatch,
  useSelector,
  selectCurrentAnnotationSetName,
} from '../DocumentProvider/selectors';
import { HiArrowLeft } from '@react-icons/all-files/hi/HiArrowLeft';
import { IconButton, useText } from '@/components';
import { useMutation, useContext as useTrpcContext } from '@/utils/trpc';
import { useRouter } from 'next/router';
import { MouseEvent, useEffect, useRef, useState } from 'react';
import SaveStatusIndicator from './SaveStatusIndicator';
import { AnnotationType } from '../DocumentProvider/types';
import { EntityAnnotation } from '@/server/routers/document';
import { useSession } from 'next-auth/react';
import { message } from 'antd';
import { useDocumentPermissions } from '@/hooks/use-permissions';
import { Button } from '@heroui/react';

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
  // Single source of truth for "does this document have unsaved changes" -
  // set directly by edit actions in the reducer (see DIRTYING_ACTIONS in
  // reducer.ts) and cleared by dispatching `markSaved` below. Previously
  // this was inferred by diffing a JSON snapshot of the last-saved state
  // against the current state on every render, which was fragile: two
  // independently-serialized copies of "the same" data are one shape
  // difference away from a false positive (which is exactly what happened
  // when the save response's shape changed).
  const dirty = useSelector(selectDocumentDirty);
  const dispatch = useDocumentDispatch();
  const { data: session, status } = useSession();
  // accessToken is not part of the typed Session interface here, cast to any
  const token = (session as any)?.accessToken as string | undefined;
  const save = useMutation(['document.save']);
  const trpcContext = useTrpcContext();
  const router = useRouter();
  const currentAnnotationSetName = useSelector(selectCurrentAnnotationSetName);
  const { canUpdate } = useDocumentPermissions();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'error'>(
    'idle'
  );
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const handleSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    // Prevent duplicate saves in quick succession
    if (!dirty && Date.now() - lastSaveTimeRef.current < 3000) {
      return;
    }

    // Prevent saves when user lacks update permission
    if (!canUpdate) {
      message.warning(t('toolbar.notAllowed') || 'Not Authorized');
      return;
    }

    if (!token || !document.collectionId) {
      message.warning('Not Authorized');
      return;
    }

    setSaveStatus('saving');
    lastSaveTimeRef.current = Date.now();

    // Save the document with annotation sets and features. `collectionId`
    // comes from the document itself (its actual owning collection), not
    // from the globally-persisted "active collection" atom - that atom can
    // be stale/mismatched (e.g. left over from a previously browsed
    // collection) and previously caused facet-cache updates to be written
    // under the wrong collection.
    save.mutate(
      {
        collectionId: document.collectionId,
        token,
        docId: String(document.id),
        annotationSets: document.annotation_sets,
        features: document.features,
      },
      {
        onSuccess: () => {
          setSaveStatus('idle');
          lastSaveTimeRef.current = Date.now();
          setLastSaveTime(new Date());
          dispatch({ type: 'markSaved' });

          // The facets sidebar (pages/search/index.tsx) fetches
          // collection.facetsCache/facetsCachePaginated/facetsCacheSearch
          // with staleTime: Infinity and refetchOnMount: false, so it never
          // notices new/changed facet-cache entries on its own - invalidate
          // them here so a save is reflected without a manual hard refresh.
          try {
            trpcContext.invalidateQueries(['collection.facetsCache']);
            trpcContext.invalidateQueries(['collection.facetsCachePaginated']);
            trpcContext.invalidateQueries(['collection.facetsCacheSearch']);
          } catch (e) {
            console.error('Failed to invalidate facets queries', e);
          }

          // Notify other UI that document has been saved so they can react (e.g. refresh status)
          try {
            window.dispatchEvent(
              new CustomEvent('document:saved', {
                detail: { docId: document.id, timestamp: Date.now() },
              })
            );
          } catch (e) {
            // Ignore errors in non-browser or restricted environments
          }
        },
        onError: (error: any) => {
          console.error('Failed to save document:', error?.message ?? error);
          setSaveStatus('error');

          // Retry save after 5 seconds on failure
          saveTimeoutRef.current = setTimeout(() => {
            handleSave();
          }, 5000);
        },
      }
    );
  };

  // Expose a global save trigger so other UI can request a save.
  // Usage from other parts of the app:
  //   window.dispatchEvent(new CustomEvent('document:save'))
  useEffect(() => {
    const onGlobalSave = (e: Event) => {
      try {
        // Call the same save handler used by the toolbar button
        handleSave();
      } catch (err) {
        console.error('Global save failed', err);
      }
    };

    window.addEventListener('document:save', onGlobalSave);

    return () => {
      window.removeEventListener('document:save', onGlobalSave);
    };
  }, [handleSave]);

  // Cleanup any pending retry timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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
      : saveStatus === 'error'
      ? t('toolbar.saveError')
      : dirty
      ? `${t('toolbar.save')} *`
      : t('toolbar.saved');

  return (
    <Container>
      <IconButton onClick={handleBack} as="a">
        <HiArrowLeft />
      </IconButton>
      <h4
        style={{
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '500px',
          margin: 0,
        }}
      >
        {document.name}
      </h4>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 'auto',
          gap: 10,
        }}
      >
        <SaveStatusIndicator
          status={saveStatus === 'error' ? 'error' : saveStatus === 'saving' ? 'saving' : dirty ? 'idle' : 'saved'}
          lastSaveTime={lastSaveTime}
          onRetry={handleSave}
          hasUnsavedChanges={dirty}
        />
        <Button
          auto
          size="sm"
          loading={saveStatus === 'saving'}
          onClick={handleSave}
          disabled={!canUpdate}
          title={
            !canUpdate
              ? t('toolbar.noUpdatePermission') ||
                'You do not have permission to update this document'
              : undefined
          }
          color={
            saveStatus === 'error'
              ? 'danger'
              : saveStatus === 'saving'
              ? 'primary'
              : dirty
              ? 'warning'
              : 'success'
          }
          css={{
            marginLeft: '10px',
            minWidth: '120px',
            opacity: !canUpdate ? 0.5 : 1,
            cursor: !canUpdate ? 'not-allowed' : 'pointer',
            pointerEvents: !canUpdate ? 'none' : 'auto',
          }}
        >
          {saveButtonLabel}
        </Button>
      </div>
    </Container>
  );
};

export default ToolbarContent;
