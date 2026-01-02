import { useText } from '@/components';
import { useDraftState } from '@/hooks';
import { ModalProps, Modal, ModalContent, ModalHeader } from '@heroui/react';
import { selectCurrentEntity } from '../../DocumentProvider/selectors';
import EditAnnotationForm from './EditAnnotationForm';

type EditModalProps = ModalProps & {
  setVisible: (value: boolean) => void;
};

const EditAnnotationModal = ({ setVisible, ...props }: EditModalProps) => {
  const t = useText('document');
  const [annotation, setAnnotation] = useDraftState(selectCurrentEntity);

  if (!annotation) {
    return null;
  }

  return (
    <Modal
      scrollBehavior="inside"
      size="2xl"
      aria-labelledby="edit-entity-modal"
      classNames={{
        wrapper: 'max-h-full',
      }}
      {...props}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              <span style={{ fontSize: '24px' }}>
                {t('modals.editAnnotation.title')}
              </span>
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
