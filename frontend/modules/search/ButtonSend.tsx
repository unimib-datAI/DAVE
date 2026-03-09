import { ButtonProps as HeroButtonProps, Button, Spinner } from '@heroui/react';
import { useText } from '@/components/TranslationProvider';

type ButtonSendProps = HeroButtonProps & {
  state: 'searching' | 'generating' | 'idle';
};

const ButtonSend = ({ state, children, ...props }: ButtonSendProps) => {
  const t = useText('chat');
  const disabled = state === 'generating' || state === 'searching';

  const renderBtnContent = () => {
    if (state === 'searching') {
      return (
        <span className="flex flex-row items-center gap-2">
          {t('searchingDocuments')}
          <Spinner color="current" size="sm" />
        </span>
      );
    }

    if (state === 'generating') {
      return (
        <span className="flex flex-row items-center gap-2">
          {t('generating')}
          <Spinner color="current" size="sm" />
        </span>
      );
    }

    return children;
  };

  return (
    <Button isDisabled={disabled} {...(props as any)}>
      {renderBtnContent()}
    </Button>
  );
};

export { ButtonSend };
