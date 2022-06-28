import styled from "@emotion/styled";
import { Button, Col, Divider, Text } from "@nextui-org/react";
import TextAnnotationDetails from "./AnnotationTextDetails";
import AnnotationLinkDetails from "./AnnotationLinkDetails";
import { EditAnnotationModal } from "./EditAnnotationModal";
import useModal from "@/hooks/use-modal";
import { selectCurrentEntityLinkingFeatures, selectDocumentText, useDocumentDispatch, useSelector } from "../DocumentProvider/selectors";
import { EntityAnnotation } from "@/server/routers/document";
import { getCandidateId } from "../DocumentProvider/utils";
import { Flex, IconButton } from "@/components";
import { FiX } from '@react-icons/all-files/fi/FiX';

type AnnotationDetailsProps = {
  annotation: EntityAnnotation;
}

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  // padding: '20px',
  overflowY: 'scroll',
  '::-webkit-scrollbar': {
    height: '4px',
    width: '2px'
  },
  '::-webkit-scrollbar-thumb': {
    background: 'rgba(0,0,0,0.1)'
  }
})

const DetailsContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  gap: '10px',
})

const ButtonContainer = styled.div({
  position: 'sticky',
  bottom: 0,
  marginTop: 'auto',
  display: 'flex',
  flexDirection: 'column',
  background: '#FFF',
  padding: '20px',
  borderRadius: '4px'
})

const AnnotationDetailsContent = ({ annotation }: AnnotationDetailsProps) => {
  const text = useSelector(selectDocumentText);
  const linkingFeatures = useSelector(selectCurrentEntityLinkingFeatures);
  const { setVisible, bindings } = useModal();
  const dispatch = useDocumentDispatch();

  const handleCloseClick = () => {
    dispatch({
      type: 'setUI',
      payload: {
        selectedEntityId: null
      }
    })
  }

  return (
    <>
      <Container>
        <DetailsContainer>
          <Col>
            <Flex direction="row" alignItems="center" justifyContent="space-between">
              <Text b size={18}>Annotation details</Text>
              <IconButton onClick={handleCloseClick}>
                <FiX size={16} />
              </IconButton>
            </Flex>

            <Text css={{ fontSize: '16px', lineHeight: '1', color: 'rgba(0,0,0,0.5)' }}>
              Inspect the details for a selected annotation.
            </Text>
          </Col>
          <Divider />
          <TextAnnotationDetails text={text} annotation={annotation} />
          <AnnotationLinkDetails selectedId={getCandidateId(linkingFeatures?.top_candidate)} candidates={linkingFeatures?.candidates} />
        </DetailsContainer>
        <ButtonContainer>
          <Button onClick={() => setVisible(true)}>Edit</Button>
        </ButtonContainer>
      </Container>
      <EditAnnotationModal setVisible={setVisible} {...bindings} />
    </>
  )
}

export default AnnotationDetailsContent;

