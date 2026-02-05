import { useText } from '@/components';
import { globalAnonymizationAtom } from '@/utils/atoms';
import { useAtom } from 'jotai';
import Switch from 'react-switch';
export function AnonimizeSwitch() {
  //get translations
  const t = useText('document');
  // global anonymization state (true = anonymized)
  const [isAnonymized, setIsAnonymized] = useAtom(globalAnonymizationAtom);
  return (
    <div className="flex flex-row items-center gap-1">
      <Switch
        onChange={() => setIsAnonymized(!isAnonymized)}
        checked={isAnonymized}
        uncheckedIcon={false}
        checkedIcon={false}
        onColor="#86d3ff"
        offColor="#f0f0f0"
      />
      <span className="text-sm">{t('subToolbar.anonimize')}</span>
    </div>
  );
}
