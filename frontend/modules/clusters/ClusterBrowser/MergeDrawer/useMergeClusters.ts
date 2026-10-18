import { activeCollectionAtom } from '@/atoms/collection';
import { useAtom } from 'jotai/react';
import { useSession } from 'next-auth/react';
import { useContext as useTrpcContext, useMutation } from '@/utils/trpc';
import { addToast } from '@heroui/react';
import { useText } from '@/components';
import { MergePair } from '../types';

const spawnToast = (
  color: 'danger' | 'success',
  title: string,
  description: React.ReactNode
) => {
  addToast({
    title,
    description,
    color,
    variant: 'solid',
    radius: 'sm',
    timeout: 5000,
  });
};

export function useMergeClusters(docId: string | undefined) {
  const t = useText('clusters');

  // Get collection ID for merge functionality
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;

  // User info for merge functionality
  const { data: session } = useSession();
  const token = session?.accessToken;

  // TRPC hooks for string similarity calcs
  const trpcContext = useTrpcContext();
  const mergeMutation = useMutation('document.mergeClusters');

  const merge = (
    mergePair: MergePair,
    options?: { onSuccess?: () => void }
  ) => {
    if (!collectionId || !docId) {
      spawnToast(
        'danger',
        t('merge.toast.failTitle'),
        t('merge.toast.failMessage')
      );
      return;
    }

    mergeMutation.mutate(
      {
        collectionId,
        docId,
        keepClusterId: mergePair.keep.id,
        mergeAwayClusterId: mergePair.mergeAway.id,
        token,
      },
      {
        onSuccess: () => {
          spawnToast(
            'success',
            t('merge.toast.successTitle'),
            t.tRich('merge.toast.successMessage', {
              source: mergePair.mergeAway.title,
              destination: mergePair.keep.title,
            })
          );

          // Refetch the document
          trpcContext.invalidateQueries(['document.getDocument']);

          options?.onSuccess?.();
        },
        onError: () => {
          spawnToast(
            'danger',
            t('merge.toast.failTitle'),
            t.tRich('merge.toast.failMessageWithClusters', {
              source: mergePair.mergeAway.title,
              destination: mergePair.keep.title,
            })
          );
        },
      }
    );
  };

  return { merge, isMerging: mergeMutation.isLoading };
}
