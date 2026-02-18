import { useAtom } from 'jotai';
import {
  globalAnonymizationAtom,
  isLoadingAnonymizationAtom,
} from '@/utils/atoms';
import { Eye, EyeOff } from 'lucide-react';
import { Loading } from '@nextui-org/react';

export function GlobalAnonymizationToggle() {
  const [isAnonymized, setIsAnonymized] = useAtom(globalAnonymizationAtom);
  const [isLoading] = useAtom(isLoadingAnonymizationAtom);

  const handleToggle = () => {
    if (isLoading) return;
    setIsAnonymized(!isAnonymized);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
        !isAnonymized
          ? 'bg-blue-50 border-blue-300 text-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      } cursor-pointer`}
      title={
        isLoading
          ? 'Processing anonymization...'
          : !isAnonymized
          ? 'Hide real names (show anonymized)'
          : 'Show real names (de-anonymize)'
      }
    >
      {isLoading ? (
        <Loading size="xs" />
      ) : !isAnonymized ? (
        <Eye size={18} />
      ) : (
        <EyeOff size={18} />
      )}
    </button>
  );
}
