import { Facet, FacetedQueryOutput } from '@/server/routers/search';
import { X } from 'lucide-react';
import { useRouter } from 'next/router';

const getActiveFilters = (
  facets: ActiveFiltersListProps['facets'],
  { text, ...filters }: Record<string, string | string[] | undefined>
) => {
  let mappedActiveFilters = Object.keys(filters)
    .map((filterType) => {
      const value = (
        Array.isArray(filters[filterType])
          ? filters[filterType]
          : [filters[filterType]]
      ) as string[];
      const [category, type] = filterType.split('_');

      const group = category === 'annotation' ? 'annotations' : 'metadata';
      return value.map((v) => {
        const facetGroup = facets[group as keyof typeof facets].find(
          (facetG) => facetG.key === type
        ) as Facet;

        return {
          filterType,
          value: facetGroup.children.find((facet) =>
            facet.ids_ER.includes(v)
          ) as Facet['children'][number],
        };
      });
    })
    .flat();
  return removeDuplicateFilters(mappedActiveFilters);
};

interface MappedFilters {
  filterType: string;
  value: Facet['children'][number];
}
function removeDuplicateFilters(filters: MappedFilters[]) {
  const seen = new Set();
  return filters.filter((filter) => {
    const duplicate = seen.has(filter.value.display_name);
    seen.add(filter.value.display_name);
    return !duplicate;
  });
}
type ActiveFiltersListProps = {
  facets: FacetedQueryOutput['facets'];
};

const ActiveFiltersList = ({ facets }: ActiveFiltersListProps) => {
  const router = useRouter();
  const activeFilters =
    facets.annotations.length === 0 && facets.metadata.length === 0
      ? []
      : getActiveFilters(facets, router.query);

  const removeFilter = (key: string, value: Facet['children'][number]) => {
    const filterValue = router.query[key];
    const v = Array.isArray(filterValue)
      ? filterValue
      : ([filterValue] as string[]);
    const newFilters = v.filter((f) => !value.ids_ER.includes(f));

    const url = {
      pathname: router.pathname,
      query: {
        ...router.query,
        [key]: newFilters,
      },
    };

    router.push(url, undefined, { shallow: true });
  };

  const removeAllFilters = () => {
    const { text } = router.query;

    const url = {
      pathname: router.pathname,
      query: {
        text,
      },
    };

    router.push(url, undefined, { shallow: true });
  };
  return (
    <div className="flex flex-row items-center flex-wrap gap-2">
      {activeFilters.map((filter, index) => {
        console.log('filter', filter);
        return (
          <button
            key={index}
            onClick={() => removeFilter(filter.filterType, filter.value)}
            className="cursor-pointer hover:opacity-90 border-none m-0  bg-slate-900 rounded-full px-2 py-1 text-white text-xs flex flex-row items-center gap-2"
          >
            {filter.filterType.startsWith('annotation')
              ? filter.value.display_name
              : filter.value.key}
            <X size={16} />
          </button>
        );
      })}
      {activeFilters.length > 0 ? (
        <button
          onClick={removeAllFilters}
          className="text-xs border-none bg-transparent flex justify-start m-0 p-0 font-semibold underline cursor-pointer"
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
};

export { ActiveFiltersList };
