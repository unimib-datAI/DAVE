import { useParam } from '@/hooks';
import { useQuery } from '@/utils/trpc';
import {
  createContext,
  PropsWithChildren,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Provider, createStore } from 'jotai';
import { documentStateAtom } from './DocumentContext';
import { Document } from '@/server/routers/document';
import { documentReducer } from './reducer';
import { State } from './types';
import { baseTaxonomy, initialUIState } from './state';
import { SkeletonLayout } from '../SkeletonLayout';
import { orderAnnotations } from '@/lib/ner/core';
import { applyTypeColors, createTaxonomy } from './utils';
import { mapEntityType } from '../../../components/Tree/utils';
import { DocumentContext } from './DocumentContext';
import {
  globalAnonymizationAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { activeCollectionAtom } from '@/atoms/collection';
import { useSession } from 'next-auth/react';
/**
 * Fetches a document and provides it to the context consumer globally for the page.
 *
 * This provider now reads the global anonymization atom and exposes `deAnonimize`
 * and `setDeAnonimize` through the context as before, but mapped to the global atom
 * (deAnonimize = !globalAnonymizationAtom).
 */
const DocumentProvider = ({ children }: PropsWithChildren<{}>) => {
  const [id] = useParam<string>('id');
  // Disambiguates between duplicate documents sharing the same content-hash
  // id across different collections (see documentController.ts findOne()) -
  // passed as a `?collectionId=` query param by whatever linked here
  // (search results, collection document lists). Falls back to undefined
  // (ambiguous lookup) for links that don't carry it, e.g. bookmarks.
  const [urlCollectionId] = useParam<string>('collectionId');
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

  const { data, isFetching, error } = useQuery(
    ['document.getDocument', { id: id, deAnonimize, collectionId: urlCollectionId }],
    {
      // Never refetch behind the editor's back (focus/reconnect would reset
      // unsaved edits), but always fetch fresh when the document is opened:
      // the cached copy may predate a save made earlier in this session or
      // from another tab.
      staleTime: Infinity,
      refetchOnMount: 'always',
    }
  );

  // The toolbar's collection selector (activeCollectionAtom) is a
  // globally-persisted, manually-set choice - it does NOT automatically
  // track whichever document is currently open. That mismatch previously
  // caused saves to write facet-cache updates under the wrong collection
  // (see ToolbarContent.tsx). Auto-sync it here: whenever a document loads,
  // switch the active collection to the document's own collectionId so the
  // two can never disagree while a document is open.
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const [activeCollection, setActiveCollection] = useAtom(activeCollectionAtom);
  // Resolved from the list of collections the user can access (same query
  // key as AuthWatcher in _app.tsx, so it is served from cache) rather than
  // `collection.getById`, which rejects with FORBIDDEN when the document
  // belongs to a collection the user is not a member of. In that case the
  // collection is simply absent from the list and no sync happens.
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const { data: collections } = useQuery(['collection.getAll', { token }], {
    enabled: authDisabled || !!token,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const docCollectionId = (data as any)?.collectionId;
  const docCollection = docCollectionId
    ? (collections as any[] | undefined)?.find(
        (c) => c.id === docCollectionId
      )
    : undefined;
  const typeColors = (docCollection as any)?.config?.typeColors as
    | Record<string, string>
    | undefined;
  useEffect(() => {
    if (docCollection && docCollection.id !== activeCollection?.id) {
      setActiveCollection(docCollection as any);
    }
  }, [docCollection, activeCollection?.id, setActiveCollection]);

  // Keep isLoadingAnonymizationAtom in sync with the actual fetch state so the
  // toolbar toggle spinner reflects real loading (not a separate effect-driven state).
  useEffect(() => {
    setIsLoadingAnonymization(isFetching);
  }, [isFetching, setIsLoadingAnonymization]);

  // When the user triggers `updateData` (e.g. after cluster edits) we store an
  // override locally. We use the synchronous derived-state pattern to clear that
  // override the moment the underlying query data changes (toggle anonymization,
  // navigation, etc.) so the fresh query result is always shown immediately.
  const [overrideData, setOverrideData] = useState<any>(null);
  const prevQueryDataRef = useRef(data);
  if (prevQueryDataRef.current !== data) {
    prevQueryDataRef.current = data;
    // Synchronously clear the override so this render uses the new query data
    if (overrideData !== null) setOverrideData(null);
  }

  const effectiveData = overrideData ?? data;

  const updateData = (newData: any) => {
    setOverrideData(newData);
  };

  if (!isFetching && !effectiveData && error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center">
        <span className="text-lg font-semibold">Document not found</span>
        <span className="text-sm text-gray-500">{error.message}</span>
      </div>
    );
  }

  if (isFetching || !effectiveData) {
    return <SkeletonLayout />;
  }

  return (
    <DocumentContext.Provider
      value={{ data: effectiveData, updateData, deAnonimize, setDeAnonimize }}
    >
      <DocumentStateProvider
        data={effectiveData}
        isAnonymized={isAnonymized}
        setIsAnonymized={setIsAnonymized}
        typeColors={typeColors}
      >
        {children}
      </DocumentStateProvider>
    </DocumentContext.Provider>
  );
};

type DocumentStateProviderProps = {
  data: Document;
  isAnonymized: boolean;
  setIsAnonymized: (val: boolean) => void;
  // per-type colors configured on the document's collection
  typeColors?: Record<string, string>;
};

const DocumentStateProvider = ({
  data,
  isAnonymized,
  setIsAnonymized,
  typeColors,
  children,
}: PropsWithChildren<DocumentStateProviderProps>) => {
  const typeColorsRef = useRef(typeColors);
  typeColorsRef.current = typeColors;

  const store = useMemo(() => {
    const s = createStore();
    s.set(documentStateAtom, initializeState(data, typeColors));
    // Seed the isolated store so the toggle renders with the correct initial state
    s.set(globalAnonymizationAtom, isAnonymized);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-initialize when data changes (e.g. after refetch)
  useEffect(() => {
    store.set(
      documentStateAtom,
      initializeState(data, typeColorsRef.current)
    );
  }, [data, store]);

  // The collection (and so its colors) can arrive after the document, or be
  // edited elsewhere: restyle the taxonomy without touching the document
  // state. Keyed by content so that a refetch with equal colors is a no-op.
  const typeColorsKey = JSON.stringify(typeColors ?? {});
  useEffect(() => {
    store.set(documentStateAtom, (prev) =>
      prev
        ? documentReducer(prev, {
            type: 'setTypeColors',
            payload: { typeColors: typeColorsRef.current },
          })
        : prev
    );
  }, [typeColorsKey, store]);

  // Sync default-store value → isolated store (e.g. toggle pressed elsewhere)
  useEffect(() => {
    if (store.get(globalAnonymizationAtom) !== isAnonymized) {
      store.set(globalAnonymizationAtom, isAnonymized);
    }
  }, [isAnonymized, store]);

  // Sync isolated store → default store (toggle pressed inside document view)
  useEffect(() => {
    const unsub = store.sub(globalAnonymizationAtom, () => {
      const val = store.get(globalAnonymizationAtom);
      setIsAnonymized(val);
    });
    return unsub;
  }, [store, setIsAnonymized]);

  return <Provider store={store}>{children}</Provider>;
};

/**
 * Lazy initializer for the reducer
 */
const initializeState = (
  data: Document,
  typeColors?: Record<string, string>
): State => {
  const entityAnnotationSets = Object.values(data.annotation_sets).filter(
    (annSet) => annSet.name.startsWith('entities_')
  );

  // Fall back to any available annotation set when none is prefixed
  // `entities_` (e.g. a document whose sets were named/indexed differently),
  // so `activeAnnotationSet` still resolves to a real key instead of being
  // left as `''`, which downstream selectors can't look up.
  const firstEntityAnnSet =
    entityAnnotationSets[0] ?? Object.values(data.annotation_sets)[0];
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
  const taxonomy = applyTypeColors(
    createTaxonomy(baseTaxonomy, entityAnnotationSets),
    typeColors
  );
  // order the annotations once for each annotation set
  Object.values(data.annotation_sets).forEach((annSet) => {
    annSet.annotations = orderAnnotations(annSet.annotations);
  });

  // Normalize cluster types to use taxonomy mapping (e.g., Person -> persona)
  if (data.features?.clusters) {
    Object.keys(data.features.clusters).forEach((annotationSetName) => {
      if (data.features.clusters[annotationSetName]) {

        data.features.clusters[annotationSetName] = data.features.clusters[
          annotationSetName
        ].map((cluster) => {
          const originalType = cluster.type;
          const mappedType = mapEntityType(cluster.type);

          if (originalType !== mappedType) {
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
    dirty: false,
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
