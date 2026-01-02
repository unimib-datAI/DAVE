import useModal from '@/hooks/use-modal';
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalProps,
} from '@heroui/react';
import { ReactNode, useCallback, useState } from 'react';

type ConfirmationDialogProps = ModalProps & {
  content: ReactNode;
  onConfirm?: () => void;
};

type UseConfirmationDialogProps<T> = {
  // open: boolean;
  props?: T;
};

type SetVisibleParams<T> = {
  open: boolean;
  props?: T;
};

export function useConfirmationDialog<T>() {
  const {
    bindings: { open, ...binds },
    setVisible: setVisibleProp,
    ...rest
  } = useModal();

  const [props, setProps] = useState<UseConfirmationDialogProps<T>>();

  const setVisible = useCallback(
    (params: SetVisibleParams<T>) => {
      const { open, props } = params;
      setVisibleProp(open);
      if (props) setProps(props);
    },
    [setVisibleProp]
  );

  return {
    bindings: {
      open,
      ...binds,
    },
    setVisible,
    props,
    ...rest,
  };
}

const ConfirmationDialog = ({
  content,
  onConfirm,
  ...props
}: ConfirmationDialogProps) => {
  return (
    <Modal {...props}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <span className="text-lg font-semibold">Confirm</span>
            </ModalHeader>
            <ModalBody>
              <p>{content}</p>
            </ModalBody>
            <ModalFooter className="flex justify-between items-center">
              <Button size="sm" variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                color="danger"
                onPress={() => {
                  onConfirm?.();
                  onClose();
                }}
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
