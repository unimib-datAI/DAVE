import { Annotation } from '@/lib/ner/core/types';
import {
  AdditionalAnnotationProps,
  Candidate,
} from '@/server/routers/document';
import styled from '@emotion/styled';
import { Accordion, AccordionItem, Link } from '@heroui/react';
import { useMemo } from 'react';

type AnnotationLinkDetailsProps = {
  annotationFeatures:
    | Annotation<AdditionalAnnotationProps>['features']
    | undefined;
};

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});

const Section = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

const List = styled(Container)({
  gap: '5px',
});

const ListItemContainer = styled.div({
  display: 'flex',
  flexDirection: 'row',
  gap: '5px',
  // alignItems: 'center'
});

const ListItemContent = styled.div({
  display: 'flex',
  flexDirection: 'column',
});

type ListAdditionalCandidatesProps = {
  candidates: Candidate[];
};

const ListAdditionalCandidates = ({
  candidates,
}: ListAdditionalCandidatesProps) => {
  return (
    <Accordion>
      <AccordionItem
        key="additional-candidates"
        title={<span style={{ fontSize: '15px' }}>{`Altri candidati`}</span>}
        classNames={{
          base: 'p-0',
          title: 'py-2',
        }}
      >
        <List>
          {candidates.map((candidate, index) => (
            <ListItemContainer key={candidate.url}>
              <span>{index + 1}.</span>
              <ListItemContent>
                <span>{candidate.title}</span>
                <span
                  style={{
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <Link href={candidate.url} target="_blank">
                    {candidate.url}
                  </Link>
                </span>
              </ListItemContent>
            </ListItemContainer>
          ))}
        </List>
      </AccordionItem>
    </Accordion>
  );
};

const AnnotationLinkDetails = ({
  annotationFeatures,
}: AnnotationLinkDetailsProps) => {
  const candidates = useMemo(() => {
    if (
      !annotationFeatures ||
      !annotationFeatures.additional_candidates ||
      annotationFeatures.additional_candidates.length === 0
    ) {
      return null;
    }
    return annotationFeatures.additional_candidates.filter(
      (candidate) => candidate.url !== annotationFeatures.url
    );
  }, [annotationFeatures]);

  if (!annotationFeatures) {
    return null;
  }

  const isNil = () => {
    let isNil = false;
    if (annotationFeatures.is_nil === undefined) {
      if (
        annotationFeatures.linking &&
        annotationFeatures.linking.is_nil !== undefined
      ) {
        isNil = annotationFeatures.linking.is_nil;
      }
    } else {
      isNil = annotationFeatures.is_nil;
    }

    return isNil;
  };

  return (
    <Container>
      <span style={{ fontSize: '15px', fontWeight: 'bold' }}>
        Informazioni Links
      </span>
      <Section>
        {isNil() ? (
          <blockquote
            style={{
              fontSize: '14px',
              padding: '10px',
              margin: '0',
              background: '#fdf7d5',
            }}
          >
            {`L'annotazione è stata riconsociuta come una nuova entità non presente nella base di conoscenza.`}
          </blockquote>
        ) : (
          <>
            <span>{annotationFeatures.title}</span>
            <span style={{ fontSize: '12px' }}>
              <Link href={annotationFeatures.url} target="_blank">
                {annotationFeatures.url}
              </Link>
            </span>
          </>
        )}
      </Section>
      <Section>
        {candidates && <ListAdditionalCandidates candidates={candidates} />}
      </Section>
    </Container>
  );
};

export default AnnotationLinkDetails;
