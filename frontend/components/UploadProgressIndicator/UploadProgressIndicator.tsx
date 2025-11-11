import { useAtom } from 'jotai';
import { uploadProgressAtom, uploadModalOpenAtom } from '@/atoms/upload';
import styled from '@emotion/styled';
import { Loading } from '@nextui-org/react';
import { AnimatePresence, motion } from 'framer-motion';

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
  const [uploadProgress] = useAtom(uploadProgressAtom);
  const [isModalOpen, setIsModalOpen] = useAtom(uploadModalOpenAtom);

  const showIndicator = uploadProgress.isUploading && !isModalOpen;

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
          <Loading size="sm" />
          <IndicatorText>
            <IndicatorTitle>Uploading documents...</IndicatorTitle>
            <IndicatorSubtitle>
              {uploadProgress.completed} of {uploadProgress.total} completed
              {uploadProgress.failed > 0 && ` (${uploadProgress.failed} failed)`}
            </IndicatorSubtitle>
          </IndicatorText>
        </IndicatorContainer>
      )}
    </AnimatePresence>
  );
};

export default UploadProgressIndicator;
