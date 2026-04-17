import { useAtom } from 'jotai';
import {
  globalAnonymizationAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { Eye, EyeOff } from 'lucide-react';
import { Spinner } from '@heroui/react';
import { useAnonymizationPermissions } from '@/hooks/use-permissions';

export function GlobalAnonymizationToggle() {
  const [isAnonymized, setIsAnonymized] = useAtom(globalAnonymizationAtom);
  const [isLoading] = useAtom(isLoadingAnonymizationAtom);

  // Permission check: if user is not allowed to use anonymization features
  const { canToggle } = useAnonymizationPermissions();

  // Consider control disabled if anonymization is loading or the user lacks permission
  const isDisabled = isLoading || !canToggle;

  const handleToggle = () => {
    if (isDisabled) return;
    setIsAnonymized(!isAnonymized);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isDisabled}
      className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
        !isAnonymized
          ? 'bg-blue-50 border-blue-300 text-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      title={
        isLoading
          ? 'Processing anonymization...'
          : !canToggle
          ? 'You do not have permission to toggle anonymization'
          : !isAnonymized
          ? 'Hide real names (show anonymized)'
          : 'Show real names (de-anonymize)'
      }
    >
      {isLoading ? (
        <Spinner size="sm" />
      ) : !isAnonymized ? (
        <Eye size={18} />
      ) : (
        <EyeOff size={18} />
      )}
    </button>
  );
}
