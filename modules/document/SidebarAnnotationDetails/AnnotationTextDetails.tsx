import { EntityAnnotation } from "@/server/routers/document";
import styled from "@emotion/styled";
import { Text } from "@nextui-org/react";
import { selectDocumentCallbacks, useSelector } from "../DocumentProvider/selectors";
import EntityContext from "./EntityContext";
import TypesHierarchy from "./TypesHierarchy";

type TextAnnotationDetails = {
  text: string;
  annotation: EntityAnnotation;
}

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
    background: 'rgba(0,0,0,0.06)'
  }
})


const TextAnnotationDetails = ({ text, annotation }: TextAnnotationDetails) => {
  const { scrollEntityIntoView } = useSelector(selectDocumentCallbacks);

  return (
    <>
      <Text size={15} b>Enity context</Text>
      <TextAnnotationDetailsContainer onClick={() => scrollEntityIntoView(annotation.id)}>
        <EntityContext text={text} annotation={annotation} />
      </TextAnnotationDetailsContainer>
      <Text size={15} b>Type hierarchy</Text>
      <TypesHierarchy type={annotation.type} />
    </>

  )
}

export default TextAnnotationDetails;