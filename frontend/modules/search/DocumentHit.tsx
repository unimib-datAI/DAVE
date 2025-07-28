import { FacetedQueryHit } from '@/server/routers/search';
import { motion } from 'framer-motion';
import Link from 'next/link';

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
  // Find matching annotation ids
  const matchedIds = Array.isArray(hit.annotations)
    ? hit.annotations
        .map((ann) => ann.id_ER)
        .filter((id) => selectedFilters.includes(id))
    : [];

  // Remove duplicates
  const uniqueMatchedIds = Array.from(new Set(matchedIds));

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
          {uniqueMatchedIds.length > 0 && (
            <div className="flex flex-row flex-wrap gap-2 mt-4">
              {uniqueMatchedIds.map((id) => (
                <span
                  key={id}
                  className="px-2 py-1 rounded-full bg-blue-200 text-blue-900 text-xs font-semibold"
                >
                  {filterIdToDisplayName[id] || id}
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
