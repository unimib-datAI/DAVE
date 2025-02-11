import { useText } from '@/components';
import { anonimizedNamesAtom } from '@/utils/atoms';
import { useAtom } from 'jotai';
import Switch from 'react-switch';
export function AnonimizeSwitch() {
  //get translations
  const t = useText('document');
  //global status access to anonimization parameter
  const [anonimized, setAnonimized] = useAtom(anonimizedNamesAtom);
  return (
    <div className="flex flex-row items-center gap-1">
      <Switch
        onChange={() => setAnonimized(!anonimized)}
        checked={anonimized}
        uncheckedIcon={false}
        checkedIcon={false}
        onColor="#86d3ff"
        offColor="#f0f0f0"
      />
      <span className="text-sm">{t('subToolbar.anonimize')}</span>
    </div>
  );
}
