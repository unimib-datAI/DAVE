import { Cluster } from '@/server/routers/document';
import styled from '@emotion/styled';
import { useState } from 'react';
import { ProcessedCluster } from '../DocumentProvider/types';
import ClusterCard from './ClusterCard';
import ClusterGroup from './ClusterGroup';
import useNER from '@/lib/ner/core/use-ner';
import {
  selectFilteredEntityAnnotationsWithSearch,
  useSelector,
} from '../DocumentProvider/selectors';
import { useViewIndex } from '../ViewProvider/ViewProvider';

type ClustersListProps = {
  clusters: ProcessedCluster[];
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  padding: '10px',
});

const ClustersList = ({ clusters }: ClustersListProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  //  const viewIndex = useViewIndex();
  const filteredAnnotations = useSelector((state) =>
    selectFilteredEntityAnnotationsWithSearch(state, 0)
  );
  const handleClusterCardClick = (index: number) => {
    setSelectedIndex((oldIndex) => {
      if (oldIndex === index) {
        return null;
      }
      return index;
    });
  };
  console.log('clusters list', clusters);
  return (
    <ListContainer>
      {clusters.map((cluster) => (
        <ClusterCard
          annotations={filteredAnnotations}
          key={cluster.id}
          onClick={() => handleClusterCardClick(cluster.id)}
          selected={selectedIndex === cluster.id}
          {...cluster}
        />
      ))}
    </ListContainer>
  );
};

export default ClustersList;
