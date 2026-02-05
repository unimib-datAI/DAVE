import { useAtom } from 'jotai';
import { globalAnonymizationAtom } from '@/utils/atoms';
import { Eye, EyeOff } from 'lucide-react';

export function GlobalAnonymizationToggle() {
  const [isAnonymized, setIsAnonymized] = useAtom(globalAnonymizationAtom);

  const handleToggle = () => {
    setIsAnonymized(!isAnonymized);
  };

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${
        !isAnonymized
          ? 'bg-blue-50 border-blue-300 text-blue-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      } cursor-pointer`}
      title={
        !isAnonymized
          ? 'Hide real names (show anonymized)'
          : 'Show real names (de-anonymize)'
      }
    >
      {!isAnonymized ? <Eye size={18} /> : <EyeOff size={18} />}
    </button>
  );
}
