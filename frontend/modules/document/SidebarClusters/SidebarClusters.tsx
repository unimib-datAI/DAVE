import { useText } from '@/components';
import styled from '@emotion/styled';
import { Text } from '@nextui-org/react';
import {
  selectDocumentClusters,
  useSelector,
} from '../DocumentProvider/selectors';
import ClusterList from './ClusterGroupsList';
import EditClusters from './EditClusters';
import { useState } from 'react';

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

const SidebarClusters = () => {
  const t = useText('document');
  const [isOpen, setIsOpen] = useState(false);
  const clusterGroups = useSelector(selectDocumentClusters);
  const [clusterGroupsState, setClusterGroupsState] = useState(clusterGroups);
  console.log('groups', clusterGroups, typeof clusterGroups);
  return clusterGroups ? (
    <Container>
      <ContentTitle>
        <Text b>{t('leftSidebar.clustersContent.title')}</Text>
        <Text
          css={{ fontSize: '14px', lineHeight: '1', color: 'rgba(0,0,0,0.5)' }}
        >
          {t('leftSidebar.clustersContent.description')}
        </Text>
      </ContentTitle>
      {clusterGroupsState && (
        <>
          <ClusterList clusterGroups={clusterGroupsState} />

          <EditClusters
            // @ts-ignore
            onEdit={(newGroups) => {
              console.log('newGroups', newGroups);
              setClusterGroupsState(newGroups);
            }}
            clusterGroups={clusterGroupsState}
          />
        </>
      )}
    </Container>
  ) : null;
};

export default SidebarClusters;
