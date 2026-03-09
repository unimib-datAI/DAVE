import { removeStopScroll, stopScroll } from '@/utils/shared';
import { useDisclosure } from '@heroui/react';
import { useCallback, useEffect } from 'react';

/**
 * Higher-order hook wrapping HeroUI's useDisclosure, exposing a bindings-style
 * interface compatible with the rest of the codebase.
 */
const useModal = () => {
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();

  const setVisible = useCallback(
    (open: boolean) => {
      if (open) onOpen();
      else onClose();
    },
    [onOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      stopScroll();
    } else {
      removeStopScroll();
    }
  }, [isOpen]);

  return {
    bindings: {
      open: isOpen,
      onClose,
      onOpenChange,
    },
    setVisible,
  };
};

export default useModal;
