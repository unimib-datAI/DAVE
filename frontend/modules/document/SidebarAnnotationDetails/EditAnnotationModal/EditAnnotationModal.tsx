import { useText } from '@/components';
import { useDraftState } from '@/hooks';
import { Modal, ModalContent, ModalHeader } from '@heroui/react';
import { selectCurrentEntity } from '../../DocumentProvider/selectors';
import EditAnnotationForm from './EditAnnotationForm';

type EditModalProps = {
  setVisible: (value: boolean) => void;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
};

const EditAnnotationModal = ({
  setVisible,
  open,
  onClose,
  onOpenChange,
}: EditModalProps) => {
  const t = useText('document');
  const [annotation, setAnnotation] = useDraftState(selectCurrentEntity);

  if (!annotation) return null;

  return (
    <Modal
      size="3xl"
      scrollBehavior="inside"
      aria-labelledby="edit-entity-modal"
      isOpen={open ?? false}
      onClose={onClose}
      onOpenChange={onOpenChange}
      isDismissable={false}
      classNames={{ wrapper: 'z-[1001]', backdrop: 'z-[1001]' }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>
              <h2 style={{ margin: 0, fontSize: 24 }}>
                {t('modals.editAnnotation.title')}
              </h2>
            </ModalHeader>
            <EditAnnotationForm
              annotation={annotation}
              setAnnotation={setAnnotation}
              setVisible={setVisible}
            />
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default EditAnnotationModal;
