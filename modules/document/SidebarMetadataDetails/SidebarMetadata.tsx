import { useText } from '@/components';
import styled from '@emotion/styled';
import { Text } from '@nextui-org/react';
import { selectDocumentData, useSelector } from '../DocumentProvider/selectors';
import { createObjectFromJson } from '@/utils/shared';
import { DocumentMetadataFeatures } from '../DocumentProvider/types';
import MetadataList from './MetadataList';

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  height: '100%',
  overflowY: 'auto',
  '::-webkit-scrollbar': {
    height: '4px',
    width: '2px',
  },
  '::-webkit-scrollbar-thumb': {
    background: 'rgba(0,0,0,0.1)',
  },
});

const ContentTitle = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '10px',
});

const SidebarMetadata = () => {
  const t = useText('document');

  const documentData = useSelector(selectDocumentData);

  const features = createObjectFromJson<DocumentMetadataFeatures>(
    documentData?.features
  );
  console.log('DOCUMENT', features);
  return documentData ? (
    <Container>
      <ContentTitle>
        <Text b>{t('leftSidebar.metadataContent.title')}</Text>
        <Text
          css={{ fontSize: '14px', lineHeight: '1', color: 'rgba(0,0,0,0.5)' }}
        >
          {t('leftSidebar.metadataContent.description')}
        </Text>
      </ContentTitle>
      <MetadataList features={features} />
    </Container>
  ) : null;
};

export default SidebarMetadata;
