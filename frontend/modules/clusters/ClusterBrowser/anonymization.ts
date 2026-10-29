import { useAtom } from 'jotai';
import { globalAnonymizationAtom } from '@/utils/atoms';
import { Cluster } from '@/server/routers/document';

// Values encrypted by the Vault transit engine (vault:v<key version>:...)
const VAULT_PREFIX = /^vault:v\d+:/;

/**
 * The global anonymization toggle, the same one the document viewer follows:
 * when it is off, documents are requested de-anonymized.
 */
export function useAnonymization() {
  const [isAnonymized] = useAtom(globalAnonymizationAtom);
  return { isAnonymized, deAnonimize: !isAnonymized };
}

/**
 * Anonymized view of a cluster: the viewer shows a cluster by its vault token
 * (prefix stripped), but a stored title can still be the clear name while its
 * mentions - and the document text - hold the tokens. In that case show the
 * token of the first anonymized mention, so a clear name never shows up next
 * to an anonymized document.
 */
export function anonymizedCluster<T extends Cluster>(cluster: T): T {
  const token = VAULT_PREFIX.test(cluster.title)
    ? cluster.title
    : cluster.mentions.find((m) => VAULT_PREFIX.test(m.mention))?.mention;
  if (!token) return cluster;
  return { ...cluster, title: token.replace(VAULT_PREFIX, '') };
}
