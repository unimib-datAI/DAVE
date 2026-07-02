/**
 * Notification System Component
 * Displays upload notifications and progress for active jobs
 */

import React, { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import styled from '@emotion/styled';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCheckCircle } from '@react-icons/all-files/fi/FiCheckCircle';
import { FiAlertCircle } from '@react-icons/all-files/fi/FiAlertCircle';
import { FiXCircle } from '@react-icons/all-files/fi/FiXCircle';
import { uploadNotificationsAtom } from '@/atoms/uploadJobs';

const NotificationContainer = styled(motion.div)<{ type: string }>(
  (props) => ({
    position: 'fixed',
    top: '2rem',
    right: '2rem',
    maxWidth: '400px',
    backgroundColor: 'white',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    borderLeft: `4px solid ${
      props.type === 'success'
        ? '#22c55e'
        : props.type === 'error'
        ? '#ef4444'
        : props.type === 'warning'
        ? '#f59e0b'
        : '#3b82f6'
    }`,
    zIndex: 10000,
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
  })
);

const NotificationIcon = styled.div<{ type: string }>((props) => ({
  fontSize: '1.25rem',
  color:
    props.type === 'success'
      ? '#22c55e'
      : props.type === 'error'
      ? '#ef4444'
      : props.type === 'warning'
      ? '#f59e0b'
      : '#3b82f6',
  flexShrink: 0,
}));

const NotificationContent = styled.div({
  flex: 1,
  minWidth: 0,
});

const NotificationTitle = styled.div({
  fontWeight: 600,
  fontSize: '0.875rem',
  color: '#1f2937',
  marginBottom: '0.25rem',
});

const NotificationMessage = styled.div({
  fontSize: '0.75rem',
  color: '#6b7280',
  wordWrap: 'break-word',
});

const NotificationStack = styled.div({
  position: 'fixed',
  top: '2rem',
  right: '2rem',
  zIndex: 10000,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  pointerEvents: 'none',
  '& > *': {
    pointerEvents: 'auto',
  },
});

interface NotificationItemProps {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  onRemove: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  id,
  title,
  message,
  type,
  duration = 3000,
  onRemove,
}) => {
  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => onRemove(id), duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onRemove]);

  const iconMap = {
    success: <FiCheckCircle />,
    error: <FiXCircle />,
    warning: <FiAlertCircle />,
    info: <FiAlertCircle />,
  };

  return (
    <NotificationContainer
      type={type}
      initial={{ opacity: 0, y: -20, x: 20 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, y: -20, x: 20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
    >
      <NotificationIcon type={type}>{iconMap[type]}</NotificationIcon>
      <NotificationContent>
        <NotificationTitle>{title}</NotificationTitle>
        <NotificationMessage>{message}</NotificationMessage>
      </NotificationContent>
    </NotificationContainer>
  );
};

export const UploadNotificationCenter: React.FC = () => {
  const [notifications, setNotifications] = useAtom(uploadNotificationsAtom);
  const [displayedNotifications, setDisplayedNotifications] = useState(
    notifications
  );

  useEffect(() => {
    setDisplayedNotifications(notifications);
  }, [notifications]);

  const handleRemoveNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setDisplayedNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <NotificationStack>
      <AnimatePresence>
        {displayedNotifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            id={notification.id}
            title={notification.title}
            message={notification.message}
            type={notification.type}
            duration={notification.duration}
            onRemove={() => handleRemoveNotification(notification.id)}
          />
        ))}
      </AnimatePresence>
    </NotificationStack>
  );
};

export default UploadNotificationCenter;
