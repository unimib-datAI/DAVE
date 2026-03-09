import useModal from '@/hooks/use-modal';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@heroui/react';
import { ReactNode, useCallback, useState } from 'react';

type ConfirmationDialogProps = {
  open?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
  content: ReactNode;
  onConfirm?: () => void;
};

type UseConfirmationDialogProps<T> = {
  props?: T;
};

type SetVisibleParams<T> = {
  open: boolean;
  props?: T;
};

export function useConfirmationDialog<T>() {
  const { bindings, setVisible: setVisibleProp } = useModal();
  const [props, setProps] = useState<UseConfirmationDialogProps<T>>();

  const setVisible = useCallback(
    (params: SetVisibleParams<T>) => {
      const { open, props } = params;
      setVisibleProp(open);
      if (props) setProps({ props });
    },
    [setVisibleProp]
  );

  return {
    bindings,
    setVisible,
    props,
  };
}

const ConfirmationDialog = ({
  content,
  onConfirm,
  open,
  isOpen: isOpenProp,
  onClose,
  onOpenChange,
}: ConfirmationDialogProps) => {
  const isOpen = open ?? isOpenProp ?? false;
  return (
    <Modal isOpen={isOpen} onClose={onClose} onOpenChange={onOpenChange}>
      <ModalContent>
        {(closeModal) => (
          <>
            <ModalHeader>
              <strong style={{ fontSize: 18 }}>Confirm</strong>
            </ModalHeader>
            <ModalBody>
              <span>{content}</span>
            </ModalBody>
            <ModalFooter style={{ justifyContent: 'space-between' }}>
              <Button size="sm" variant="light" onPress={onClose ?? closeModal}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="shadow"
                color="danger"
                onPress={onConfirm}
              >
                Delete
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default ConfirmationDialog;
