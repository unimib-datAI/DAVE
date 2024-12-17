import { getAllNodeData, getNodesPath } from '@/components/Tree';
import { Cluster } from '@/server/routers/document';
import styled from '@emotion/styled';
import { type } from 'os';
import { darken } from 'polished';
import { useEffect, useMemo, useState } from 'react';
import {
  useSelector,
  selectDocumentTaxonomy,
} from '../DocumentProvider/selectors';
import { FiChevronDown } from '@react-icons/all-files/fi/FiChevronDown';
import { FiChevronUp } from '@react-icons/all-files/fi/FiChevronUp';
import ClusterCard from './ClusterCard';
import ClustersList from './ClustersList';
import { ProcessedCluster } from '../DocumentProvider/types';
import { Select } from 'antd';
import { useText } from '@/components';

type ClusterGroup = {
  selected: boolean;
  type: string;
  clusters: ProcessedCluster[];
  onClick: () => void;
};

const GroupContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid #F3F3F5',
  '&:first-of-type': {
    borderTop: '1px solid #F3F3F5',
  },
});

const GroupHeader = styled.div<{ selected: boolean }>(({ selected }) => ({
  position: 'sticky',
  top: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '10px',
  zIndex: 10,
  background: '#FFF',
  cursor: 'pointer',
  '&:hover': {
    background: '#f8f8f8',
  },
  '&:not(:only-child)': {
    borderBottom: '1px solid #F3F3F5',
  },
  ...(selected && {
    background: '#f8f8f8',
  }),
}));

const Tag = styled.span<{ color: string }>(({ color }) => ({
  position: 'relative',
  padding: '2px',
  borderRadius: '6px',
  fontSize: '10px',
  fontWeight: 600,
  background: color,
  color: darken(0.7, color),
  border: `1px solid ${darken(0.05, color)}`,
}));

const IconButton = styled.button({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  outline: 'none',
  borderRadius: '6px',
  padding: '0px 5px',
  margin: 0,
  marginLeft: 'auto',
  fontSize: '12px',
});

const ClusterGroup = ({ type, clusters, selected, onClick }: ClusterGroup) => {
  const [selectedSort, setSelectedSort] = useState<
    'ALPHABETICAL' | 'NUMBER_MENTIONS'
  >('ALPHABETICAL');
  const [clustersState, setClusters] = useState<ProcessedCluster[]>(clusters);
  const taxonomy = useSelector(selectDocumentTaxonomy);

  const taxonomyNode = useMemo(() => {
    const node = getAllNodeData(taxonomy, type);
    return node;
  }, [taxonomy]);

  const typesPath = useMemo(() => {
    const nodes = getNodesPath(taxonomy, type);
    return nodes.map((n) => n.label).join(' / ');
  }, [type]);

  useEffect(() => {
    handleSort(selectedSort);
  }, [selectedSort]);

  async function handleSort(sort: 'ALPHABETICAL' | 'NUMBER_MENTIONS') {
    switch (sort) {
      case 'ALPHABETICAL':
        let tempAlpha = clustersState.sort((a: Cluster, b: Cluster) =>
          a.title.localeCompare(b.title)
        );
        setClusters(tempAlpha);
        break;
      case 'NUMBER_MENTIONS':
        let tempNum = clustersState.sort(
          (a: Cluster, b: Cluster) => a.mentions.length - b.mentions.length
        );
        setClusters(tempNum);
        break;
    }
  }

  const t = useText('document');

  return (
    <GroupContainer>
      <GroupHeader selected={selected} onClick={onClick}>
        <Tag color={taxonomyNode.color}>{typesPath}</Tag>
        <IconButton>
          {clusters.length}
          {selected ? <FiChevronUp /> : <FiChevronDown />}
        </IconButton>
      </GroupHeader>
      {selected && (
        <Select
          defaultValue="ALPHABETICAL"
          value={selectedSort}
          onChange={(value) => {
            if (value === 'ALPHABETICAL' || value === 'NUMBER_MENTIONS')
              setSelectedSort(value);
          }}
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
      )}
      {selected && <ClustersList clusters={clustersState} />}
    </GroupContainer>
  );
};

export default ClusterGroup;
