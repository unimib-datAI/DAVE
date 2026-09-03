import { FacetedQueryHit } from '@/server/routers/search';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
} from '@/utils/atoms';
import { activeCollectionAtom } from '@/atoms/collection';

type DocumentHitProps = {
  hit: FacetedQueryHit;
  highlight?: boolean;
  selectedFilters?: string[];
  filterIdToDisplayName?: Record<string, string>;
  // Display names of the currently-selected facets that this document matches.
  // Computed by the search page from the facets-cache `doc_ids` mapping because
  // ES hits carry no usable `annotations` array; when provided this is the
  // source of truth for the chips.
  matchedDisplayNames?: string[];
};

const DocumentHit = ({
  hit,
  highlight,
  selectedFilters = [],
  filterIdToDisplayName = {},
  matchedDisplayNames,
}: DocumentHitProps) => {
  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames] = useAtom(deanonymizedFacetNamesAtom);
  const [activeCollection] = useAtom(activeCollectionAtom);
  // Find matching annotation ids and display names
  const matchedItems = Array.isArray(hit.annotations)
    ? hit.annotations.filter((ann: any) => selectedFilters.includes(ann.id_ER))
    : [];

  // Remove duplicates using Set for cleaner deduplication
  const uniqueMatchedItems = (() => {
    const seen = new Set<string>();
    return matchedItems.filter((item: any) => {
      if (seen.has(item.id_ER)) {
        return false;
      }
      seen.add(item.id_ER);
      return true;
    });
  })();

  // Prefer the page-computed names (facets-cache backed); fall back to names
  // derived from any real annotations on the hit.
  const chipNames =
    matchedDisplayNames && matchedDisplayNames.length > 0
      ? Array.from(new Set(matchedDisplayNames))
      : Array.from(
          new Set(
            uniqueMatchedItems.map((item: any) => {
              const originalName =
                item.display_name ||
                filterIdToDisplayName[item.id_ER] ||
                item.id_ER;
              return deanonymize &&
                item.display_name &&
                deanonymizedNames[item.display_name]
                ? deanonymizedNames[item.display_name]
                : originalName;
            })
          )
        );

  return (
    <motion.div
      id={`document-hit-${hit._id}`}
      key={hit._id}
      layout
      className="flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Link
        href={{
          pathname: `/documents/${hit.mongo_id ? hit.mongo_id : hit.id}`,
          // Disambiguates duplicate documents that share the same
          // content-hash id across different collections - this hit came
          // from searching activeCollection, so that's the collection this
          // document should be opened/edited/saved as belonging to.
          query: activeCollection?.id
            ? { collectionId: activeCollection.id }
            : undefined,
        }}
      >
        <div
          id={`document-hit-container-${hit._id}`}
          className={`rounded-md overflow-hidden border-solid p-4 bg-white hover:shadow-lg hover:-translate-y-6 transition-all ${
            highlight
              ? 'border-l-4 border-l-blue-400 border-t border-r border-b border-slate-200 shadow-md'
              : 'border border-slate-200'
          }`}
        >
          <div
            id={`document-hit-text-${hit._id}`}
            className="h-36 overflow-ellipsis overflow-hidden mb-2 text-sm"
          >
            {hit.text}
          </div>
          <div
            id={`document-hit-title-${hit._id}`}
            className="font-bold text-sm whitespace-nowrap overflow-hidden text-ellipsis"
          >
            {hit.name}
          </div>
          {/* Chips for matched filters */}
          {chipNames.length > 0 && (
            <div
              id={`document-hit-chips-${hit._id}`}
              className="flex flex-row flex-wrap gap-2 mt-4"
            >
              {chipNames.map((displayName: string, idx) => (
                <span
                  key={displayName}
                  id={`document-hit-chip-${hit._id}-${idx}`}
                  className="px-2 py-1 rounded-full bg-blue-200 text-blue-900 text-xs font-semibold"
                >
                  {displayName}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
};

export { DocumentHit };
