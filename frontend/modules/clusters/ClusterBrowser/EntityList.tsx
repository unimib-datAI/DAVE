import { useText } from '@/components';
import { FiTag } from '@react-icons/all-files/fi/FiTag';
import styled from '@emotion/styled';
import { Cluster } from '@/server/routers/document';
import { ListItem } from './ListItem';
import { ListPane } from './ListPane';
import { ClusterWithDocId } from './types';
import { FiGitMerge } from '@react-icons/all-files/fi/FiGitMerge';

type EntityListProps = {
  selectedType: string | undefined;
  entities: ClusterWithDocId[];
  selectedEntity: ClusterWithDocId | undefined;
  onEntitySelection: (e: Cluster) => void;
  showMergeButton?: boolean;
  onMergeButtonClick?: (c: ClusterWithDocId) => void;
};

export function EntityList({
  selectedType,
  entities,
  selectedEntity,
  onEntitySelection,
  showMergeButton = false,
  onMergeButtonClick,
}: EntityListProps) {
  const t = useText('clusters');

  const handleMergeButtonClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    c: ClusterWithDocId
  ) => {
    e.stopPropagation();
    if (onMergeButtonClick) onMergeButtonClick(c);
  };

  return (
    <>
      <ListPane
        title={t('entities')}
        icon={FiTag}
        isEmpty={!selectedType}
        emptyMessage={t('selectType')}
      >
        {selectedType &&
          entities.map((c, i) => {
            return (
              <ListItem
                key={i}
                selected={
                  selectedEntity?.id === c.id &&
                  selectedEntity.docId === c.docId
                }
                onClick={() => onEntitySelection(c)}
              >
                <FiTag />
                <ItemLabel title={c.title}>{c.title}</ItemLabel>
                <NumberLabel>
                  ({c.mentions.length} {t('mentions').toLowerCase()})
                </NumberLabel>
                {showMergeButton && (
                  <MergeButton onClick={(e) => handleMergeButtonClick(e, c)}>
                    <FiGitMerge />
                  </MergeButton>
                )}
              </ListItem>
            );
          })}
      </ListPane>
    </>
  );
}

const ItemLabel = styled.span`
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NumberLabel = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 14px;
`;

const MergeButton = styled.button`
  width: fit-content;

  :hover {
    svg {
      color: var(--foreground);
    }
  }
`;
