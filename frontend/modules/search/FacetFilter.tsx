import { useForm } from '@/hooks';
import { Facet } from '@/server/routers/search';
import { Checkbox } from '@nextui-org/react';
import Fuse from 'fuse.js';
import { Option } from 'lucide-react';
import { Link, Link2, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
} from '@/utils/atoms';

type FacetFilterProps = {
  facet: Facet;
  filterType: string;
  highlight?: boolean;
  onFilterChange: (filterType: string, updatedFilters: string[]) => void;
  selectedFilters: string[];
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
}: FacetFilterProps) => {
  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames] = useAtom(deanonymizedFacetNamesAtom);

  const { register, value } = useForm({
    filter: '',
  });
  const fuse = useRef(
    new Fuse(facet.children, {
      keys: filterType.startsWith('annotation')
        ? ['display_name', 'ids_ER']
        : ['key', 'ids_ER'],
    })
  );

  const [page, setPage] = useState(0);

  const MAX_VISIBLE_CHILDREN = 7;
  const STEP = 10;
  const VISIBLE_ELEMENTS = page * STEP + MAX_VISIBLE_CHILDREN;

  // Group children by their display_name (or de-anonymized name) and combine their ids_ER
  const groupedChildren = facet.children.reduce((acc, child) => {
    // Use de-anonymized name if available, otherwise use display_name or key
    const displayName =
      deanonymize && child.display_name && deanonymizedNames[child.display_name]
        ? deanonymizedNames[child.display_name]
        : child.display_name || child.key;
    const key = displayName?.toLowerCase() || '';

    if (!acc[key]) {
      acc[key] = { ...child };
    } else {
      // Combine ids_ER arrays, removing duplicates
      acc[key].ids_ER = Array.from(
        new Set([...acc[key].ids_ER, ...child.ids_ER])
      );
      acc[key].doc_count += child.doc_count;
    }
    return acc;
  }, {} as Record<string, (typeof facet.children)[0]>);

  const deduplicatedChildren =
    value.filter.trim() === ''
      ? Object.values(groupedChildren)
      : fuse.current.search(value.filter).map(({ item }) => item);

  // Filter out anonymous personas
  const filteredAnonymous = deduplicatedChildren.filter(
    (child) => child.display_name !== '[ANONYMOUS PERSONA]'
  );

  // Sort the filtered children
  const filteredChildren = filteredAnonymous.sort((a, b) =>
    (a.display_name || a.key || '').localeCompare(b.display_name || b.key || '')
  );

  const children = filteredChildren.slice(0, VISIBLE_ELEMENTS);

  const handleChecked = (
    checked: boolean,
    key: string,
    keys: string[],
    option: any
  ) => {
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
      className={`flex flex-col z-[1] gap-2 ${
        highlight ? 'border-2 border-blue-500 rounded-md' : ''
      }`}
    >
      <div className="flex flex-row items-center gap-2">
        <span className="capitalize text-sm font-semibold">{facet.key}</span>
        <span className="text-xs text-slate-400">{`(${facet.n_children})`}</span>
      </div>

      <div className="flex flex-row items-center border-[1px] border-solid border-slate-200 rounded-md p-1 w-full gap-2">
        <SearchIcon size={16} />
        <input
          className="text-slate-800 resize-none bg-transparent w-full h-full border-none text-sm"
          spellCheck="false"
          placeholder={`Find ${facet.key}`}
          {...register('filter')}
        />
      </div>

      <div className="flex flex-col">
        {children.map((option) => {
          if (!option.display_name.includes('vault:v1'))
            console.log('***option', option);
          return (
            <Checkbox
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
              value={option.key}
              onChange={(checked) => {
                handleChecked(checked, option.key, option.ids_ER, option);
              }}
            >
              <div className="flex flex-row items-center gap-1">
                {option.is_linked && (
                  <span className="flex items-center justify-center rounded-md uppercase text-xs bg-blue-100 px-1 font-semibold p-[1px]">
                    <Link className="h-3 w-3 text-black" />
                  </span>
                )}
                <span className="text-base whitespace-nowrap text-ellipsis overflow-hidden w-48">
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

      {filteredChildren.length > MAX_VISIBLE_CHILDREN ? (
        <div className="flex flex-row justify-between">
          {page > 0 ? (
            <button
              onClick={() => setPage(0)}
              className="text-xs border-none bg-transparent flex justify-start m-0 p-0 font-semibold underline cursor-pointer"
            >
              Show less
            </button>
          ) : null}
          {VISIBLE_ELEMENTS < facet.n_children ? (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="text-xs border-none bg-transparent flex justify-start m-0 p-0 font-semibold underline cursor-pointer"
            >
              {`Show ${STEP} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export { FacetFilter };
