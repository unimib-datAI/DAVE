import { useForm } from '@/hooks';
import { FacetedQueryOutput } from '@/server/routers/search';
import Fuse from 'fuse.js';
import { SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FacetFilter } from './FacetFilter';
// import { DeAnonymizeFacetsButton } from './DeAnonymizeFacetsButton';
import { useText } from '@/components/TranslationProvider';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { useMutation, useQuery } from '@/utils/trpc';
import { activeCollectionAtom } from '@/atoms/collection';
import { useSession } from 'next-auth/react';

// This component expects `facets` to already be grouped (the cache format).
// We keep a small adapter to convert either the cached grouped array
// or the original `facets` object into the simple UI format used below.
//   persona: 'persona',

//   // Location group
//   location: 'luogo',
//   loc: 'luogo',
//   place: 'luogo',
//   gpe: 'luogo',
//   luogo: 'luogo',

//   // Organization group
//   organization: 'organizzazione',
//   org: 'organizzazione',
//   company: 'organizzazione',
//   institution: 'organizzazione',
//   organizzazione: 'organizzazione',

//   // Date/Time group
//   date: 'data',
//   time: 'data',
//   temporal: 'data',
//   data: 'data',

//   // Money/Currency group
//   money: 'money',
//   monetary: 'money',
//   currency: 'money',
//   financial: 'money',
//   denaro: 'money',

//   // Law/Legal group
//   law: 'norma',
//   legal: 'norma',
//   statute: 'norma',
//   regulation: 'norma',
//   norma: 'norma',

//   // Facility types
//   fac: 'facility',
//   facility: 'facility',
//   building: 'facility',
//   structure: 'facility',

//   // Nationality/Religion/Political types
//   norp: 'norp',
//   nationality: 'norp',
//   religion: 'norp',
//   political: 'norp',

//   // Numeric types
//   cardinal: 'numeric',
//   ordinal: 'numeric',
//   quantity: 'numeric',
//   percent: 'numeric',
//   number: 'numeric',

//   // Creative work types
//   work_of_art: 'creative_work',
//   artwork: 'creative_work',
//   creative: 'creative_work',

//   // Event types
//   event: 'event',

//   // Product types
//   product: 'product',

//   // Language types
//   language: 'language',
// };
const entityTypeGroupMap: Record<string, string> = {};
// Function to get normalized entity type group
const getNormalizedEntityGroup = (key: string): string => {
  const lowerKey = key.toLowerCase();
  return entityTypeGroupMap[lowerKey] || key;
};

type FacetsProps = {
  facets: FacetedQueryOutput['facets'];
  selectedFilters: string[];
  setSelectedFilters: (filters: string[]) => void;
  // list of currently loaded backend hit ids (mongo_id/_id/id) to avoid re-fetching
  loadedDocIds?: string[];
};

const facetsAnnotationsOrder = [
  // Italian entity types (primary)
  'persona',
  'luogo',
  'organizzazione',
  'data',
  'denaro',
  'money',
  'norma',
  'id',
  'parte',
  'controparte',
  'altro',

  // English entity types - lowercase
  'person',
  'people',
  'individual',
  'location',
  'place',
  'gpe',
  'organization',
  'org',
  'company',
  'institution',
  'date',
  'time',
  'temporal',
  'currency',
  'financial',
  'law',
  'legal',
  'statute',
  'regulation',
  'identifier',
  'number',
  'code',
  'misc',
  'miscellaneous',
  'other',
  'unknown',

  // English entity types - capitalized
  'Person',
  'People',
  'Individual',
  'Location',
  'Place',
  'Gpe',
  'Organization',
  'Org',
  'Company',
  'Institution',
  'Date',
  'Time',
  'Temporal',
  'Money',
  'Currency',
  'Financial',
  'Denaro',
  'Law',
  'Legal',
  'Statute',
  'Regulation',
  'Id',
  'Identifier',
  'Number',
  'Code',
  'Misc',
  'Miscellaneous',
  'Other',
  'Unknown',

  // English entity types - uppercase
  'PER',
  'PERSON',
  'LOC',
  'LOCATION',
  'GPE',
  'ORG',
  'ORGANIZATION',
  'DATE',
  'TIME',
  'MONEY',
  'MONETARY',
  'LAW',
  'ID',
  'MISC',
  'MISCELLANEOUS',
  'OTHER',
  'UNK',
  'UNKNOWN',
];
const facetsMetadataOrder = ['anno sentenza', 'anno ruolo'];

// Convert incoming facets (either cache array or live facets object)
// into a simple list of groups the UI can render.
const toGroupedFacets = (facetsInput: any) => {
  if (!facetsInput) return [] as any[];

  // Paginated/cache endpoints (e.g. collection.facetsCachePaginated) return
  // `{ facets: [...], pagination }`. Unwrap before falling through to the
  // array/annotations handling below, otherwise this - and anything derived
  // from it, like the facet-type map used while searching - silently ends up
  // empty.
  if (!Array.isArray(facetsInput) && Array.isArray(facetsInput.facets)) {
    return toGroupedFacets(facetsInput.facets);
  }

  // If the cache returns an array of grouped facets, use it directly
  if (Array.isArray(facetsInput)) {
    return (facetsInput as any[]).map((group) => ({
      filterType: 'annotation',
      key: group.key || group.name || '',
      n_children: (group.children || []).length,
      children: (group.children || []).map((child: any) => ({
        display_name: child.display_name || child.displayName || '',
        ids_ER: Array.isArray(child.ids_ER)
          ? child.ids_ER
          : child.ids_ER
          ? [child.ids_ER]
          : [],
        doc_ids: Array.isArray(child.doc_ids)
          ? child.doc_ids
          : child.doc_ids
          ? [child.doc_ids]
          : [],
        is_linked: !!child.is_linked,
        key: child.key || child.id || '',
      })),
    }));
  }

  // Fallback: if given the live facets object, map annotations as-is
  if (facetsInput && facetsInput.annotations) {
    return (facetsInput.annotations || []).map((f: any) => ({
      filterType: 'annotation',
      key: f.key,
      n_children: (f.children || []).length,
      children: (f.children || []).map((c: any) => ({
        display_name: c.display_name || c.displayName || '',
        ids_ER: Array.isArray(c.ids_ER) ? c.ids_ER : c.ids_ER ? [c.ids_ER] : [],
        doc_ids: Array.isArray(c.doc_ids)
          ? c.doc_ids
          : c.doc_ids
          ? [c.doc_ids]
          : [],
        is_linked: !!c.is_linked,
        key: c.key || c.id || '',
      })),
    }));
  }

  return [] as any[];
};

const Facets = ({
  facets,
  selectedFilters,
  setSelectedFilters,
  loadedDocIds,
}: FacetsProps) => {
  const t = useText('search');
  const { register, value } = useForm({
    filter: '',
  });

  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames, setDeanonymizedNames] = useAtom(
    deanonymizedFacetNamesAtom
  );
  const [collection] = useAtom(activeCollectionAtom);
  const deanonymizeMutation = useMutation(['document.deanonymizeKeys']);
  const [, setGlobalLoading] = useAtom(isLoadingAnonymizationAtom);
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;

  // Determine if we should load from paginated or search endpoint
  const shouldSearch = value.filter.trim() !== '';

  // Get initial grouped facets to determine which groups exist
  const initialGroupedFacets = useMemo(() => toGroupedFacets(facets), [facets]);

  // Map of facet groups for quick lookups
  const facetGroupsMap = useMemo(
    () => new Map(initialGroupedFacets.map((g: any) => [g.key, g])),
    [initialGroupedFacets]
  );

  // Load initial paginated facets when filter is empty
  const paginatedQuery = useQuery(
    [
      'collection.facetsCachePaginated',
      {
        id: collection?.id || '',
        page: 1,
        limit: 20,
        token,
      },
    ],
    {
      enabled: !shouldSearch && !!collection?.id,
      staleTime: Infinity, // Cache indefinitely
    }
  );

  // Combine results from either paginated or search queries
  const allFacets = useMemo(() => {
    if (!shouldSearch) {
      // Use paginated results when not searching
      const paginatedData = paginatedQuery.data;
      if (!paginatedData) {
        return initialGroupedFacets;
      }
      // Paginated endpoint returns { facets: [...], pagination: {...} }
      const facetsArray = paginatedData?.facets || paginatedData;
      return toGroupedFacets(facetsArray);
    }

    // "Find filter" searches for a facet TYPE/category by name (e.g. typing
    // "date" surfaces the DATE category with all its values) - it does not
    // search inside individual entity values. Searching within one already
    // visible category's values is handled by that category's own search
    // box in FacetFilter.
    const normalizedQuery = value.filter.trim().toLowerCase();
    return initialGroupedFacets.filter((group: any) =>
      (group.key || '').toLowerCase().includes(normalizedQuery)
    );
  }, [shouldSearch, paginatedQuery.data, initialGroupedFacets, value.filter]);

  // Log paginated facets query
  useEffect(() => {
    if (paginatedQuery.isFetching) {
      console.log('[Facets] Loading paginated query - page 1, limit 20');
    }
    if (paginatedQuery.isSuccess && paginatedQuery.data) {
      console.log('[Facets] Paginated query success:', paginatedQuery.data.pagination);
    }
  }, [paginatedQuery.isFetching, paginatedQuery.isSuccess]);


  // Fetch de-anonymized names when global toggle is activated
  useEffect(() => {
    const fetchDeAnonymizedNames = async () => {
      setGlobalLoading(true);
      setDeanonymizedNames({});
      if (!deanonymize) {
        setGlobalLoading(false);
        return;
      }

      try {
        const displayNames = new Set<string>();
        // allFacets is an array of groups with children
        allFacets.forEach((group: any) => {
          (group.children || []).forEach((child: any) => {
            if (child.display_name && child.display_name.trim() !== '') {
              displayNames.add(child.display_name);
            }
          });
        });

        const keysArray = Array.from(displayNames).filter((displayName) =>
          displayName.startsWith('vault:v1')
        );

        if (keysArray.length > 0) {
          const result = await deanonymizeMutation.mutateAsync({
            keys: keysArray,
          });
          setDeanonymizedNames(result);
        }
      } catch (error) {
        console.error('Failed to de-anonymize facet names:', error);
      } finally {
        setGlobalLoading(false);
      }
    };

    // Only fetch if there are vault keys in the facets
    const hasVaultKeys = allFacets.some((group: any) =>
      (group.children || []).some((child: any) =>
        child.display_name && child.display_name.startsWith('vault:v1')
      )
    );
    
    if (hasVaultKeys) {
      fetchDeAnonymizedNames();
    } else {
      setGlobalLoading(false);
    }
    // Only run when deanonymize toggle changes, not when allFacets changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deanonymize]);

  const filteredFacets = useMemo(() => {
    // When using backend search/pagination, results are already filtered
    return allFacets;
  }, [allFacets]);

  // Apply collection typesOrder when no text filter is active
  const orderedFacets = useMemo(() => {
    const typesOrder = (collection?.config as any)?.typesOrder as
      | string[]
      | undefined;
    if (!typesOrder || typesOrder.length === 0 || value.filter.trim() !== '') {
      return filteredFacets;
    }
    const orderMap = new Map(typesOrder.map((t, i) => [t.toLowerCase(), i]));
    return [...filteredFacets].sort((a, b) => {
      const ai = orderMap.get((a.key || '').toLowerCase()) ?? Infinity;
      const bi = orderMap.get((b.key || '').toLowerCase()) ?? Infinity;
      return (ai as number) - (bi as number);
    });
  }, [filteredFacets, collection?.config, value.filter]);

  const isLoading = !shouldSearch && paginatedQuery.isLoading;


  // Only hide the entire panel (including the search box) when there is no
  // base facet data to work with at all - e.g. before anything has loaded,
  // or the collection genuinely has none. A "Find filter" query that
  // matches nothing must NOT hide the panel: that would remove the search
  // box itself, leaving no way to clear the query and see results again
  // without a full page reload.
  return initialGroupedFacets.length > 0 ? (
    // No more `sticky`/calculated height: this panel is a direct child of
    // search/index.tsx's #search-main, which is itself a fixed-height,
    // non-scrolling flex row (flex-1 overflow-hidden) - so `h-full` here
    // already gives this panel exactly the right bounded height to scroll
    // independently within, with no reliance on window-scroll offsets.
    <div className="w-72 h-full">
      <div className="overflow-y-auto h-full overscroll-contain">
        <div className="flex flex-col pr-6 py-6 gap-8">
          <div className="flex flex-col gap-3">
            <div className="text-lg font-semibold">{t('filter')}</div>
            {/* <DeAnonymizeFacetsButton
              facets={{
                annotations: allFacets
                  .filter((f) => f.filterType === 'annotation')
                  .map(({ filterType, ...rest }) => rest),
                metadata: allFacets
                  .filter((f) => f.filterType === 'metadata')
                  .map(({ filterType, ...rest }) => rest),
              }}
            /> */}
            <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-3 w-full gap-2">
              <SearchIcon size={22} />
              <input
                className="text-slate-800 resize-none bg-transparent w-full h-full border-none text-base"
                spellCheck="false"
                placeholder={t('findFilter')}
                {...register('filter')}
              />
            </div>
          </div>

          {orderedFacets.length === 0 && (
            <div className="text-sm text-slate-500">{t('noMatchingFilters')}</div>
          )}

          {orderedFacets.map(({ filterType, ...facet }: any) => {
            if (
              !collection?.config ||
              !collection?.config.typesToHide ||
              collection.config.typesToHide.length === 0
            ) {
              return (
                <FacetFilter
                  key={`${facet.key}-${filterType}`}
                  facet={facet as any}
                  filterType={filterType}
                  highlight={
                    value.filter.trim() !== '' &&
                    ((facet.key &&
                      facet.key
                        .toLowerCase()
                        .includes(value.filter.toLowerCase())) ||
                      facet.children.some((child: any) =>
                        child.ids_ER.some(
                          (id: string) =>
                            id &&
                            id.trim() !== '' &&
                            id
                              .toLowerCase()
                              .includes(value.filter.toLowerCase())
                        )
                      ))
                  }
                  selectedFilters={selectedFilters}
                  onFilterChange={(filterType, updatedFilters) => {
                    // Filter out empty or whitespace-only strings before setting
                    const cleanedFilters = updatedFilters.filter(
                      (filter) => filter && filter.trim() !== ''
                    );
                    // Remove duplicates while preserving order
                    const uniqueFilters = Array.from(new Set(cleanedFilters));
                    setSelectedFilters(uniqueFilters);
                  }}
                  loadedDocIds={loadedDocIds}
                />
              );
            } else {
              if (!collection.config.typesToHide.includes(facet.key)) {
                return (
                  <FacetFilter
                    key={`${facet.key}-${filterType}`}
                    facet={facet as any}
                    filterType={filterType}
                    highlight={
                      value.filter.trim() !== '' &&
                      ((facet.key &&
                        facet.key
                          .toLowerCase()
                          .includes(value.filter.toLowerCase())) ||
                        facet.children.some((child: any) =>
                          child.ids_ER.some(
                            (id: string) =>
                              id &&
                              id.trim() !== '' &&
                              id
                                .toLowerCase()
                                .includes(value.filter.toLowerCase())
                          )
                        ))
                    }
                    selectedFilters={selectedFilters}
                    onFilterChange={(filterType, updatedFilters) => {
                      // Filter out empty or whitespace-only strings before setting
                      const cleanedFilters = updatedFilters.filter(
                        (filter) => filter && filter.trim() !== ''
                      );
                      // Remove duplicates while preserving order
                      const uniqueFilters = Array.from(new Set(cleanedFilters));
                      setSelectedFilters(uniqueFilters);
                    }}
                    loadedDocIds={loadedDocIds}
                  />
                );
              }
            }
          })}
        </div>
      </div>
    </div>
  ) : null;
};

export { Facets };
