import { Cluster } from '@/server/routers/document';
import styled from '@emotion/styled';
import { useEffect, useState } from 'react';
import { ProcessedCluster } from '../DocumentProvider/types';
import ClusterCard from './ClusterCard';
import ClusterGroup from './ClusterGroup';
import { Select } from 'antd';
import { useText } from '@/components';

type ClusterListProps = {
  clusterGroups: Record<string, ProcessedCluster[]>;
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
});

const ClusterGroupsList = ({ clusterGroups }: ClusterListProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedSort, setSelectedSort] = useState<
    'ALPHABETICAL' | 'NUMBER_MENTIONS'
  >('ALPHABETICAL');

  useEffect(() => {
    setSelectedIndex(null);
  }, [clusterGroups]);

  const handleClusterCardClick = (index: number) => {
    setSelectedIndex((oldIndex) => {
      if (oldIndex === index) {
        return null;
      }
      return index;
    });
  };
  const t = useText('document');
  return (
    <ListContainer>
      <Select
        value={selectedSort}
        onChange={(value) => setSelectedSort(value)}
        options={[
          {
            value: 'ALPHABETICAL',
            label: t('leftSidebar.clustersContent.alphabeticalOrder'),
          },
          {
            value: 'NUMBER_MENTIONS',
            label: t('leftSidebar.clustersContent.mentionOrder'),
          },
        ]}
      />
      {Object.keys(clusterGroups).map((type, index) => (
        <ClusterGroup
          key={type}
          type={type}
          clusters={clusterGroups[type]}
          selected={selectedIndex === index}
          onClick={() => handleClusterCardClick(index)}
        />
      ))}
    </ListContainer>
  );
};

export default ClusterGroupsList;
