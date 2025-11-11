import { FacetedQueryHit } from '@/server/routers/search';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
} from '@/utils/atoms';

type DocumentHitProps = {
  hit: FacetedQueryHit;
  highlight?: boolean;
  selectedFilters?: string[];
  filterIdToDisplayName?: Record<string, string>;
};

const DocumentHit = ({
  hit,
  highlight,
  selectedFilters = [],
  filterIdToDisplayName = {},
}: DocumentHitProps) => {
  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames] = useAtom(deanonymizedFacetNamesAtom);
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

  return (
    <motion.div
      key={hit._id}
      layout
      className={`flex flex-col ${
        highlight ? 'border-4 border-blue-500 bg-blue-50 shadow-lg' : ''
      }`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Link
        href={`/documents/${hit.mongo_id ? hit.mongo_id : hit.id}`}
        passHref
      >
        <a
          className={`rounded-md overflow-hidden border-[1px] border-solid border-slate-200 p-4 bg-white hover:shadow-lg hover:-translate-y-6 transition-all ${
            highlight ? 'bg-blue-50' : ''
          }`}
        >
          <div className="h-36 overflow-ellipsis overflow-hidden mb-2 text-sm">
            {hit.text}
          </div>
          <div className="font-bold text-sm whitespace-nowrap overflow-hidden text-ellipsis">
            {hit.name}
          </div>
          {/* Chips for matched filters */}
          {uniqueMatchedItems.length > 0 && (
            <div className="flex flex-row flex-wrap gap-2 mt-4">
              {Array.from(
                new Set(
                  uniqueMatchedItems.map((item: any) => {
                    const originalName =
                      item.display_name ||
                      filterIdToDisplayName[item.id_ER] ||
                      item.id_ER;
                    // Use de-anonymized name if available
                    return deanonymize &&
                      item.display_name &&
                      deanonymizedNames[item.display_name]
                      ? deanonymizedNames[item.display_name]
                      : originalName;
                  })
                )
              ).map((displayName: string) => (
                <span
                  key={displayName}
                  className="px-2 py-1 rounded-full bg-blue-200 text-blue-900 text-xs font-semibold"
                >
                  {displayName}
                </span>
              ))}
            </div>
          )}
        </a>
      </Link>
    </motion.div>
  );
};

export { DocumentHit };
