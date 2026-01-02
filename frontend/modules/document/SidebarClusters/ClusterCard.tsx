import { useText } from '@/components';
import { getAllNodeData, getNodesPath } from '@/components/Tree';
import { Cluster, EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { darken } from 'polished';
import { useEffect, useMemo } from 'react';
import {
  useSelector,
  selectDocumentTaxonomy,
} from '../DocumentProvider/selectors';
import { ProcessedCluster } from '../DocumentProvider/types';
import ClusterMentionsList from './ClusterMentionsList';

type ClusterCardProps = ProcessedCluster & {
  selected: boolean;
  annotations: EntityAnnotation[];
  onClick: () => void;
};

const ClusterContainer = styled.button<{ selected: boolean }>(
  ({ selected }) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '5px',
    padding: '10px',
    border: '1px solid #F3F3F5',
    borderRadius: '6px',
    background: '#FFF',
    cursor: 'pointer',

    '&:hover': {
      background: '#f8f8f8',
    },
    '&:after': {
      content: '""',
      position: 'absolute',
      width: '10px',
      height: '10px',
      top: '10px',
      right: '10px',
      borderRadius: '50%',
      background: '#c7c7c7',
      transform: selected ? 'scale(1)' : 'scale(0)',
      transition: 'all 250ms ease-out',
    },
    ...(selected && {
      background: '#f8f8f8',
    }),
  })
);

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

const ClusterCard = ({
  id,
  mentions,
  annotations,
  type,
  title,
  selected,
  onClick,
}: ClusterCardProps) => {
  const t = useText('document');

  useEffect(() => {
    console.log('Changed mentions', mentions.length);
  }, [mentions]);
  return (
    <>
      {mentions.length > 0 && (
        <ClusterContainer selected={selected} onClick={onClick}>
          <span
            title={title}
            style={{
              fontWeight: 'bold',
              textAlign: 'start',
              width: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </span>
          <span style={{ fontSize: '12px' }}>
            {t('leftSidebar.clustersContent.mentions', { n: mentions.length })}
          </span>
          {selected && (
            <ClusterMentionsList
              mentions={mentions}
              annotations={annotations}
            />
          )}
        </ClusterContainer>
      )}
    </>
  );
};

export default ClusterCard;
