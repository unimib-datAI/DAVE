import { forEachElement, removeStopScroll, stopScroll } from '@/utils/shared';
import { useDisclosure } from '@heroui/react';
import { useCallback, useEffect } from 'react';

/**
 * Higher order hook which uses the useModal hook from NextUI so that I can apply additional props to the body.
 */
const useModal = () => {
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();

  // Create a compatible object structure that matches the old useModal API
  const modalProps = {
    isOpen,
    onOpenChange,
    bindings: {
      open: isOpen,
      onClose,
    },
    setVisible: (visible: boolean) => {
      if (visible) {
        onOpen();
      } else {
        onClose();
      }
    },
  };

  useEffect(() => {
    // I do this in the useEffect otherswise properties are overwritten
    // setTimeout(() => {
    if (isOpen) {
      stopScroll();
    } else {
      // console.log(modalProps.bindings)
      removeStopScroll();
    }
    // }, 0)
  }, [isOpen]);

  return modalProps;
};

export default useModal;
