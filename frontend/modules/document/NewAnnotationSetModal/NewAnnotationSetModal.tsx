import { Flex, useText } from '@/components';
import { BaseSelect, Option } from '@/components/BaseSelect';
import { useForm } from '@/hooks';
import styled from '@emotion/styled';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import {
  selectAllEntityAnnotationSets,
  selectNewAnnotationModalOpen,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';

const FormContainer = styled.form({
  display: 'flex',
  flexDirection: 'column',
});

type FormState = {
  name: string;
  preset: string;
};

type FormProps = {
  onClose: () => void;
};

const Form = ({ onClose }: FormProps) => {
  const t = useText('document');
  const annotationSets = useSelector(selectAllEntityAnnotationSets);
  const dispatch = useDocumentDispatch();

  const { value, register, onSubmit } = useForm<FormState>({
    name: '',
    preset: '',
  });

  const renderItems = () => {
    return annotationSets.map((item) => {
      const [key, ...rest] = item.name.split('_');
      const annotationName = rest.join('_');

      return (
        <Option key={item.name} value={item.name} label={annotationName}>
          {annotationName}
        </Option>
      );
    });
  };

  const handleSubmit = (formValues: FormState) => {
    dispatch({
      type: 'createAnnotationSet',
      payload: formValues,
    });
    onClose();
  };

  return (
    <FormContainer onSubmit={onSubmit(handleSubmit)}>
      <ModalBody className="pt-2 pb-2">
        <Input
          {...register('name')}
          variant="bordered"
          label={t('modals.addAnnotationSet.nameInput')}
        />
        <BaseSelect
          {...register('preset')}
          onTop
          inputProps={{ label: t('modals.addAnnotationSet.presetInput') }}
        >
          <Option value="" label="Empty (without pre-existing annotations)">
            Empty (without pre-existing annotations)
          </Option>
          {renderItems()}
        </BaseSelect>
      </ModalBody>
      <ModalFooter>
        <Button
          size="sm"
          variant="flat"
          onPress={onClose}
          className="bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          color="primary"
          isDisabled={value.name === ''}
        >
          Create
        </Button>
      </ModalFooter>
    </FormContainer>
  );
};

const NewAnnotationSetModal = () => {
  const t = useText('document');
  const isOpen = useSelector(selectNewAnnotationModalOpen);
  const dispatch = useDocumentDispatch();

  const closeModal = () => {
    dispatch({
      type: 'setUI',
      payload: {
        newAnnotationModalOpen: false,
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              <Flex>
                <span id="modal-title" style={{ fontSize: '18px' }}>
                  {t('modals.addAnnotationSet.title')}
                </span>
                <span
                  id="modal-title"
                  style={{
                    fontSize: '16px',
                    color: 'rgba(0,0,0,0.5)',
                    textAlign: 'left',
                    lineHeight: 1.2,
                  }}
                >
                  {t('modals.addAnnotationSet.description')}
                </span>
              </Flex>
            </ModalHeader>
            <Form onClose={onClose} />
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default NewAnnotationSetModal;
