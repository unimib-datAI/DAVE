import { useText } from '@/components';
import { useDocumentContext } from '../DocumentProvider/selectors';
import { useSelector } from '../DocumentProvider/selectors';
import { selectDocumentData } from '../DocumentProvider/selectors';
import { IconButton } from '@/components';

export function DeAnonimizeButton() {
  const t = useText('document');
  const { deAnonimize, setDeAnonimize } = useDocumentContext();
  const document = useSelector(selectDocumentData);

  if (!document.features?.anonymized) {
    return null;
  }

  return (
    <IconButton
      onClick={() => setDeAnonimize(!deAnonimize)}
      title={
        deAnonimize ? t('subToolbar.anonimize') : t('subToolbar.deAnonimize')
      }
      style={{ opacity: deAnonimize ? 1 : 0.6 }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    </IconButton>
  );
}
