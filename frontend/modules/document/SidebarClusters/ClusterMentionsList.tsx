import { Cluster, EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { Text } from '@nextui-org/react';
import { Fragment, MouseEvent, useState, useCallback } from 'react';
import { scrollEntityIntoView } from '../DocumentProvider/utils';
import { FiArrowRight } from '@react-icons/all-files/fi/FiArrowRight';
import {
  selectDocumentText,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';

type ClusterMentionsListProps = {
  mentions: (Cluster['mentions'][number] & { mentionText: string })[];
  annotations: EntityAnnotation[];
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  width: '100%',
});

const MentionButton = styled.button({
  position: 'relative',
  background: '#FFF',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: '12px',
  border: '1px solid #F3F3F5',
  borderRadius: '6px',
  cursor: 'pointer',
  textAlign: 'start',
  transition: 'background 250ms ease-out, transform 150ms ease-out',
  '&:active': {
    background: '#ececec',
    transform: 'scale(0.95)',
  },
  '&:hover': {
    paddingRight: '20px',
    background: '#fcfcfc',
    '> div': {
      visibility: 'visible',
      transform: 'translateY(-50%) translateX(10%)',
    },
  },
});

const IconButtonContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'absolute',
  top: '50%',
  right: '5px',
  transform: 'translateY(-50%)',
  transition: 'transform 150ms ease-out',
  visibility: 'hidden',
});

const Mark = styled.mark({
  background: '#f7f7a2',
});

const highlightMatchingText = (text: string, matchingText: string) => {
  const matchRegex = RegExp(matchingText, 'ig');

  // Matches array needed to maintain the correct letter casing
  const matches = [...Array.from(text.matchAll(matchRegex))];

  return text.split(matchRegex).map((nonBoldText, index, arr) => (
    <Fragment key={index}>
      {nonBoldText}
      {index + 1 !== arr.length && <Mark>{matches[index]}</Mark>}
    </Fragment>
  ));
};

const ClusterMentionsList = ({
  mentions,
  annotations,
}: ClusterMentionsListProps) => {
  const dispatch = useDocumentDispatch();
  const text = useSelector(selectDocumentText);

  console.log('📋 ClusterMentionsList received mentions:', mentions);
  console.log('📋 ClusterMentionsList received annotations:', annotations);

  // Smart mention click handler for virtualized NER
  const handleOnClick = useCallback(
    (id: number, mention: any) => (event: MouseEvent) => {
      event.stopPropagation();

      // Find the annotation
      const annotation = annotations.find((ann) => ann.id === id);
      if (!annotation) {
        console.warn(
          `Annotation with id ${id} not found in annotations array. This might be a deleted annotation that's still in the cluster mentions.`
        );
        return;
      }

      // Check if we're in add mode - don't highlight if we are
      const currentAction = document.querySelector('[data-action="add"]');
      const isAddMode =
        currentAction && currentAction.classList.contains('active');
      if (isAddMode) {
        console.log('In add annotation mode - skipping highlight');
        return;
      }

      // Directly highlight the annotation - the VirtualizedNER component will handle scrolling
      dispatch({
        type: 'highlightAnnotation',
        payload: {
          annotationId: id,
        },
      });

      // Wait for the VirtualizedNER to scroll to the annotation, then scroll to the specific element
      setTimeout(() => {
        const element = document.getElementById(`entity-tag-${id}`);
        if (element) {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        }
      }, 200); // Reduced delay since we don't need to wait for page loading
    },
    [annotations, dispatch]
  );

  return (
    <ListContainer>
      {mentions.map((m) => (
        <MentionButton
          title={m.mentionText}
          onClick={handleOnClick(m.id, m)}
          key={m.id}
        >
          {highlightMatchingText(m.mentionText, m.mention)}
          <IconButtonContainer>
            <FiArrowRight />
          </IconButtonContainer>
        </MentionButton>
      ))}
    </ListContainer>
  );
};

export default ClusterMentionsList;
