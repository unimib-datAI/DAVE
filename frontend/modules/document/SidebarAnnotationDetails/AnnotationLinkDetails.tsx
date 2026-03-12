import { Annotation } from '@/lib/ner/core/types';
import {
  AdditionalAnnotationProps,
  Candidate,
} from '@/server/routers/document';
import styled from '@emotion/styled';
import { Link } from '@heroui/react';
import { useState, ReactNode } from 'react';
import Text from '@/components/HtmlText';
import { useMemo } from 'react';
import { useText } from '@/components';

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
  const t = useText('document');
  return (
    <Collapsible title={<Text size={15}>{t('otherCandidates')}</Text>}>
      <List>
        {candidates.map((candidate, index) => (
          <ListItemContainer key={candidate.url}>
            <Text>{index + 1}.</Text>
            <ListItemContent>
              <Text>{candidate.title}</Text>
              <Text
                size={12}
                css={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <Link href={candidate.url} target="_blank">
                  {candidate.url}
                </Link>
              </Text>
            </ListItemContent>
          </ListItemContainer>
        ))}
      </List>
    </Collapsible>
  );
};

type CollapsibleProps = {
  title: ReactNode;
  children: ReactNode;
};

const Collapsible = ({ title, children }: CollapsibleProps) => {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: 0 }}>
      <div
        onClick={() => setOpen((s) => !s)}
        style={{ cursor: 'pointer', padding: '10px 0' }}
      >
        {title}
      </div>
      {open ? <div>{children}</div> : null}
    </div>
  );
};

const AnnotationLinkDetails = ({
  annotationFeatures,
}: AnnotationLinkDetailsProps) => {
  const t = useText('document');
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
      <Text size={15} b>
        {t('linksInfo')}
      </Text>
      <Section>
        {isNil() ? (
          <Text
            blockquote
            size={14}
            css={{ padding: '10px', margin: '0', background: '#fdf7d5' }}
          >
            {t('newEntityMessage')}
          </Text>
        ) : (
          <>
            <Text>{annotationFeatures.title}</Text>
            <Text size={12}>
              <Link href={annotationFeatures.url} target="_blank">
                {annotationFeatures.url}
              </Link>
            </Text>
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
