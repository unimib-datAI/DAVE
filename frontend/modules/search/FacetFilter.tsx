import { useForm } from '@/hooks';
import { Facet } from '@/server/routers/search';
import { Checkbox } from '@heroui/react';

import { Option } from 'lucide-react';
import { Link, Link2, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
  facetsDocumentsAtom,
} from '@/utils/atoms';
import { activeCollectionAtom } from '@/atoms/collection';
import { useMutation, useQuery } from '@/utils/trpc';
import { useText } from '@/components/TranslationProvider';

type FacetFilterProps = {
  facet: Facet;
  filterType: string;
  highlight?: boolean;
  onFilterChange: (filterType: string, updatedFilters: string[]) => void;
  selectedFilters: string[];
  loadedDocIds?: string[];
};

const getFilters = (
  query: Record<string, string | string[] | undefined>,
  type: string,
  key: string
) => {
  const queryKey = `${type}_${key}`;
  const value = query[queryKey];

  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
};

const FacetFilter = ({
  facet,
  filterType,
  highlight,
  onFilterChange,
  selectedFilters,
  loadedDocIds,
}: FacetFilterProps) => {
  const t = useText('search');
  const { data: session } = useSession();
  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames] = useAtom(deanonymizedFacetNamesAtom);
  const [facetedDocuments, setFacetedDocuments] = useAtom(facetsDocumentsAtom);
  const getDocsByIdsMutation = useMutation(['document.fetchFacetDocuments']);
  const [fetching, setFetching] = useState(false);

  const [page, setPage] = useState(1);
  const [accumulatedChildren, setAccumulatedChildren] = useState<any[]>([]);
  const token = (session as any)?.accessToken;
  const [collection] = useAtom(activeCollectionAtom);

  const { register, value } = useForm({
    filter: '',
  });

  // Search query when user types in the search box
  const { data: searchData, isLoading: isSearching } = useQuery(
    [
      'collection.facetsCacheSearch',
      {
        id: collection?.id || '',
        key: facet.key,
        query: value.filter.trim(), // User's search text
        page: 1,
        limit: 20,
        token,
      },
    ],
    {
      enabled: !!collection?.id && value.filter.trim().length > 0,
    }
  );

  // Fetch more items when user clicks "show more" (without search filter)
  const { data: paginatedData, isLoading: isLoadingMore } = useQuery(
    [
      'collection.facetsCacheSearch',
      {
        id: collection?.id || '',
        key: facet.key,
        query: '', // Empty query matches all
        page,
        limit: 20,
        token,
      },
    ],
    {
      enabled: page > 1 && !!collection?.id && value.filter.trim().length === 0,
    }
  );

  // Extract children from search or paginated results
  const paginatedChildren = useMemo(() => {
    // Use search results if user is searching
    if (value.filter.trim().length > 0 && searchData?.facets) {
      console.log(`[FacetFilter] Search results for "${value.filter}":`, searchData.facets.length, 'items');
      return searchData.facets || [];
    }
    
    // Use paginated results for "show more"
    if (paginatedData?.facets) {
      console.log(`[FacetFilter] Page ${page} results for ${facet.key}:`, paginatedData.facets.length, 'items');
      return paginatedData.facets || [];
    }
    
    return [];
  }, [paginatedData, searchData, value.filter, facet.key]);

  // Accumulate children as we fetch more pages
  useEffect(() => {
    if (page === 1) {
      // Reset on first page
      setAccumulatedChildren([]);
    } else if (paginatedChildren && paginatedChildren.length > 0) {
      // Append new children to accumulated list
      // eslint-disable-next-line
      setAccumulatedChildren((prev: any[]) => {
        const newChildren = [...prev];
        // Avoid duplicates based on display_name
        const existing = new Set(newChildren.map((c) => c.display_name));
        paginatedChildren.forEach((child: any) => {
          if (!existing.has(child.display_name)) {
            newChildren.push(child);
            existing.add(child.display_name);
          }
        });
        console.log(`[FacetFilter] Accumulated ${newChildren.length} total items for ${facet.key}`);
        return newChildren;
      });
    }
  }, [paginatedChildren, page, facet.key]);

  const fuseOptions = {
    // Only search by the displayed label (de-anonymized display_name).
    keys: ['display_name'],
  };

  // Show all items loaded from the backend (we load 20 per group)
  // No need for client-side pagination since backend already paginates
  const MAX_VISIBLE_CHILDREN = 20;

  // Group children by their display_name (or de-anonymized name) and combine their ids_ER
  const groupedChildren = facet.children.reduce((acc, child) => {
    // Use de-anonymized name if available, otherwise use display_name or key
    const displayName =
      deanonymize && child.display_name && deanonymizedNames[child.display_name]
        ? deanonymizedNames[child.display_name]
        : child.display_name || child.key;
    const key = displayName?.toLowerCase() || '';

    if (!acc[key]) {
      // store the canonical display_name (de-anonymized when available) so the grouped item shows the correct text
      acc[key] = { ...child, display_name: displayName };
    } else {
      // Combine ids_ER arrays, removing duplicates
      acc[key].ids_ER = Array.from(
        new Set([...(acc[key].ids_ER || []), ...(child.ids_ER || [])])
      );
      acc[key].doc_count = (acc[key].doc_count || 0) + (child.doc_count || 0);
    }
    return acc;
  }, {} as Record<string, (typeof facet.children)[0]>);

  const groupedArray = Object.values(groupedChildren);
  const deduplicatedChildren = (() => {
    const q = value.filter.trim().toLowerCase();
    if (!q) return groupedArray;
    return groupedArray.filter((item) =>
      (item.display_name || item.key || '').toLowerCase().includes(q)
    );
  })();

  // Filter out anonymous personas
  const filteredAnonymous = deduplicatedChildren.filter(
    (child) => child.display_name !== '[ANONYMOUS PERSONA]'
  );

  // Sort the filtered children
  const filteredChildren = filteredAnonymous.sort((a, b) =>
    (a.display_name || a.key || '').localeCompare(b.display_name || b.key || '')
  );

  // Combine initial children with accumulated paginated children
  const allChildren = useMemo(() => {
    if (accumulatedChildren.length === 0) {
      // First page: show initial items from facet.children
      return filteredChildren.slice(0, MAX_VISIBLE_CHILDREN);
    }
    
    // Show initial 20 + all accumulated paginated items
    const initial = filteredChildren.slice(0, MAX_VISIBLE_CHILDREN);
    return [...initial, ...accumulatedChildren];
  }, [filteredChildren, accumulatedChildren]);

  const children = allChildren;

  const handleChecked = (
    checked: boolean,
    key: string,
    keys: string[],
    option: any
  ) => {
    // If checking, and option provides doc_ids, ensure missing docs are fetched
    (async () => {
      if (
        checked &&
        (option as any).doc_ids &&
        (option as any).doc_ids.length > 0
      ) {
        try {
          const docIds = (option as any).doc_ids.map((d: any) => String(d));
          const missingDocIds = docIds.filter(
            (docId: string) => !loadedDocIds?.includes(docId)
          );
          const existingDocs = facetedDocuments || [];
          const existingIds = new Set(
            existingDocs.map((d: any) => String(d.id))
          );
          // include currently loaded backend hit ids so we don't re-fetch docs already in results
          (loadedDocIds || []).forEach((id) => existingIds.add(String(id)));
          const missing = docIds.filter((id: string) => !existingIds.has(id));
          if (missingDocIds.length > 0) {
            // fetch missing via tRPC
            setFetching(true);
            // include session token when available so backend keycloak accepts the request
            const token = (session as any)?.accessToken;
            const result = await getDocsByIdsMutation.mutateAsync({
              ids: missingDocIds,
              token,
            });
            if (result && Array.isArray(result) && result.length > 0) {
              // merge into facetsDocumentsAtom using updater to avoid races/duplicates
              setFacetedDocuments((prev: any[]) => {
                const existingIds = new Set(prev.map((d: any) => String(d.id)));
                const toAdd: any[] = [];
                result.forEach((hit: any) => {
                  const hitId = String(hit.id);
                  if (!existingIds.has(hitId)) {
                    existingIds.add(hitId);
                    toAdd.push(hit);
                  }
                });
                const merged = [...prev, ...toAdd];
                return merged;
              });
            }
          }
        } catch (err) {
          console.error('Failed to fetch missing docs for facet:', err);
        } finally {
          setFetching(false);
        }
      }
    })();
    // Normalize all keys to lowercase and filter out empty strings
    const normalizedKey = key.toLowerCase().trim();
    const normalizedIds = keys
      .filter((k) => k && k.trim() !== '')
      .map((k) => k.toLowerCase().trim());

    // All possible keys for this option (normalized)
    const allOptionKeys = [normalizedKey, ...normalizedIds].filter(
      (k) => k && k.trim() !== ''
    );

    // Normalize current selected filters for comparison
    const normalizedSelectedFilters = selectedFilters.map((f) =>
      f.toLowerCase().trim()
    );

    let updatedFilters: string[];

    if (checked) {
      // Add all option keys (use original case from keys array, or normalized key if not in keys)
      const keysToAdd = allOptionKeys.map((normalizedKey) => {
        // Try to find original case version in the keys array
        const originalKey = keys.find(
          (k) => k.toLowerCase().trim() === normalizedKey
        );
        return originalKey || normalizedKey;
      });

      updatedFilters = Array.from(new Set([...selectedFilters, ...keysToAdd]));
    } else {
      // Remove all related keys (case-insensitive comparison)
      updatedFilters = selectedFilters.filter((selectedFilter) => {
        const normalizedSelectedFilter = selectedFilter.toLowerCase().trim();
        return !allOptionKeys.includes(normalizedSelectedFilter);
      });
    }

    // Filter out any empty strings
    const cleanedFilters = updatedFilters.filter((f) => f && f.trim() !== '');
    onFilterChange(filterType, cleanedFilters);
  };

  return (
    <div
      id={`facet-${facet.key}`}
      className={`flex flex-col z-[1] gap-2 ${
        highlight ? 'border-2 border-blue-500 rounded-md' : ''
      }`}
    >
      <div
        id={`facet-${facet.key}-header`}
        className="flex flex-row items-center gap-2"
      >
        <span
          id={`facet-${facet.key}-title`}
          className="capitalize text-sm font-semibold"
        >
          {facet.key}
        </span>
        <span
          id={`facet-${facet.key}-count`}
          className="text-xs text-slate-400"
        >{`(${facet.n_children})`}</span>
      </div>

      <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-1 w-full gap-2">
        <SearchIcon size={16} />
        <input
          id={`facet-${facet.key}-search-input`}
          className="text-slate-800 resize-none bg-transparent w-full h-full border-none text-sm"
          spellCheck="false"
          placeholder={t('findFacet', { facet: facet.key })}
          {...register('filter')}
        />
      </div>

      <div className="flex flex-col">
        {children.map((option) => {
          return (
            <Checkbox
              id={`facet-${facet.key}-option-${option.key}`}
              key={option.key}
              isSelected={
                (option.key &&
                  selectedFilters.some(
                    (f) =>
                      f.toLowerCase().trim() === option.key.toLowerCase().trim()
                  )) ||
                option.ids_ER.some(
                  (id: string) =>
                    id &&
                    id.trim() !== '' &&
                    selectedFilters.some(
                      (f) => f.toLowerCase().trim() === id.toLowerCase().trim()
                    )
                )
              }
              value={option.display_name}
              onValueChange={(isSelected) => {
                handleChecked(isSelected, option.key, option.ids_ER, option);
              }}
            >
              <div className="flex flex-row items-center gap-1">
                {option.is_linked && (
                  <span className="flex items-center justify-center rounded-md uppercase text-xs bg-blue-100 px-1 font-semibold p-[1px]">
                    <Link className="h-3 w-3 text-black" />
                  </span>
                )}
                <span
                  id={`facet-${facet.key}-option-label-${option.key}`}
                  className="text-base whitespace-nowrap text-ellipsis overflow-hidden w-48"
                >
                  {filterType === 'annotation'
                    ? deanonymize &&
                      option.display_name &&
                      deanonymizedNames[option.display_name]
                      ? deanonymizedNames[option.display_name]
                      : option.display_name || option.key
                    : option.key}
                </span>
              </div>
            </Checkbox>
          );
        })}
      </div>


      {facet.n_children > MAX_VISIBLE_CHILDREN ? (
        <div className="flex flex-row justify-between">
          {page > 1 ? (
            <button
              id={`facet-${facet.key}-show-less`}
              onClick={() => setPage(1)}
              className="text-xs border-none bg-transparent flex justify-start m-0 p-0 font-semibold underline cursor-pointer"
              disabled={isLoadingMore || isSearching}
            >
              {t('showLess')}
            </button>
          ) : null}
          {children.length < facet.n_children ? (
            <button
              id={`facet-${facet.key}-show-more`}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs border-none bg-transparent flex justify-start m-0 p-0 font-semibold underline cursor-pointer disabled:opacity-50"
              disabled={isLoadingMore || isSearching}
            >
              {(isLoadingMore || isSearching) ? 'Loading...' : t('showMore', { count: MAX_VISIBLE_CHILDREN })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export { FacetFilter };
