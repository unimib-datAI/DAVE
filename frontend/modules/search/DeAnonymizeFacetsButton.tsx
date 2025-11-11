import { useMutation } from '@/utils/trpc';
import { Eye, EyeOff } from 'lucide-react';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
} from '@/utils/atoms';
import { FacetedQueryOutput } from '@/server/routers/search';
import { useState } from 'react';

type DeAnonymizeFacetsButtonProps = {
  facets: FacetedQueryOutput['facets'];
};

export function DeAnonymizeFacetsButton({
  facets,
}: DeAnonymizeFacetsButtonProps) {
  const [deanonymize, setDeanonymize] = useAtom(deanonymizeFacetsAtom);
  const [deanonymizedNames, setDeanonymizedNames] = useAtom(
    deanonymizedFacetNamesAtom
  );
  const [isLoading, setIsLoading] = useState(false);

  const deanonymizeMutation = useMutation(['document.deanonymizeKeys']);

  const handleToggle = async () => {
    if (!deanonymize) {
      // User wants to de-anonymize
      setIsLoading(true);

      try {
        // Collect all display names from annotation facets
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
          // Call the batch de-anonymize endpoint
          const result = await deanonymizeMutation.mutateAsync({
            keys: keysArray,
          });

          // Store the de-anonymized names
          setDeanonymizedNames(result);
        }

        // Enable de-anonymization view
        setDeanonymize(true);
      } catch (error) {
        console.error('Failed to de-anonymize facet names:', error);
        // Still toggle to show what we have
        setDeanonymize(true);
      } finally {
        setIsLoading(false);
      }
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
          <span className="text-sm font-medium">Loading...</span>
        </>
      ) : (
        <>
          {deanonymize ? <Eye size={16} /> : <EyeOff size={16} />}
          <span className="text-sm font-medium">
            {deanonymize ? 'Hide Names' : 'Show Names'}
          </span>
        </>
      )}
    </button>
  );
}
