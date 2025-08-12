import { useEffect, useState, useRef } from 'react';
import styled from '@emotion/styled';
import { Text, Tooltip } from '@nextui-org/react';
import { FiCheck } from '@react-icons/all-files/fi/FiCheck';
import { FiAlertTriangle } from '@react-icons/all-files/fi/FiAlertTriangle';
import { FiClock } from '@react-icons/all-files/fi/FiClock';
import { FiSave } from '@react-icons/all-files/fi/FiSave';
import { useText } from '@/components';

// Define styled components
const StatusContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.8rem',
  cursor: 'default',
  transition: 'all 0.2s ease',
  animation: 'none',
});

const SuccessStatusContainer = styled(StatusContainer)({
  animation: 'fadeInOut 2s ease',
  '@keyframes fadeInOut': {
    '0%': { opacity: 0, transform: 'translateY(5px)' },
    '20%': { opacity: 1, transform: 'translateY(0)' },
    '80%': { opacity: 1 },
    '100%': { opacity: 0.8 },
  },
});

const IconWrapper = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

type SaveStatusType = 'idle' | 'saving' | 'saved' | 'error';

type SaveStatusIndicatorProps = {
  status: SaveStatusType;
  lastSaveTime: Date | null;
  onRetry?: () => void;
  hasUnsavedChanges?: boolean;
  documentVersion?: number; // Add version to force re-render when needed
};

const SaveStatusIndicator = ({
  status,
  lastSaveTime,
  onRetry,
  hasUnsavedChanges = false,
  documentVersion,
}: SaveStatusIndicatorProps) => {
  const t = useText('document');
  const [timeAgo, setTimeAgo] = useState<string>('');
  const prevStatusRef = useRef<SaveStatusType>(status);

  // Update time ago string every minute
  useEffect(() => {
    if (!lastSaveTime) return;

    const updateTimeAgo = () => {
      const now = new Date();
      const diff = now.getTime() - lastSaveTime.getTime();

      // Convert time difference to human-readable format
      if (diff < 60000) {
        setTimeAgo(t('toolbar.justNow'));
      } else if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        setTimeAgo(
          `${minutes} ${
            minutes === 1 ? t('toolbar.minuteAgo') : t('toolbar.minutesAgo')
          }`
        );
      } else if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        setTimeAgo(
          `${hours} ${
            hours === 1 ? t('toolbar.hourAgo') : t('toolbar.hoursAgo')
          }`
        );
      } else {
        const days = Math.floor(diff / 86400000);
        setTimeAgo(
          `${days} ${days === 1 ? t('toolbar.dayAgo') : t('toolbar.daysAgo')}`
        );
      }
    };

    // Update immediately and then every minute
    updateTimeAgo();
    const intervalId = setInterval(updateTimeAgo, 60000);

    return () => clearInterval(intervalId);
  }, [lastSaveTime, t, documentVersion]);

  // Track status changes for debugging
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      console.log(`Status changed: ${prevStatusRef.current} -> ${status}`);
      prevStatusRef.current = status;
    }
  }, [status]);

  // Always show when we have a last save time
  // Only hide when idle with no save history
  if (status === 'idle' && !lastSaveTime) {
    return null;
  }

  // Determine status color and icon
  let backgroundColor = 'transparent';
  let textColor = 'inherit';
  let icon = null;
  let tooltipText = '';

  // Show unsaved changes indicator if there are changes and we're not currently saving
  if (hasUnsavedChanges && status !== 'saving' && status !== 'saved') {
    backgroundColor = '#fff8e6';
    textColor = '#d97706';
    icon = <FiClock />;
    tooltipText = t('toolbar.unsavedChanges');

    return (
      <Tooltip content={tooltipText} placement="bottom">
        <StatusContainer style={{ backgroundColor, color: textColor }}>
          <IconWrapper>{icon}</IconWrapper>
          <Text size={12}>{t('toolbar.unsavedChanges')}</Text>
        </StatusContainer>
      </Tooltip>
    );
  }

  switch (status) {
    case 'saving':
      backgroundColor = '#f0f0f0';
      textColor = '#666';
      icon = <FiClock />;
      tooltipText = t('toolbar.savingTooltip');
      break;
    case 'saved':
      backgroundColor = '#ebf7f0';
      textColor = '#10b981';
      icon = <FiCheck />;
      tooltipText = lastSaveTime
        ? `${t(
            'toolbar.lastSavedAt'
          )} ${lastSaveTime.toLocaleTimeString()} (${lastSaveTime.toLocaleDateString()})`
        : t('toolbar.savedTooltip');

      // Use special container for saved status
      return (
        <Tooltip content={tooltipText} placement="bottom">
          <SuccessStatusContainer style={{ backgroundColor, color: textColor }}>
            <IconWrapper>{icon}</IconWrapper>
            <Text size={12} b>
              {t('toolbar.saved')}
            </Text>
          </SuccessStatusContainer>
        </Tooltip>
      );
    case 'error':
      backgroundColor = '#fef2f2';
      textColor = '#ef4444';
      icon = <FiAlertTriangle />;
      tooltipText = t('toolbar.errorTooltip');
      break;
    case 'idle':
      backgroundColor = '#f8f8f8';
      textColor = '#666';
      icon = lastSaveTime ? <FiCheck /> : <FiSave />;
      tooltipText = lastSaveTime
        ? `${t(
            'toolbar.lastSavedAt'
          )} ${lastSaveTime.toLocaleTimeString()} (${lastSaveTime.toLocaleDateString()})`
        : '';
      break;
  }

  return (
    <Tooltip content={tooltipText} placement="bottom">
      <StatusContainer
        style={{ backgroundColor, color: textColor }}
        onClick={status === 'error' && onRetry ? onRetry : undefined}
      >
        <IconWrapper>{icon}</IconWrapper>
        {status === 'saving' && <Text size={12}>{t('toolbar.saving')}</Text>}
        {status === 'saved' && <Text size={12}>{t('toolbar.saved')}</Text>}
        {status === 'error' && <Text size={12}>{t('toolbar.saveError')}</Text>}
        {status === 'idle' && lastSaveTime && (
          <Text size={12}>{`${t('toolbar.lastSaved')} ${timeAgo}`}</Text>
        )}
      </StatusContainer>
    </Tooltip>
  );
};

export default SaveStatusIndicator;
