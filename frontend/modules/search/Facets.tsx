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
import { useMutation } from '@/utils/trpc';
import { activeCollectionAtom } from '@/atoms/collection';

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

  const allFacets = useMemo(() => toGroupedFacets(facets), [facets]);

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

    fetchDeAnonymizedNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deanonymize, allFacets]);

  const fuse = useRef<any>(null);
  useEffect(() => {
    fuse.current = new Fuse(allFacets, { keys: ['key', 'display_name'] });
  }, [allFacets]);

  const filteredFacets = useMemo(() => {
    const baseFiltered =
      value.filter.trim() === ''
        ? allFacets
        : fuse.current.search(value.filter).map(({ item }) => item);

    // Create a copy to avoid mutating the original array
    const sorted = [...baseFiltered];

    // If there's a filter query, prioritize matches
    if (value.filter.trim() !== '') {
      const filterLower = value.filter.toLowerCase().trim();
      sorted.sort((a, b) => {
        const aMatches =
          (a.key && a.key.toLowerCase().includes(filterLower)) ||
          a.children.some(
            (child) =>
              (child.display_name &&
                child.display_name.toLowerCase().includes(filterLower)) ||
              child.ids_ER.some(
                (id) =>
                  id &&
                  id.trim() !== '' &&
                  id.toLowerCase().includes(filterLower)
              )
          );
        const bMatches =
          (b.key && b.key.toLowerCase().includes(filterLower)) ||
          b.children.some(
            (child) =>
              (child.display_name &&
                child.display_name.toLowerCase().includes(filterLower)) ||
              child.ids_ER.some(
                (id) =>
                  id &&
                  id.trim() !== '' &&
                  id.toLowerCase().includes(filterLower)
              )
          );
        return (bMatches ? 1 : 0) - (aMatches ? 1 : 0);
      });
    }

    return sorted;
  }, [allFacets, value.filter]);

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

  useEffect(() => {
    console.log('filtered facets', filteredFacets);
  }, [filteredFacets]);
  return allFacets.length > 0 ? (
    <div className="sticky top-16 w-72 h-[calc(100vh-4rem)]">
      <div className="overflow-y-auto h-full">
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

          {orderedFacets.map(({ filterType, ...facet }) => {
            if (
              !collection?.config ||
              !collection?.config.typesToHide ||
              collection.config.typesToHide.length === 0
            ) {
              return (
                <FacetFilter
                  key={`${facet.key}-${filterType}`}
                  facet={facet}
                  filterType={filterType}
                  highlight={
                    value.filter.trim() !== '' &&
                    ((facet.key &&
                      facet.key
                        .toLowerCase()
                        .includes(value.filter.toLowerCase())) ||
                      facet.children.some((child) =>
                        child.ids_ER.some(
                          (id) =>
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
                    facet={facet}
                    filterType={filterType}
                    highlight={
                      value.filter.trim() !== '' &&
                      ((facet.key &&
                        facet.key
                          .toLowerCase()
                          .includes(value.filter.toLowerCase())) ||
                        facet.children.some((child) =>
                          child.ids_ER.some(
                            (id) =>
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
