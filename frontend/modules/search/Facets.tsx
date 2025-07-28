import { useForm } from '@/hooks';
import { FacetedQueryOutput } from '@/server/routers/search';
import Fuse from 'fuse.js';
import { SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FacetFilter } from './FacetFilter';

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
  const annotations = facets.annotations
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
    console.log('selected filters ', selectedFilters);
    console.log('fist facet', filteredFacets[0]);
    filteredFacets.sort((a, b) => {
      const aSelected = selectedFilters.includes(a.key);
      const bSelected = selectedFilters.includes(b.key);
      return bSelected - aSelected; // Prioritize selected facets
    });
  }, [selectedFilters, filteredFacets]);

  // Reorder filtered facets to prioritize matches
  filteredFacets.sort((a, b) => {
    const aMatches = a.key.includes(value.filter);
    const bMatches = b.key.includes(value.filter);
    return bMatches - aMatches; // Prioritize facets that match the filter
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
              key={facet.key}
              facet={facet}
              filterType={filterType}
              highlight={
                value.filter.trim() !== '' && facet.key.includes(value.filter)
              }
              selectedFilters={selectedFilters}
              onFilterChange={(filterType, updatedFilters) =>
                setSelectedFilters(updatedFilters)
              }
            />
          ))}
        </div>
      </div>
    </div>
  ) : null;
};

export { Facets };
