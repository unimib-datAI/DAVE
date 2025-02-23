import { useParam } from '@/hooks';
import { useQuery } from '@/utils/trpc';
import {
  createContext,
  PropsWithChildren,
  useEffect,
  useReducer,
  useState,
} from 'react';
import {
  DocumentStateContext,
  DocumentDispatchContext,
} from './DocumentContext';
import { Document } from '@/server/routers/document';
import { documentReducer } from './reducer';
import { State } from './types';
import { baseTaxonomy, initialUIState } from './state';
import { SkeletonLayout } from '../SkeletonLayout';
import { orderAnnotations } from '@/lib/ner/core';
import { createTaxonomy } from './utils';
import { useDocumentDispatch } from './selectors';
interface DocumentContextType {
  data: any; // Replace `any` with your actual data type
  updateData: (newData: any) => void; // Define the type for newData
}

export const DocumentContext = createContext<DocumentContextType | undefined>(
  undefined
);
/**
 * Fetches a document and provides it to the context consumer globally for the page.
 */
const DocumentProvider = ({ children }: PropsWithChildren<{}>) => {
  const [id] = useParam<string>('id');
  const { data, isFetching } = useQuery(['document.getDocument', { id: id }], {
    staleTime: Infinity,
  });
  // State to hold the document data
  const [documentData, setDocumentData] = useState(data);
  useEffect(() => {
    setDocumentData(data);
  }, [data]);
  // Update data function
  const updateData = (newData: any) => {
    console.log('incoming data', newData);
    setDocumentData(newData);
  };
  if (isFetching || !data) {
    return <SkeletonLayout />;
  }

  return documentData ? (
    <DocumentContext.Provider value={{ data: documentData, updateData }}>
      <DocumentStateProvider data={documentData}>
        {children}
      </DocumentStateProvider>
    </DocumentContext.Provider>
  ) : (
    <></>
  );
};

type DocumentStateProvider = {
  data: Document;
};

const DocumentStateProvider = ({
  data,
  children,
}: PropsWithChildren<DocumentStateProvider>) => {
  const [state, dispatch] = useReducer(documentReducer, null, () =>
    initializeState(data)
  );

  return (
    <DocumentStateContext.Provider value={state}>
      <DocumentDispatchContext.Provider value={dispatch}>
        {children}
      </DocumentDispatchContext.Provider>
    </DocumentStateContext.Provider>
  );
};

/**
 * Lazy initializer for the reducer
 */
const initializeState = (data: Document): State => {
  const entityAnnotationSets = Object.values(data.annotation_sets).filter(
    (annSet) => annSet.name.startsWith('entities_')
  );

  const firstEntityAnnSet = entityAnnotationSets[0];
  let typeFilter = new Set<string>();
  let activeAnnotationSet = '';

  if (firstEntityAnnSet) {
    // set filter for the initial annotation set
    firstEntityAnnSet.annotations.forEach((ann) => {
      typeFilter.add(ann.type);
    });
    activeAnnotationSet = firstEntityAnnSet.name;
  }
  // create taxonomy from the base one and by adding additional sub types of unknown
  const taxonomy = createTaxonomy(baseTaxonomy, entityAnnotationSets);
  // order the annotations once for each annotation set
  Object.values(data.annotation_sets).forEach((annSet) => {
    annSet.annotations = orderAnnotations(annSet.annotations);
  });

  return {
    data,
    ...initialUIState,
    taxonomy,
    ui: {
      ...initialUIState.ui,
      views: [
        {
          typeFilter: Array.from(typeFilter),
          activeAnnotationSet,
          activeSection: undefined,
        },
      ],
    },
  };
};

export default DocumentProvider;
