import { Flex, useText } from '@/components';
import styled from '@emotion/styled';
import { Button } from "@heroui/react";
import { Dispatch, SetStateAction } from 'react';
import { FiPlus } from '@react-icons/all-files/fi/FiPlus';
import AddCandidateForm from './AddCandidateForm';
import { useToggle } from '@/hooks';
import { EntityAnnotation } from '@/server/routers/document';

type AddLinkItemProps = {
  annotation: EntityAnnotation;
  setAnnotation: Dispatch<SetStateAction<EntityAnnotation | undefined>>;
  setVisible: (value: boolean) => void;
};

const Container = styled.div({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
});

const AddLinkItem = ({
  annotation,
  setAnnotation,
  setVisible,
}: AddLinkItemProps) => {
  const t = useText('document');
  const [formVisible, toggleFormVisibility] = useToggle(false);

  return (
    <Flex direction="column" gap="5px">
      <Container>
        <Button
          auto
          icon={<FiPlus size="20px" />}
          onClick={() => toggleFormVisibility()}
        >
          {t('modals.editAnnotation.addCandidate.btn')}
        </Button>
      </Container>
      {formVisible && (
        <AddCandidateForm
          annotation={annotation}
          setAnnotation={setAnnotation}
          setVisible={toggleFormVisibility}
        />
      )}
    </Flex>
  );
};

export default AddLinkItem;
