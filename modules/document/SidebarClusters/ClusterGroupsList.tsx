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
  async function handleSort(sort: 'ALPHABETICAL' | 'NUMBER_MENTIONS') {
    switch (sort) {
      case 'ALPHABETICAL':
        return clusterGroups.sort((a: Cluster, b: Cluster) =>
          a.title.localeCompare(b.title)
        );
      case 'NUMBER_MENTIONS':
        return clusterGroups.sort(
          (a: Cluster, b: Cluster) => a.mentions.length - b.mentions.length
        );
    }
  }
  useEffect(() => {
    handleSort(selectedSort);
  }, [selectedSort]);
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
        defaultValue="ALPHABETICAL"
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
