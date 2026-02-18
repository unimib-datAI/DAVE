import { useMutation } from '@/utils/trpc';
import { Eye, EyeOff } from 'lucide-react';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { FacetedQueryOutput } from '@/server/routers/search';
import { useEffect, useState } from 'react';
import { useText } from '@/components/TranslationProvider';

type DeAnonymizeFacetsButtonProps = {
  facets: FacetedQueryOutput['facets'];
};

export function DeAnonymizeFacetsButton({
  facets,
}: DeAnonymizeFacetsButtonProps) {
  const t = useText('common');
  const [deanonymize, setDeanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames, setDeanonymizedNames] = useAtom(
    deanonymizedFacetNamesAtom
  );
  const [isLoading, setIsLoading] = useState(false);
  const [, setGlobalLoading] = useAtom(isLoadingAnonymizationAtom);

  const deanonymizeMutation = useMutation(['document.deanonymizeKeys']);

  // Helper to collect display names from facets and fetch de-anonymized values
  const fetchAndSetDeAnonymizedNames = async () => {
    setIsLoading(true);
    setGlobalLoading(true);
    try {
      const displayNames = new Set<string>();

      facets.annotations.forEach((facet) => {
        facet.children.forEach((child) => {
          if (child.display_name && child.display_name.trim() !== '') {
            displayNames.add(child.display_name);
          }
        });
      });

      const keysArray = Array.from(displayNames);

      if (keysArray.length > 0) {
        const result = await deanonymizeMutation.mutateAsync({
          keys: keysArray,
        });

        setDeanonymizedNames(result);
      }
    } catch (error) {
      console.error('Failed to de-anonymize facet names:', error);
    } finally {
      setIsLoading(false);
      setGlobalLoading(false);
    }
  };

  // On mount (or when `deanonymize` changes), if the global toggle indicates
  // we should be showing real names and we don't have them yet, fetch them.
  useEffect(() => {
    if (deanonymize && Object.keys(deanonymizedNames || {}).length === 0) {
      // Fire-and-forget - we handle loading state inside the helper
      fetchAndSetDeAnonymizedNames();
    }
    // Only run when mounting and when deanonymize or deanonymizedNames reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deanonymize]);

  const handleToggle = async () => {
    if (!deanonymize) {
      // User wants to de-anonymize; ensure names are loaded first
      if (Object.keys(deanonymizedNames || {}).length === 0) {
        await fetchAndSetDeAnonymizedNames();
      }
      // Enable de-anonymization view (this updates the global anonymization via derived atom)
      setDeanonymize(true);
    } else {
      // User wants to re-anonymize (just toggle the view)
      setDeanonymize(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all ${
        deanonymize
          ? 'bg-blue-50 border-blue-300 text-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      title={
        deanonymize
          ? 'Hide real names (show anonymized)'
          : 'Show real names (de-anonymize)'
      }
    >
      {isLoading ? (
        <>
          <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full" />
          <span className="text-sm font-medium">{t('loading')}</span>
        </>
      ) : (
        <>
          {deanonymize ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="text-sm font-medium">
            {deanonymize ? t('hideNames') : t('showNames')}
          </span>
        </>
      )}
    </button>
  );
}
