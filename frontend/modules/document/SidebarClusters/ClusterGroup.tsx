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
import { Col, Input, Row, Select } from 'antd';
import { useText } from '@/components';
import { AiFillCloseCircle } from '@react-icons/all-files/ai/AiFillCloseCircle';
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

  const [clustersState, setClusters] = useState<ProcessedCluster[]>(
    clusters.sort((a: Cluster, b: Cluster) => a.title.localeCompare(b.title))
  );
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const [searchTerm, setSearchTerm] = useState('');
  const taxonomyNode = useMemo(() => {
    const node = getAllNodeData(taxonomy, type);
    return node;
  }, [taxonomy]);

  const typesPath = useMemo(() => {
    const nodes = getNodesPath(taxonomy, type);
    const path = nodes.map((n) => n.label).join(' / ');

    // If the root node is "Altro" (UNKNOWN) and we have an actual type value,
    // append the original type to show "Altro/type"
    // if (
    //   nodes.length === 1 &&
    //   nodes[0].key === 'UNKNOWN' &&
    //   type !== 'UNKNOWN'
    // ) {
    //   return `${type}`;
    // }

    return type;
  }, [type]);

  // Filter and sort clusters based on searchTerm and selectedSort
  useEffect(() => {
    let filtered = clusters;
    if (searchTerm !== '') {
      filtered = clusters.filter((cluster: Cluster) =>
        cluster.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    handleSort(filtered, selectedSort);
  }, [searchTerm, clusters, selectedSort]);

  function handleSort(
    clustersToSort: ProcessedCluster[],
    sort: 'ALPHABETICAL' | 'NUMBER_MENTIONS'
  ) {
    let sortedClusters: ProcessedCluster[];
    switch (sort) {
      case 'ALPHABETICAL':
        sortedClusters = [...clustersToSort].sort((a: Cluster, b: Cluster) =>
          a.title.localeCompare(b.title)
        );
        break;
      case 'NUMBER_MENTIONS':
        sortedClusters = [...clustersToSort].sort(
          (a: Cluster, b: Cluster) => b.mentions.length - a.mentions.length
        );
        break;
      default:
        sortedClusters = [...clustersToSort];
    }
    setClusters(sortedClusters);
  }

  const t = useText('document');

  //use effect used to recompute cluster lists when they change after like a mention deletion
  useEffect(() => {
    handleSort(clusters, selectedSort);
  }, [clusters]);
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
        <Col>
          <Row justify={'center'}>
            <Input
              suffix={
                <AiFillCloseCircle
                  style={{
                    cursor: 'pointer',
                    visibility: searchTerm ? 'visible' : 'hidden',
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setSearchTerm('');
                  }}
                />
              }
              style={{ margin: '10px', width: '100%', marginBottom: 0 }}
              type="text"
              placeholder={t('search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Row>

          <Row justify="center">
            <Select
              style={{ margin: '10px', width: '100%' }}
              defaultValue="ALPHABETICAL"
              value={selectedSort}
              onChange={(value) => {
                if (value === 'ALPHABETICAL' || value === 'NUMBER_MENTIONS') {
                  setSelectedSort(value);
                }
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
          </Row>
        </Col>
      )}
      {selected && <ClustersList clusters={clustersState} />}
    </GroupContainer>
  );
};

export default ClusterGroup;
