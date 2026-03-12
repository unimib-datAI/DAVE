import { useParam } from '@/hooks';
import { GetDocumentProps, GetSourceProps } from '@/server/routers/review';
import { useQuery } from '@/utils/trpc';
import { PropsWithChildren, useEffect, useMemo } from 'react';
import { Provider, createStore, useSetAtom } from 'jotai';
import { reviewReducer } from './reducer';
import { reviewStateAtom } from './ReviewContext';
import { State } from './types';

const reviewInitialState: State = {
  id: '',
  docId: '',
  name: '',
  total: 0,
  doneIds: [],
  hasNextPage: false,
  hasPreviousPage: false,
  currentDocument: undefined,
  isLoading: true,
  ui: {
    totalReviewed: 0,
    currentItemCursor: 0,
    lastItemCursor: 0,
  },
};

const ReviewProvider = ({ children }: PropsWithChildren<{}>) => {
  const store = useMemo(() => {
    const s = createStore();
    s.set(reviewStateAtom, reviewInitialState);
    return s;
  }, []);
  const [sourceId, routerReady] = useParam<string>('source');
  const [docId] = useParam<string>('doc');
  const { data: sourceData, isFetching: isFetchingSource } = useQuery(
    ['review.getSource', { sourceId, docId }],
    { enabled: routerReady, staleTime: Infinity, cacheTime: 0 }
  );
  const { data: docData, isFetching: isFetchingDocData } = useQuery(
    ['review.getDocument', { sourceId, docId }],
    { enabled: routerReady, staleTime: Infinity, cacheTime: 0 }
  );
  const isLoading =
    isFetchingDocData || isFetchingSource || !docData || !sourceData;

  return (
    <Provider store={store}>
      <ReviewStateInitializer
        sourceData={sourceData}
        docData={docData}
        isLoading={isLoading}
      >
        {children}
      </ReviewStateInitializer>
    </Provider>
  );
};

type ReviewStateInitializerProps = PropsWithChildren<{
  sourceData: GetSourceProps | undefined;
  docData: GetDocumentProps | undefined;
  isLoading: boolean;
}>;

const ReviewStateInitializer = ({
  sourceData,
  docData,
  isLoading,
  children,
}: ReviewStateInitializerProps) => {
  const setAtom = useSetAtom(reviewStateAtom);

  useEffect(() => {
    setAtom(
      reviewReducer(reviewInitialState, {
        type: 'setState',
        payload: {
          data: initializeState({ sourceData, docData, isLoading: false }),
        },
      })
    );
  }, [sourceData, docData, isLoading, setAtom]);

  return <>{children}</>;
};

const initializeState = ({
  docData,
  sourceData,
  isLoading,
}: Omit<ReviewStateInitializerProps, 'children'>): State => {
  if (!docData || !sourceData) {
    return reviewInitialState;
  }

  const annSet = Object.values(docData.currentDocument.annotation_sets)[0];

  if (!annSet) {
    throw new Error('No annotation set to review');
  }

  const { doneIds } = sourceData;
  const { docId } = docData;
  const docDone = new Set(doneIds).has(docId);

  return {
    ...docData,
    ...sourceData,
    isLoading,
    ui: {
      totalReviewed: docDone ? annSet.annotations.length : 0,
      currentItemCursor: 0,
      lastItemCursor: docDone ? annSet.annotations.length - 1 : 0,
    },
  };
};

export default ReviewProvider;
