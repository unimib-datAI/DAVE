import styled from '@emotion/styled';
import { useState } from 'react';
import { DocumentMetadataFeatures } from '../DocumentProvider/types';
import MetadataCard from './MetadataCard';

type MetadataListProps = {
  features: DocumentMetadataFeatures;
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  padding: '10px',
});

const MetadataList = ({ features }: MetadataListProps) => {
  console.log('features props', features);
  return (
    <ListContainer>
      {/* Checks if is a chat or not  */}
      {!features.neo4j_id ? (
        <>
          <MetadataCard title={'name'} content={features.name} />
          <MetadataCard title={'nomegiudice'} content={features.nomegiudice} />
          <MetadataCard title={'cf_giudice'} content={features.cf_giudice} />
          <MetadataCard title={'parte'} content={features.parte} />
          <MetadataCard title={'controparte'} content={features.controparte} />
          <MetadataCard
            title={'gradogiudizio'}
            content={features.gradogiudizio}
          />
        </>
      ) : (
        <>
          <MetadataCard title={'start time'} content={features.start_time} />
          <MetadataCard
            title={'participants'}
            content={features.participants.join('\n')}
          />
          <MetadataCard
            title={'number of messages'}
            content={features.number_of_messages}
          />
        </>
      )}
    </ListContainer>
  );
};

export default MetadataList;
