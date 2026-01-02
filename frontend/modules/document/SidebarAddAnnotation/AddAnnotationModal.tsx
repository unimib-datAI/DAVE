// import { Select } from "@/components";
import { useText } from '@/components';
import { BaseSelect, Option } from '@/components/BaseSelect';
import { useForm } from '@/hooks';
import styled from '@emotion/styled';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@heroui/react';
import { ChangeEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  selectDocumentTaxonomy,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';
import { ascend, ParentNode } from '../../../components/Tree';

type SelectColorProps = {
  value: string;
  onChange: (value: string) => void;
};

const Row = styled.div({
  display: 'flex',
  flexDirection: 'row',
  gap: '10px',
});

const SelectContainer = styled.div({
  flexGrow: 1,
});

const ContainerSelectColor = styled.div({
  display: 'flex',
  flexDirection: 'row',
  gap: '10px',
  alignItems: 'center',
});

const ColorSquare = styled.div<{ color: string }>(({ color }) => ({
  width: '30px',
  height: '30px',
  borderRadius: '4px',
  background: color,
  border: '2px solid rgba(0,0,0,0.1)',
}));

/**
 * Select color form
 */
const SelectColor = ({ onChange, value }: SelectColorProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <ContainerSelectColor>
      <ColorSquare color={value} />
      <SelectContainer>
        <Input
          aria-label="Type color"
          fullWidth
          variant="bordered"
          value={value}
          onChange={handleChange}
        />
      </SelectContainer>
    </ContainerSelectColor>
  );
};

type SelectTypeProps = {
  value: string;
  onChange: (value: string) => void;
};

const ContainerSelectType = styled.div({
  display: 'flex',
  flexDirection: 'row',
  gap: '10px',
  alignItems: 'center',
});

/**
 * Select type form
 */
const SelectType = ({ onChange, value: valueProp }: SelectTypeProps) => {
  const t = useText('document');
  const [value, setValue] = useState(valueProp);
  const [checked, setChecked] = useState(false);
  const taxonomy = useSelector(selectDocumentTaxonomy);

  const handleOnChange = (event: MouseEvent, value: string | string[]) => {
    if (Array.isArray(value)) {
      return;
    }
    setValue(value);
    onChange(value);
  };

  const handleCheck = () => {
    setChecked((s) => {
      const newState = !s;
      if (!newState) {
        setValue('');
        onChange('');
      }
      return newState;
    });
  };

  return (
    <ContainerSelectType>
      <Checkbox
        aria-label="Enable sub-type"
        isSelected={checked}
        onChange={handleCheck}
      />
      <span style={{ margin: 0, flexShrink: 0 }}>
        {t('modals.addType.subClassOf')}
      </span>
      <SelectContainer>
        <BaseSelect
          value={value}
          onChange={handleOnChange}
          onTop
          inputProps={{
            'aria-label': 'Type color',
            placeholder: t('modals.addType.parentTypeInput'),
            variant: 'bordered',
            isDisabled: !checked,
          }}
        >
          {Object.values(taxonomy).map((type) => (
            <Option key={type.key} value={type.key} label={type.label}>
              {type.label}
            </Option>
          ))}
        </BaseSelect>
      </SelectContainer>
    </ContainerSelectType>
  );
};

type FormProps = {
  onClose: () => void;
};

type FormState = {
  label: string;
  key: string;
  parent: string;
  color: string;
};

const FormContainer = styled.form({
  display: 'flex',
  flexDirection: 'column',
});

/**
 * Form to add an annotation type
 */
const Form = ({ onClose }: FormProps) => {
  const t = useText('document');
  const { value, register, onSubmit, setValue } = useForm<FormState>({
    label: '',
    key: '',
    parent: '',
    color: '#AA9CFC',
  });
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const dispatch = useDocumentDispatch();

  const { label, key, parent } = value;

  useEffect(() => {
    if (!parent) return;
    const parentNode = ascend(taxonomy, parent) as ParentNode;
    setValue({
      color: parentNode.color,
    });
  }, [taxonomy, parent, dispatch]);

  const handleOnBlurName = () => {
    if (label === '') return;
    if (key !== '') return;
    const typeKey = label.slice(0, 3).toUpperCase();
    setValue({ key: typeKey });
  };

  const handleForm = (data: FormState) => {
    dispatch({
      type: 'addTaxonomyType',
      payload: { type: data },
    });
    onClose();
  };

  return (
    <FormContainer onSubmit={onSubmit(handleForm)}>
      <ModalHeader>
        <div style={{ textAlign: 'left' }}>
          <span style={{ fontWeight: 'bold', fontSize: '18px' }}>
            {t('modals.addType.title')}
          </span>
          <span
            style={{
              color: 'rgba(0,0,0,0.5)',
              lineHeight: 1.1,
              display: 'block',
            }}
          >
            {t('modals.addType.description')}
          </span>
        </div>
      </ModalHeader>
      <ModalBody>
        <Row>
          <Input
            aria-label="Name of the type"
            variant="bordered"
            placeholder={t('modals.addType.typeNameInput')}
            onBlur={handleOnBlurName}
            {...register('label')}
          />
          <Input
            aria-label="Tag of the type"
            variant="bordered"
            placeholder="Tag"
            {...register('key')}
          />
        </Row>
        <SelectType {...register('parent')} />
        <SelectColor {...register('color')} />
      </ModalBody>
      <ModalFooter>
        <Button variant="flat" onPress={onClose}>
          {t('modals.addType.btnCancel')}
        </Button>
        <Button color="primary" type="submit">
          {t('modals.addType.btnConfirm')}
        </Button>
      </ModalFooter>
    </FormContainer>
  );
};

type AddAnnotationModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Modal which contains form to add a type
 */
const AddAnnotationModal = ({ open, onClose }: AddAnnotationModalProps) => {
  return (
    <Modal aria-labelledby="modal-title" isOpen={open} onClose={onClose}>
      <ModalContent>{(onClose) => <Form onClose={onClose} />}</ModalContent>
    </Modal>
  );
};

export default AddAnnotationModal;
