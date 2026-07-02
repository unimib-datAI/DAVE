import { useAtom, useAtomValue } from 'jotai';
import { uploadModalOpenAtom, uploadJobsMapAtom } from '@/atoms/uploadJobs';
import styled from '@emotion/styled';
import { Spinner } from '@heroui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { isTerminalStatus } from '@/lib/upload/types';

const IndicatorContainer = styled(motion.div)({
  position: 'fixed',
  bottom: '2rem',
  right: '2rem',
  backgroundColor: 'white',
  padding: '1rem 1.5rem',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  display: 'flex',
  alignItems: 'center',
  gap: '1rem',
  zIndex: 9999,
  cursor: 'pointer',
  transition: 'transform 0.2s',
  '&:hover': {
    transform: 'scale(1.05)',
  },
});

const IndicatorText = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
});

const IndicatorTitle = styled.span({
  fontWeight: 600,
  fontSize: '0.875rem',
  color: '#333',
});

const IndicatorSubtitle = styled.span({
  fontSize: '0.75rem',
  color: '#666',
});

export const UploadProgressIndicator = () => {
  const jobsMap = useAtomValue(uploadJobsMapAtom);
  const [isModalOpen, setIsModalOpen] = useAtom(uploadModalOpenAtom);

  const activeJobs = Object.values(jobsMap).filter(
    (job) => !isTerminalStatus(job.status)
  );

  const totals = activeJobs.reduce(
    (acc, job) => {
      acc.total += job.statistics.total;
      acc.completed += job.statistics.completed;
      acc.failed += job.statistics.failed;
      return acc;
    },
    { total: 0, completed: 0, failed: 0 }
  );

  const showIndicator = activeJobs.length > 0 && !isModalOpen;

  const handleClick = () => {
    setIsModalOpen(true);
  };

  return (
    <AnimatePresence>
      {showIndicator && (
        <IndicatorContainer
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          onClick={handleClick}
        >
          <Spinner size="sm" />
          <IndicatorText>
            <IndicatorTitle>
              Uploading documents{activeJobs.length > 1 ? ` (${activeJobs.length} jobs)` : ''}…
            </IndicatorTitle>
            <IndicatorSubtitle>
              {totals.completed} of {totals.total} completed
              {totals.failed > 0 && ` (${totals.failed} failed)`}
            </IndicatorSubtitle>
          </IndicatorText>
        </IndicatorContainer>
      )}
    </AnimatePresence>
  );
};

export default UploadProgressIndicator;
