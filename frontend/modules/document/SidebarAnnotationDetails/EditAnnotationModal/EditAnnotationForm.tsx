import { Flex, useText } from '@/components';
import { useForm, useInput } from '@/hooks';
import { Candidate, EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { Button, Input, ModalBody, ModalFooter } from '@heroui/react';
import { FiSearch } from '@react-icons/all-files/fi/FiSearch';
import { Dispatch, SetStateAction, useMemo } from 'react';
import {
  selectDocumentText,
  useDocumentDispatch,
  useSelector,
} from '../../DocumentProvider/selectors';
import EntityContext from '../EntityContext';
import TypesHierarchy from '../TypesHierarchy';
import AddLinkItem from './AddLinkItem';
import LinkList from './LinkList';
import SelectType from './SelectType';

type FormProps = {
  annotation: EntityAnnotation;
  setAnnotation: Dispatch<SetStateAction<EntityAnnotation | undefined>>;
  setVisible: (value: boolean) => void;
};

type FormState = {
  types: string[];
  linkCandidate: {
    url: string;
    title: string;
  };
};

const Form = styled.form({
  display: 'flex',
  flexDirection: 'column',
});

function matchTitleContains(items: Candidate[], value: string) {
  const regex = new RegExp(value, 'i');
  return items.filter((cand) => cand.title.match(regex));
}

const EditAnnotationForm = ({
  annotation,
  setAnnotation,
  setVisible,
}: FormProps) => {
  const t = useText('document');
  const {
    type,
    features: {
      is_nil,
      title,
      url,
      types,
      additional_candidates,
      // linking: {
      //   candidates,
      //   top_candidate
      // } = {}
    },
  } = annotation;
  const resolvedTypes = Array.from(new Set([type, ...(types || [])]));

  const { value, register, onSubmit } = useForm<FormState>({
    types: resolvedTypes,
    linkCandidate: { url, title },
  });
  const { binds: searchBinds } = useInput('');
  const text = useSelector(selectDocumentText);
  const dispatch = useDocumentDispatch();

  const handleSubmit = (data: FormState) => {
    dispatch({
      type: 'editAnnotation',
      payload: {
        annotationId: annotation.id,
        topCandidate: data.linkCandidate,
        types: data.types,
      },
    });
    setVisible(false);
  };

  const filteredCandidates = useMemo(() => {
    if (!additional_candidates) return [];
    return matchTitleContains(additional_candidates, searchBinds.value);
  }, [additional_candidates, searchBinds.value]);

  const tempAnn = {
    ...annotation,
    type: value.types[0],
    features: {
      ...annotation.features,
      types: value.types.slice(1),
    },
  };

  return (
    <Form onSubmit={onSubmit(handleSubmit)}>
      <ModalBody className="px-6 py-0">
        <Flex direction="column" gap="10px">
          <Flex direction="column">
            <span style={{ fontSize: '20px' }}>
              {t('modals.editAnnotation.context')}
            </span>
            {text && <EntityContext text={text} annotation={tempAnn} />}
          </Flex>
          <Flex direction="column">
            <span style={{ fontSize: '20px' }}>
              {t('modals.editAnnotation.type')}
            </span>
            <span style={{ fontSize: '16px', color: 'rgba(0,0,0,0.5)' }}>
              {t('modals.editAnnotation.typeDescription')}
            </span>
          </Flex>
          <SelectType {...register('types')} />
          {value.types.map((type, index) => (
            <Flex key={type} direction="row" alignItems="center" gap="5px">
              <span style={{ fontSize: '11px', fontWeight: 'bold' }}>
                {index + 1}.
              </span>
              <TypesHierarchy type={type} />
            </Flex>
          ))}
          <Flex direction="column">
            <span style={{ fontSize: '20px' }}>
              {t('modals.editAnnotation.links')}
            </span>
            <span style={{ fontSize: '16px', color: 'rgba(0,0,0,0.5)' }}>
              {t('modals.editAnnotation.linksDescription')}
            </span>
          </Flex>

          <Input
            aria-label="Search link"
            placeholder={t('modals.editAnnotation.searchLink')}
            {...searchBinds}
            startContent={<FiSearch />}
          />
          <AddLinkItem
            annotation={annotation}
            setAnnotation={setAnnotation}
            setVisible={setVisible}
          />
          <LinkList
            candidates={filteredCandidates}
            {...register('linkCandidate')}
          />
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="flat"
          onPress={() => setVisible(false)}
          className="bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          {t('modals.editAnnotation.btnCancel')}
        </Button>
        <Button type="submit" color="primary">
          {t('modals.editAnnotation.btnConfirm')}
        </Button>
      </ModalFooter>
    </Form>
  );
};

export default EditAnnotationForm;
