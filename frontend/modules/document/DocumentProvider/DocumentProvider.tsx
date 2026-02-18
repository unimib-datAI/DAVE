import { useParam } from '@/hooks';
import { useQuery } from '@/utils/trpc';
import {
  createContext,
  PropsWithChildren,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { useAtom } from 'jotai';
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
import { mapEntityType } from '../../../components/Tree/utils';
import { useDocumentDispatch } from './selectors';
import { DocumentContext } from './DocumentContext';
import {
  globalAnonymizationAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
/**
 * Fetches a document and provides it to the context consumer globally for the page.
 *
 * This provider now reads the global anonymization atom and exposes `deAnonimize`
 * and `setDeAnonimize` through the context as before, but mapped to the global atom
 * (deAnonimize = !globalAnonymizationAtom).
 */
const DocumentProvider = ({ children }: PropsWithChildren<{}>) => {
  const [id] = useParam<string>('id');
  // Map global anonymization atom to the local `deAnonimize` concept:
  // - `globalAnonymizationAtom` = true  -> documents are anonymized
  // - `deAnonimize` = true             -> show real (de-anonymized) document -> inverse of the atom
  const [isAnonymized, setIsAnonymized] = useAtom(globalAnonymizationAtom);
  const [, setIsLoadingAnonymization] = useAtom(isLoadingAnonymizationAtom);
  const deAnonimize = !isAnonymized;
  const setDeAnonimize = (value: boolean) => {
    // value = true -> user requests de-anonymized view -> set global anonymization to false
    setIsAnonymized(!value);
  };

  // Keep previous development behavior: in development default to de-anonymized view

  const { data, isFetching, refetch } = useQuery(
    ['document.getDocument', { id: id, deAnonimize }],
    {
      staleTime: Infinity,
    }
  );

  // Force refetch when deAnonimize changes to ensure reload even for cached keys
  useEffect(() => {
    let active = true;
    const doRefetch = async () => {
      // set loading flag while we refetch the document
      setIsLoadingAnonymization(true);
      try {
        await refetch();
      } finally {
        // only clear loading if component still mounted / effect still relevant
        if (active) {
          setIsLoadingAnonymization(false);
        }
      }
    };
    doRefetch();
    return () => {
      active = false;
    };
  }, [deAnonimize, refetch, setIsLoadingAnonymization]);
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
    <DocumentContext.Provider
      value={{ data: documentData, updateData, deAnonimize, setDeAnonimize }}
    >
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

  // Normalize cluster types to use taxonomy mapping (e.g., Person -> persona)
  if (data.features?.clusters) {
    Object.keys(data.features.clusters).forEach((annotationSetName) => {
      if (data.features.clusters[annotationSetName]) {
        console.log(
          '🔧 Normalizing cluster types for annotation set:',
          annotationSetName
        );

        data.features.clusters[annotationSetName] = data.features.clusters[
          annotationSetName
        ].map((cluster) => {
          const originalType = cluster.type;
          const mappedType = mapEntityType(cluster.type);

          if (originalType !== mappedType) {
            console.log(
              `🔧 Mapped cluster type: "${originalType}" -> "${mappedType}"`
            );
          }

          return {
            ...cluster,
            type: mappedType,
          };
        });
      }
    });
  }

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
