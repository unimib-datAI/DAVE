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
  animation: 'fadeInOut 5s ease',
  backgroundSize: 'cover',
  '@keyframes fadeInOut': {
    '0%': { opacity: 0, transform: 'translateY(5px)' },
    '10%': { opacity: 1, transform: 'translateY(0)' },
    '90%': { opacity: 1 },
    '100%': { opacity: 1 },
  },
});

const IconWrapper = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '1em',
  fontSize: '16px',
  lineHeight: 1,
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
  const hasSavedRef = useRef<boolean>(false);

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

      // When status changes to 'saved', mark that we've saved
      if (status === 'saved') {
        hasSavedRef.current = true;

        // Also reset hasUnsavedChanges in parent component
        if (hasUnsavedChanges && onRetry) {
          // Use onRetry callback as a general update function with a longer delay
          setTimeout(() => onRetry(), 500);
        }
      }

      // If the status changes from saved to something else, respect that change
      if (prevStatusRef.current === 'saved' && status !== 'saved') {
        hasSavedRef.current = false;
      }
    }

    // If we have unsaved changes, we're no longer in a saved state
    if (hasUnsavedChanges && hasSavedRef.current) {
      hasSavedRef.current = false;
    }
  }, [status, hasUnsavedChanges, onRetry]);

  // Always show when we have a last save time
  // Only hide when idle with no save history
  if (status === 'idle' && !lastSaveTime) {
    return null;
  }

  // Force clean unsaved changes flag when in saved state or if we've saved and nothing has changed
  const effectiveHasUnsavedChanges =
    status === 'saved' || hasSavedRef.current ? false : hasUnsavedChanges;

  // Determine if we should show the saved status
  // Don't show saved status if we have unsaved changes, regardless of hasSavedRef
  const showSavedStatus =
    status === 'saved' || (hasSavedRef.current && !hasUnsavedChanges);

  // Force check for unsaved changes to ensure we don't show saved when there are changes
  const forceCheckChanges = documentVersion !== undefined && hasUnsavedChanges;
  const finalShowSavedStatus = forceCheckChanges ? false : showSavedStatus;

  // Determine status color and icon
  let backgroundColor = 'transparent';
  let textColor = 'inherit';
  let icon = null;
  let tooltipText = '';

  // Show unsaved changes indicator if there are changes and we're not currently saving or saved
  if (effectiveHasUnsavedChanges && status !== 'saving' && status !== 'saved') {
    backgroundColor = '#fff8e6';
    textColor = '#d97706';
    icon = <FiClock size="1em" style={{ verticalAlign: 'middle' }} />;
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
      icon = <FiClock size="1em" style={{ verticalAlign: 'middle' }} />;
      tooltipText = t('toolbar.savingTooltip');
      break;
    case 'saved':
      backgroundColor = '#ebf7f0';
      textColor = '#10b981';
      icon = <FiCheck size="1em" style={{ verticalAlign: 'middle' }} />;
      tooltipText = lastSaveTime
        ? `${t(
            'toolbar.lastSavedAt'
          )} ${lastSaveTime.toLocaleTimeString()} (${lastSaveTime.toLocaleDateString()})`
        : t('toolbar.savedTooltip');

      // If we're technically in idle but should show saved status, override it
      // But only if we don't have unsaved changes
      if (
        status !== 'saved' &&
        hasSavedRef.current &&
        !hasUnsavedChanges &&
        !forceCheckChanges
      ) {
        status = 'saved' as SaveStatusType;
      }

      // We've already handled this with effectiveHasUnsavedChanges
      // Just keep this for extra safety
      const cleanedHasUnsavedChanges = false;

      // Use special container for saved status - stays until new changes
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
      icon = <FiAlertTriangle size="1em" style={{ verticalAlign: 'middle' }} />;
      tooltipText = t('toolbar.errorTooltip');
      break;
    case 'idle':
      backgroundColor = '#f8f8f8';
      textColor = '#666';
      icon = lastSaveTime ? (
        <FiCheck size="1em" style={{ verticalAlign: 'middle' }} />
      ) : (
        <FiSave size="1em" style={{ verticalAlign: 'middle' }} />
      );
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
        {finalShowSavedStatus && <Text size={12}>{t('toolbar.saved')}</Text>}
        {status === 'error' && <Text size={12}>{t('toolbar.saveError')}</Text>}
        {status === 'idle' && !finalShowSavedStatus && lastSaveTime && (
          <Text size={12}>{`${t('toolbar.lastSaved')} ${timeAgo}`}</Text>
        )}
      </StatusContainer>
    </Tooltip>
  );
};

export default SaveStatusIndicator;
