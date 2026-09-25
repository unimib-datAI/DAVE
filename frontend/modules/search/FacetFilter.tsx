import { useForm } from '@/hooks';
import { Facet } from '@/server/routers/search';
import { Checkbox } from '@heroui/react';

import { Option } from 'lucide-react';
import { Link, Link2, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useAtom } from 'jotai';
import { facetsDocumentsAtom } from '@/utils/atoms';
import { activeCollectionAtom } from '@/atoms/collection';
import { useMutation, useQuery } from '@/utils/trpc';
import { useText } from '@/components/TranslationProvider';
import { useDeanonymizedFacetNames } from './useDeanonymizedFacetNames';

// facetsCacheSearch rows carry no `key` - derive it like the facetsCache
// query does, so every child has a stable identity for React keys,
// de-duplication and selection.
const normalizeChild = (child: any) => {
  const ids_ER = Array.isArray(child.ids_ER)
    ? child.ids_ER
    : child.ids_ER
    ? [child.ids_ER]
    : [];
  const doc_ids = Array.isArray(child.doc_ids)
    ? child.doc_ids
    : child.doc_ids
    ? [child.doc_ids]
    : [];
  return {
    ...child,
    ids_ER,
    doc_ids,
    key: child.key || ids_ER[0] || child.display_name || '',
  };
};
const childIdentity = (child: any) => `${child.key}\u0000${child.display_name}`;

// Items shown per facet before "show more" (the backend pages by 20 too).
const MAX_VISIBLE_CHILDREN = 20;

type FacetFilterProps = {
  facet: Facet;
  filterType: string;
  highlight?: boolean;
  // `names` maps the ids being added to their raw display name.
  onFilterChange: (
    filterType: string,
    updatedFilters: string[],
    names?: Record<string, string>
  ) => void;
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

  // Accumulate raw "show more" pages. Grouping/decryption happens below
  // over everything loaded, so paged items are merged and de-anonymized
  // like the first page instead of being appended as-is.
  useEffect(() => {
    if (page === 1) {
      setAccumulatedChildren([]);
      return;
    }
    const pageChildren = (paginatedData?.facets || []).map(normalizeChild);
    if (pageChildren.length === 0) return;
    setAccumulatedChildren((prev: any[]) => {
      const seen = new Set(prev.map(childIdentity));
      const next = [...prev];
      pageChildren.forEach((child: any) => {
        const id = childIdentity(child);
        if (!seen.has(id)) {
          seen.add(id);
          next.push(child);
        }
      });
      return next;
    });
  }, [paginatedData, page]);

  // Everything loaded for this facet: the initial page, "show more" pages
  // and (while typing in the search box) the backend search results.
  const searchQuery = value.filter.trim();
  const loadedChildren = useMemo(() => {
    const pool = [
      ...facet.children.map(normalizeChild),
      ...accumulatedChildren,
      ...(searchQuery ? (searchData?.facets || []).map(normalizeChild) : []),
    ];
    const seen = new Set<string>();
    return pool.filter((child) => {
      const id = childIdentity(child);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [facet.children, accumulatedChildren, searchData, searchQuery]);

  const resolveName = useDeanonymizedFacetNames(
    useMemo(() => loadedChildren.map((child) => child.display_name), [loadedChildren])
  );

  // Group children by their resolved name (the real name when
  // de-anonymizing: the same person is stored under a different vault token
  // per mention) and merge their ids_ER / doc_ids. `rawNames` keeps each
  // id's stored display name so selected filters can be labelled later
  // without freezing the de-anonymized text into them.
  const groupedArray = useMemo(() => {
    const groups: Record<string, any> = {};
    loadedChildren.forEach((child) => {
      const displayName = resolveName(child.display_name) || child.key;
      const groupKey = (displayName || '').toLowerCase();
      const rawNames: Record<string, string> = {};
      [child.key, ...child.ids_ER].forEach((id: string) => {
        if (id) rawNames[id] = child.display_name || '';
      });
      const existing = groups[groupKey];
      if (!existing) {
        groups[groupKey] = { ...child, display_name: displayName, rawNames };
        return;
      }
      existing.ids_ER = Array.from(new Set([...existing.ids_ER, ...child.ids_ER]));
      existing.doc_ids = Array.from(new Set([...existing.doc_ids, ...child.doc_ids]));
      existing.doc_count = (existing.doc_count || 0) + (child.doc_count || 0);
      existing.is_linked = existing.is_linked || child.is_linked;
      existing.rawNames = { ...existing.rawNames, ...rawNames };
    });
    return Object.values(groups);
  }, [loadedChildren, resolveName]);

  const children = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const visible = groupedArray
      .filter((item) => !q || (item.display_name || item.key || '').toLowerCase().includes(q))
      // Filter out anonymous personas
      .filter((item) => item.display_name !== '[ANONYMOUS PERSONA]')
      .sort((a, b) =>
        (a.display_name || a.key || '').localeCompare(b.display_name || b.key || '')
      );
    // First page shows at most MAX_VISIBLE_CHILDREN; "show more" reveals
    // everything loaded so far.
    return page === 1 && !q ? visible.slice(0, MAX_VISIBLE_CHILDREN) : visible;
  }, [groupedArray, searchQuery, page]);

  // Raw (ungrouped) rows loaded - what `n_children` counts.
  const loadedRawCount = facet.children.length + accumulatedChildren.length;

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
    const normalizedKey = (key || '').toLowerCase().trim();
    const normalizedIds = (keys || [])
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
        const originalKey = (keys || []).find(
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
    onFilterChange(filterType, cleanedFilters, checked ? option.rawNames : undefined);
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
                    ? option.display_name || option.key
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
          {loadedRawCount < facet.n_children ? (
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
