import { Cluster } from '@/server/routers/document';
import styled from '@emotion/styled';
import { useEffect, useState, useMemo } from 'react';
import { ProcessedCluster } from '../DocumentProvider/types';
import ClusterCard from './ClusterCard';
import ClusterGroup from './ClusterGroup';
import { Select } from 'antd';
import { useText } from '@/components';
import { useAtomValue } from 'jotai';
import { activeCollectionAtom } from '@/atoms/collection';

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
  const activeCollection = useAtomValue(activeCollectionAtom);

  const orderedTypes = useMemo(() => {
    const keys = Object.keys(clusterGroups);
    const typesOrder: string[] = Array.isArray(activeCollection?.config?.typesOrder)
      ? (activeCollection.config.typesOrder as string[])
      : [];
    if (typesOrder.length === 0) return keys;
    return [
      ...typesOrder.filter((t) => keys.includes(t)),
      ...keys.filter((k) => !typesOrder.includes(k)),
    ];
  }, [clusterGroups, activeCollection]);

  const handleClusterCardClick = (index: number) => {
    setSelectedIndex((oldIndex) => {
      if (oldIndex === index) {
        return null;
      }
      return index;
    });
  };

  return (
    <ListContainer>
      {orderedTypes.map((type, index) => (
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
