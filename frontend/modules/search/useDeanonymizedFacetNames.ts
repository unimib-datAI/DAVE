import { useCallback, useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import {
  deanonymizeFacetsAtom,
  deanonymizedFacetNamesAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { useMutation } from '@/utils/trpc';

export const isVaultKey = (value?: string | null): value is string =>
  typeof value === 'string' && value.startsWith('vault:v1');

// Keys currently being decrypted, shared by every mounted facet component so
// the same key isn't requested twice while a request is pending.
const inFlight = new Set<string>();

/**
 * Resolves anonymized facet display names (vault keys) to real names while
 * the global de-anonymization toggle is on.
 *
 * Decryption is incremental: whenever `displayNames` contains vault keys that
 * haven't been decrypted yet (facets loaded after the toggle was flipped,
 * "show more" pages, per-facet search results...), only those are requested
 * and merged into the shared `deanonymizedFacetNamesAtom` cache - never
 * replacing it, so concurrent requests can't clobber each other.
 *
 * Returns `resolve(displayName)`: the real name when de-anonymizing and
 * known, otherwise `displayName` unchanged. Always resolve at render time -
 * never store the result, or it outlives the toggle being switched back off.
 */
export function useDeanonymizedFacetNames(displayNames: (string | null | undefined)[]) {
  const [deanonymize] = useAtom(deanonymizeFacetsAtom);
  const [names, setNames] = useAtom(deanonymizedFacetNamesAtom);
  const [, setLoading] = useAtom(isLoadingAnonymizationAtom);
  const deanonymizeMutation = useMutation(['document.deanonymizeKeys']);

  // Stable string of the keys still missing, so the effect below only fires
  // when that set actually changes (not on every render's new array).
  const missing = useMemo(() => {
    if (!deanonymize) return '';
    const keys = new Set<string>();
    displayNames.forEach((name) => {
      if (isVaultKey(name) && !(name in names) && !inFlight.has(name)) keys.add(name);
    });
    return Array.from(keys).sort().join('\n');
  }, [deanonymize, displayNames, names]);

  useEffect(() => {
    if (!missing) return;
    const keys = missing.split('\n');
    keys.forEach((key) => inFlight.add(key));
    setLoading(true);
    deanonymizeMutation
      .mutateAsync({ keys })
      .then((result: Record<string, string | null>) => {
        setNames((prev) => {
          const next = { ...prev };
          // Keys the service couldn't decrypt map to themselves, so they
          // aren't re-requested on every render.
          keys.forEach((key) => {
            const value = result?.[key];
            next[key] = typeof value === 'string' && value !== '' ? value : key;
          });
          return next;
        });
      })
      .catch((error: unknown) => {
        console.error('Failed to de-anonymize facet names:', error);
      })
      .finally(() => {
        keys.forEach((key) => inFlight.delete(key));
        if (inFlight.size === 0) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing]);

  return useCallback(
    (displayName?: string | null) =>
      deanonymize && displayName && names[displayName] ? names[displayName] : displayName ?? '',
    [deanonymize, names]
  );
}
