import { useForm } from '@/hooks';
import { FacetedQueryOutput } from '@/server/routers/search';
import Fuse from 'fuse.js';
import { SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FacetFilter } from './FacetFilter';

// Entity type grouping map - keys are lowercase
const entityTypeGroupMap: Record<string, string> = {
  // Person group
  person: 'persona',
  per: 'persona',
  people: 'persona',
  individual: 'persona',
  persona: 'persona',

  // Location group
  location: 'luogo',
  loc: 'luogo',
  place: 'luogo',
  gpe: 'luogo',
  luogo: 'luogo',

  // Organization group
  organization: 'organizzazione',
  org: 'organizzazione',
  company: 'organizzazione',
  institution: 'organizzazione',
  organizzazione: 'organizzazione',

  // Date/Time group
  date: 'data',
  time: 'data',
  temporal: 'data',
  data: 'data',

  // Money/Currency group
  money: 'money',
  monetary: 'money',
  currency: 'money',
  financial: 'money',
  denaro: 'money',

  // Law/Legal group
  law: 'norma',
  legal: 'norma',
  statute: 'norma',
  regulation: 'norma',
  norma: 'norma',

  // Facility types
  fac: 'facility',
  facility: 'facility',
  building: 'facility',
  structure: 'facility',

  // Nationality/Religion/Political types
  norp: 'norp',
  nationality: 'norp',
  religion: 'norp',
  political: 'norp',

  // Numeric types
  cardinal: 'numeric',
  ordinal: 'numeric',
  quantity: 'numeric',
  percent: 'numeric',
  number: 'numeric',

  // Creative work types
  work_of_art: 'creative_work',
  artwork: 'creative_work',
  creative: 'creative_work',

  // Event types
  event: 'event',

  // Product types
  product: 'product',

  // Language types
  language: 'language',
};

// Function to get normalized entity type group
const getNormalizedEntityGroup = (key: string): string => {
  const lowerKey = key.toLowerCase();
  return entityTypeGroupMap[lowerKey] || key;
};

type FacetsProps = {
  facets: FacetedQueryOutput['facets'];
  selectedFilters: string[];
  setSelectedFilters: (filters: string[]) => void;
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

const buildFacets = (facets: FacetedQueryOutput['facets']) => {
  // Group annotation facets by normalized entity type
  const groupedAnnotations = new Map<string, (typeof facets.annotations)[0]>();

  // Process all annotations to group them
  facets.annotations.forEach((facet) => {
    const normalizedGroup = getNormalizedEntityGroup(facet.key);

    if (!groupedAnnotations.has(normalizedGroup)) {
      // Use first occurrence as the base for the group
      groupedAnnotations.set(normalizedGroup, {
        ...facet,
        key: normalizedGroup, // Use normalized key for the group
        n_children: facet.n_children,
        children: [...facet.children],
      });
    } else {
      // Merge children into existing group
      const existingGroup = groupedAnnotations.get(normalizedGroup)!;
      existingGroup.n_children += facet.n_children;
      existingGroup.children.push(...facet.children);
    }
  });

  // Convert grouped annotations back to array
  const annotations = Array.from(groupedAnnotations.values())
    .map((facet) => ({ filterType: 'annotation', ...facet }))
    .sort((a, b) => {
      return (
        facetsAnnotationsOrder.indexOf(a.key) -
        facetsAnnotationsOrder.indexOf(b.key)
      );
    });

  const metadata = facets.metadata
    .map((facet) => ({ filterType: 'metadata', ...facet }))
    .sort((a, b) => {
      return (
        facetsMetadataOrder.indexOf(a.key) - facetsMetadataOrder.indexOf(b.key)
      );
    });

  return [...metadata, ...annotations];
};

const Facets = ({
  facets,
  selectedFilters,
  setSelectedFilters,
}: FacetsProps) => {
  const { register, value } = useForm({
    filter: '',
  });

  const allFacets = useMemo(() => buildFacets(facets), [facets]);

  const fuse = useRef(
    new Fuse(allFacets, {
      keys: ['key'],
    })
  );

  const filteredFacets =
    value.filter.trim() === ''
      ? allFacets
      : fuse.current.search(value.filter).map(({ item }) => item);

  useEffect(() => {
    // Reorder facets based on selected filters
    // console.log('selected filters ', selectedFilters);
    // console.log('fist facet', filteredFacets[0]);

    // Clean up selected filters to remove empty or whitespace-only strings
    const cleanedFilters = selectedFilters.filter(
      (filter) => filter && filter.trim() !== ''
    );

    filteredFacets.sort((a, b) => {
      const aSelected =
        (a.key && cleanedFilters.includes(a.key)) ||
        a.children.some(
          (child) =>
            (child.display_name &&
              cleanedFilters.includes(child.display_name.toLowerCase())) ||
            child.ids_ER.some(
              (id) => id && id.trim() !== '' && cleanedFilters.includes(id)
            )
        );
      const bSelected =
        (b.key && cleanedFilters.includes(b.key)) ||
        b.children.some(
          (child) =>
            (child.display_name &&
              cleanedFilters.includes(child.display_name.toLowerCase())) ||
            child.ids_ER.some(
              (id) => id && id.trim() !== '' && cleanedFilters.includes(id)
            )
        );
      return (bSelected ? 1 : 0) - (aSelected ? 1 : 0); // Prioritize selected facets
    });
  }, [selectedFilters, filteredFacets]);

  // Reorder filtered facets to prioritize matches
  filteredFacets.sort((a, b) => {
    const filterLower = value.filter.toLowerCase();
    const aMatches =
      (a.key && a.key.toLowerCase().includes(filterLower)) ||
      a.children.some(
        (child) =>
          (child.display_name &&
            child.display_name.toLowerCase().includes(filterLower)) ||
          child.ids_ER.some(
            (id) =>
              id && id.trim() !== '' && id.toLowerCase().includes(filterLower)
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
              id && id.trim() !== '' && id.toLowerCase().includes(filterLower)
          )
      );
    return (bMatches ? 1 : 0) - (aMatches ? 1 : 0); // Prioritize facets that match the filter
  });
  return allFacets.length > 0 ? (
    <div className="sticky top-16 w-72 h-[calc(100vh-4rem)]">
      <div className="overflow-y-auto h-full">
        <div className="flex flex-col pr-6 py-6 gap-8">
          <div className="flex flex-col">
            <div className="text-lg font-semibold">Filter</div>
            <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-3 w-full gap-2">
              <SearchIcon size={22} />
              <input
                className="text-slate-800 resize-none bg-transparent w-full h-full border-none text-base"
                spellCheck="false"
                placeholder={`Find filter`}
                {...register('filter')}
              />
            </div>
          </div>

          {filteredFacets.map(({ filterType, ...facet }) => (
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
                  facet.children.some(
                    (child) =>
                      (child.display_name &&
                        child.display_name
                          .toLowerCase()
                          .includes(value.filter.toLowerCase())) ||
                      child.ids_ER.some(
                        (id) =>
                          id &&
                          id.trim() !== '' &&
                          id.toLowerCase().includes(value.filter.toLowerCase())
                      )
                  ))
              }
              selectedFilters={selectedFilters}
              onFilterChange={(filterType, updatedFilters) => {
                // Filter out empty or whitespace-only strings before setting
                const cleanedFilters = updatedFilters.filter(
                  (filter) => filter && filter.trim() !== ''
                );
                setSelectedFilters(Array.from(new Set(cleanedFilters)));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  ) : null;
};

export { Facets };
