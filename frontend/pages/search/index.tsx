import { useClickOutside, useForm } from '@/hooks';
import { useInfiniteQuery, useQuery } from '@/utils/trpc';
import { useSession, getSession } from 'next-auth/react';
import { MessageCircle, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Button } from '@/components';
import { ActiveFiltersList } from '@/modules/search/ActiveFilters';
import { Facets } from '@/modules/search/Facets';
import { DocumentHit } from '@/modules/search/DocumentHit';
import { LLMSearch } from '@/modules/search/LLMSearch';
import { Searchbar } from '@/modules/search/Searchbar';
import LoadingOverlay from '@/modules/review/LoadingOverlay';
import Link from 'next/link';
import { LLMButton } from '@/modules/search/LLMButton';
import { useAtom } from 'jotai';
import {
  facetsDocumentsAtom,
  selectedFiltersAtom,
  globalAnonymizationAtom,
} from '@/utils/atoms';
import { deanonymizedFacetNamesAtom } from '@/utils/atoms';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import { activeCollectionAtom } from '@/atoms/collection';
import { GetServerSideProps } from 'next';
import { useText } from '@/components/TranslationProvider';
import FilterChip from '@/components/FilterChip';

const variants = {
  isFetching: { opacity: 0.5 },
  isNotFetching: { opacity: 1 },
};

const getFacetsFromUrl = (
  facets: Record<string, string | string[] | undefined>
) => {
  return Object.keys(facets).reduce(
    (acc, key) => {
      const [type, k] = key.split('_');
      const value = facets[key];

      const arrayToMutate =
        type === 'annotation' ? acc.annotations : acc.metadata;

      if (Array.isArray(value)) {
        const values = value.map((v) => ({ type: k, value: v }));
        arrayToMutate.push(...values);
      } else if (value) {
        arrayToMutate.push({ type: k, value });
      }

      return acc;
    },
    {
      annotations: [] as { type: string; value: string }[],
      metadata: [] as { type: string; value: string }[],
    }
  );
};

const Search = () => {
  const router = useRouter();
  const t = useText('search');
  const [facetedDocuments, setFacetedDocuments] = useAtom(facetsDocumentsAtom);
  const [selectedFilters, setSelectedFiltersRaw] = useAtom(selectedFiltersAtom);
  const [deanonymizedNames] = useAtom(deanonymizedFacetNamesAtom);
  const [seelctedFiltersDetails, setSelectedFiltersDetails] = useState([]);
  const [activeCollection] = useAtom(activeCollectionAtom);
  const [isAnonymized] = useAtom(globalAnonymizationAtom);
  // Wrapper to ensure we never set empty filters. (Defined below after we build
  // `filterIdToDisplayName` so we can populate `display_name`.)
  const { text, ...facetsFilters } = router.query;
  const facets = useMemo(
    () => getFacetsFromUrl(facetsFilters),
    [facetsFilters]
  );
  const { register, onSubmit, setValue } = useForm({
    text: '',
  });

  useEffect(() => {
    if (!router.isReady) return;

    if (text) {
      setValue({
        text: text as string,
      });
    }
  }, [router.query]);

  const { data, hasNextPage, fetchNextPage, isFetching } = useInfiniteQuery(
    [
      'search.facetedSearch',
      {
        text: (text as string) || '',
        ...facets,
        limit: 20,
        collectionId:
          activeCollection && activeCollection.id ? activeCollection.id : 'N/A',
        isAnonymized,
      },
    ],
    {
      staleTime: Infinity,
      getNextPageParam: (lastPage) =>
        lastPage.pagination.current_page < lastPage.pagination.total_pages
          ? lastPage.pagination.current_page + 1
          : undefined,
      getPreviousPageParam: (firstPage) =>
        firstPage.pagination.current_page > 1
          ? firstPage.pagination.current_page - 1
          : undefined,
      keepPreviousData: true,
    }
  );

  // Fetch facets cache for active collection via tRPC
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const { data: facetsCache } = useQuery(
    [
      'collection.facetsCachePaginated',
      {
        id: activeCollection && activeCollection.id ? activeCollection.id : '',
        page: 1,
        limit: 20,
        token,
      },
    ],
    {
      enabled: !!(activeCollection && activeCollection.id),
      // staleTime: Infinity means this never goes stale (and thus never
      // refetches) on its own - the only way it updates is an explicit
      // trpcContext.invalidateQueries(['collection.facetsCachePaginated'])
      // call (see ToolbarContent.tsx's save handler). refetchOnMount is
      // intentionally left at its default (true) so that once invalidated,
      // navigating back to this page actually picks up the fresh data -
      // refetchOnMount: false would otherwise keep serving the stale cache
      // even after invalidation.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }
  );

  // Normalize cached facets - extract facets array from paginated response
  const normalizedCachedFacets =
    facetsCache?.facets && Array.isArray(facetsCache.facets) && facetsCache.facets.length > 0
      ? { annotations: facetsCache.facets, metadata: [] }
      : undefined;

  // The results column is now its own scroll container (see resultsScrollEl
  // below) rather than the whole page scrolling as one document - the
  // infinite-scroll sentinel must be observed relative to THAT container
  // (`root`), not the browser viewport (the default), otherwise it never
  // intersects since the results column's own scrolling no longer moves the
  // viewport at all. `resultsScrollEl` is set via a callback ref so this
  // updates (and useInView re-subscribes) once the DOM node actually mounts.
  const [resultsScrollEl, setResultsScrollEl] = useState<HTMLDivElement | null>(
    null
  );
  const { ref, inView } = useInView({
    threshold: 0,
    root: resultsScrollEl,
  });

  useEffect(() => {
    if (inView) {
      fetchNextPage();
    }
  }, [inView]);
  useEffect(() => {
    if (data) {
      const newFacetedDocuments = data.pages.flatMap((page) => page.hits);
      console.log('newFacetedDocuments', newFacetedDocuments);
      // Merge new hits with previously loaded facet-fetched documents, preserving already-loaded items
      setFacetedDocuments((prev = []) => {
        const seen = new Set<string>(prev.map((d: any) => String(d.id)));
        const merged = [...prev];
        for (const doc of newFacetedDocuments) {
          const id = String(doc.id);
          if (!seen.has(id)) {
            merged.push(doc);
            seen.add(id);
          }
        }
        return merged;
      });
    }
  }, [data]);

  // Reset facetedDocuments when the search text or active collection changes
  useEffect(() => {
    setFacetedDocuments([]);
  }, [text, activeCollection?.id]);
  // Log facetedDocuments whenever it changes (helps debug merges from facet fetches)
  useEffect(() => {
    console.log(
      '[page] facetedDocuments atom changed, count:',
      (facetedDocuments || []).length
    );
  }, [facetedDocuments]);

  // Build id_ER to display_name map from facets (prefer cache when available)
  const filterIdToDisplayName = useMemo(() => {
    const map: Record<string, string> = {};

    const addFromGroups = (groups: any[]) => {
      (groups || []).forEach((group: any) => {
        (group.children || []).forEach((child: any) => {
          (child.ids_ER || []).forEach((id: string) => {
            if (!map[id]) {
              map[id] =
                child.display_name || child.displayName || child.key || '';
            }
          });
        });
      });
    };

    // Live search-result facets are the source of the ids a user actually
    // clicks in FacetFilter, so they take priority.
    if (data?.pages?.[0]?.facets?.annotations) {
      addFromGroups(data.pages[0].facets.annotations);
    }

    // Fall back to the collection-level facets cache. Its paginated endpoint
    // returns `{ facets: [...] }`, not `{ annotations: [...] }`.
    if (facetsCache?.facets) {
      addFromGroups(facetsCache.facets);
    } else if (Array.isArray(facetsCache)) {
      addFromGroups(facetsCache);
    }

    return map;
  }, [facetsCache, data]);

  // Wrapper to ensure we never set empty filters. Accepts an array of `id_ER` strings
  // and stores objects of shape `{ id_ER, display_name }` in the atom.
  const setSelectedFilters = (filters: string[]) => {
    const validFilters = filters.filter((f) => f && f.trim() !== '');
    const unique = Array.from(new Set(validFilters));
    const mapped = unique.map((id) => ({
      id_ER: id,
      display_name:
        // prefer deanonymized name when available
        (filterIdToDisplayName[id] &&
          deanonymizedNames[filterIdToDisplayName[id]]) ||
        filterIdToDisplayName[id] ||
        '',
    }));
    setSelectedFiltersRaw(mapped);
  };

  // Reorder documents based on selectedFilters
  const reorderedDocuments = useMemo(() => {
    console.log('filters', selectedFilters);
    // Merge backend hits with any documents fetched via facets (facetedDocuments)
    const backendHits = data ? data.pages.flatMap((page) => page.hits) : [];
    const facetFetchedHits = facetedDocuments || [];

    // Debug: log ids from backendHits and facetedDocuments to detect mismatches/duplicates
    try {
      const backendIds = backendHits.map((h: any) => String(h.id));
      const facetIds = facetFetchedHits.map((h: any) => String(h.id));
      console.log(
        '[reorder] backendIds count',
        backendIds.length,
        'sample:',
        backendIds.slice(0, 10)
      );
      console.log(
        '[reorder] facetIds count',
        facetIds.length,
        'sample:',
        facetIds.slice(0, 10)
      );
    } catch (e) {}

    // Merge and deduplicate by _id (prefer backendHits ordering)
    const seen = new Set<string>();
    const merged: any[] = [];

    backendHits.forEach((h: any) => {
      const id = String(h.id);
      if (!seen.has(id)) {
        merged.push(h);
        seen.add(id);
      }
    });

    facetFetchedHits.forEach((h: any) => {
      const id = String(h.id);
      if (!seen.has(id)) {
        merged.push(h);
        seen.add(id);
      }
    });

    const allHits = merged;

    // Clean up selectedFilters to remove empty or whitespace-only entries
    const validFilters = selectedFilters.filter(
      (filter) => filter && filter.id_ER && filter.id_ER.trim() !== ''
    );
    if (validFilters.length === 0) return allHits;

    // Normalize valid filters for consistent comparison (use `id_ER`)
    const normalizedValidFilters = validFilters.map((f) =>
      f.id_ER.toLowerCase().trim()
    );

    const matches = allHits.filter(
      (hit) =>
        Array.isArray(hit.annotations) &&
        hit.annotations.some(
          (ann: any) =>
            (ann.id_ER &&
              ann.id_ER.trim() !== '' &&
              normalizedValidFilters.includes(
                ann.id_ER.toLowerCase().trim()
              )) ||
            (ann.display_name &&
              ann.display_name.trim() !== '' &&
              normalizedValidFilters.includes(
                ann.display_name.toLowerCase().trim()
              ))
        )
    );
    const nonMatches = allHits.filter(
      (hit) =>
        !Array.isArray(hit.annotations) ||
        !hit.annotations.some(
          (ann: any) =>
            (ann.id_ER &&
              ann.id_ER.trim() !== '' &&
              normalizedValidFilters.includes(
                ann.id_ER.toLowerCase().trim()
              )) ||
            (ann.display_name &&
              ann.display_name.trim() !== '' &&
              normalizedValidFilters.includes(
                ann.display_name.toLowerCase().trim()
              ))
        )
    );
    console.log('processed documents', [...matches, ...nonMatches]);
    return [...matches, ...nonMatches];
  }, [data, selectedFilters, facetedDocuments]);

  const handleSubmit = ({ text }: { text: string }) => {
    setSelectedFilters([]);
    const url = {
      pathname: router.pathname,
      query: { text },
    };
    router.push(url, undefined, { shallow: true });
  };

  return data ? (
    <ToolbarLayout>
      {/* overflow-hidden here: the page itself must never scroll as one
          document - the facets sidebar and the results column below each
          get their own independent overflow-y-auto region instead. Without
          this, there is no bounded scroll container for either column, so
          "scrolling the sidebar" actually just scrolls the whole page. */}
      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex flex-col py-6 mt-16 px-24">
          <form
            id="search-form"
            onSubmit={onSubmit(handleSubmit)}
            className="mb-4"
          >
            <Searchbar
              id="searchbar"
              {...register('text')}
              loading={isFetching}
            />
          </form>
          <h2 id="search-documents-heading" className="text-2xl font-bold">
            {t('documents')}
          </h2>
        </div>
        <motion.div
          id="search-main"
          style={{ ...(isFetching && { pointerEvents: 'none' }) }}
          className="flex relative px-24 flex-1 overflow-hidden"
          variants={variants}
          animate={isFetching ? 'isFetching' : 'isNotFetching'}
          transition={{ duration: 0.5 }}
        >
          {(facetsCache || (data && data.pages?.[0]?.facets)) && (
            <div id="facets-container">
              <Facets
                facets={facetsCache || data.pages[0].facets}
                selectedFilters={(selectedFilters || [])
                  .filter((f) => f && f.id_ER && f.id_ER.trim() !== '')
                  .map((f) => f.id_ER)}
                // pass currently loaded backend hit ids so facets don't re-fetch documents already present
                loadedDocIds={
                  data
                    ? data.pages
                        .flatMap((p) => p.hits)
                        .map((h: any) => String(h.id))
                    : []
                }
                setSelectedFilters={(filters) => {
                  // Filter out empty strings or whitespace-only strings
                  const validFilters = filters.filter(
                    (f) => f && f.trim() !== ''
                  );
                  setSelectedFilters(validFilters);
                }}
              />
            </div>
          )}
          <div
            ref={setResultsScrollEl}
            className="flex-grow flex flex-col gap-4 p-6 overflow-y-auto overscroll-contain h-full"
            style={{ zIndex: 5 }}
          >
            {/* top-0, not top-16: this header sticks relative to the
                results column's own scroll container (see overflow-y-auto
                above), which no longer has a fixed navbar overlapping its
                internal top edge the way the old window-level scroll did. */}
            <div className="flex flex-col sticky top-0 bg-white py-6 z-10">
              <h4 id="results-count" className="text-lg font-semibold">
                {`${data.pages[0].pagination.total_hits} ${t('results')}`}
                {text &&
                  typeof text === 'string' &&
                  text.trim() !== '' &&
                  ` ${t('for')} "${text}"`}
              </h4>
              {selectedFilters && selectedFilters.length > 0 && (
                <div
                  id="selected-filters"
                  className="flex flex-row flex-wrap gap-2 mt-2"
                >
                  {
                    // Group selected filters by their display_name so chips with
                    // identical names are shown once. Clearing a grouped chip
                    // will remove all filters having that display_name.
                  }
                  {Object.entries(
                    (selectedFilters || []).reduce((acc: any, f: any) => {
                      const name = (f && f.display_name) || '';
                      if (!acc[name]) acc[name] = [];
                      acc[name].push(f.id_ER);
                      return acc;
                    }, {})
                  ).map(([displayName, ids]) => (
                    <FilterChip
                      key={String(displayName) + ids.join('-')}
                      value={displayName}
                      handleClear={() =>
                        // remove all filters that have this display name
                        setSelectedFilters(
                          (selectedFilters || [])
                            .filter(
                              (filter) => filter.display_name !== displayName
                            )
                            .map((f) => f.id_ER)
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {(normalizedCachedFacets || (data && data.pages[0].facets)) && (
                <ActiveFiltersList
                  facets={normalizedCachedFacets || data.pages[0].facets}
                />
              )}
            </div>
            <div
              id="documents-grid"
              className="grid gap-x-8 gap-y-8"
              style={{
                gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
              }}
            >
              {reorderedDocuments.map((hit) => (
                <DocumentHit
                  key={hit._id}
                  hit={hit}
                  highlight={
                    Array.isArray(hit.annotations) &&
                    hit.annotations.some((ann: any) => {
                      const normalizedSelectedFilters = (
                        selectedFilters || []
                      ).map((f) =>
                        f && f.id_ER ? f.id_ER.toLowerCase().trim() : ''
                      );
                      return (
                        (ann.id_ER &&
                          ann.id_ER.trim() !== '' &&
                          normalizedSelectedFilters.includes(
                            ann.id_ER.toLowerCase().trim()
                          )) ||
                        (ann.display_name &&
                          ann.display_name.trim() !== '' &&
                          normalizedSelectedFilters.includes(
                            ann.display_name.toLowerCase().trim()
                          ))
                      );
                    })
                  }
                  selectedFilters={(selectedFilters || []).map((f) => f.id_ER)}
                  filterIdToDisplayName={filterIdToDisplayName}
                />
              ))}
            </div>
            {hasNextPage && (
              <div ref={ref} id="load-more-container" className="w-full">
                <Button
                  id="load-more-btn"
                  loading={isFetching}
                  onClick={() => fetchNextPage()}
                  className="bg-slate-900 mx-auto"
                >
                  {t('loadMore')}
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
      <LLMButton />
    </ToolbarLayout>
  ) : (
    <LoadingOverlay show />
  );
};

// Protect this page - require authentication
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'eng';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Search;
