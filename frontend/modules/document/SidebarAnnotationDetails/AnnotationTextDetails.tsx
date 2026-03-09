import { Flex, useText } from '@/components';
import { EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { scrollEntityIntoView } from '../DocumentProvider/utils';
import EntityContext from './EntityContext';
import TypesHierarchy from './TypesHierarchy';
import { useAtom } from 'jotai';
import { anonimizedNamesAtom } from '@/utils/atoms';

type TextAnnotationDetails = {
  text: string;
  annotation: EntityAnnotation;
};

const TextAnnotationDetailsContainer = styled.button({
  textAlign: 'left',
  border: 'none',
  outline: 'none',
  padding: '5px',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'background 250ms ease-out',
  background: 'rgba(0,0,0,0.04)',
  '&:hover': {
    background: 'rgba(0,0,0,0.06)',
  },
});

const TextAnnotationDetails = ({ text, annotation }: TextAnnotationDetails) => {
  const t = useText('document');
  const types_set = new Set(annotation.features.types || []);
  types_set.add(annotation.type);
  const types = Array.from(types_set);

  return (
    <>
      <strong style={{ fontSize: '15px' }}>
        {t('rightSidebar.entityContext')}
      </strong>
      <TextAnnotationDetailsContainer
        onClick={() => scrollEntityIntoView(annotation.id)}
      >
        <EntityContext text={text} annotation={annotation} />
      </TextAnnotationDetailsContainer>
      <strong style={{ fontSize: '15px' }}>
        {t('rightSidebar.typeHierarchy')}
      </strong>
      {types.map((type, index) => (
        <Flex key={type} direction="row" alignItems="center" gap="5px">
          <strong style={{ fontSize: '11px' }}>{index + 1}.</strong>
          <TypesHierarchy type={type} />
        </Flex>
      ))}
    </>
  );
};

export default TextAnnotationDetails;
