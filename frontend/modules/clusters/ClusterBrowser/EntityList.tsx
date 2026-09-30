import { useText } from '@/components';
import { FiTag } from '@react-icons/all-files/fi/FiTag';
import styled from '@emotion/styled';
import { Cluster } from '@/server/routers/document';
import { ListItem } from './ListItem';
import { ListPane } from './ListPane';
import { ClusterWithDocId } from './types';
import { Button, useDisclosure } from '@heroui/react';
import { FiGitMerge } from '@react-icons/all-files/fi/FiGitMerge';
import MergeDrawer from './MergeDrawer';

type EntityListProps = {
  selectedType: string | undefined;
  entities: ClusterWithDocId[];
  selectedEntity: ClusterWithDocId | undefined;
  onEntitySelection: (e: Cluster) => void;
};

export function EntityList({
  selectedType,
  entities,
  selectedEntity,
  onEntitySelection,
}: EntityListProps) {
  const t = useText('clusters');
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  return (
    <>
      <ListPane
        title={t('entities')}
        icon={FiTag}
        isEmpty={!selectedType}
        emptyMessage={t('selectType')}
        actions={<MergeClustersButton onClick={onOpen} />}
      >
        {selectedType &&
          entities.map((e, i) => {
            return (
              <ListItem
                key={i}
                selected={
                  selectedEntity?.id === e.id &&
                  selectedEntity.docId === e.docId
                }
                onClick={() => onEntitySelection(e)}
              >
                <FiTag />
                <ItemLabel>{e.title}</ItemLabel>
                <NumberLabel>
                  ({e.mentions.length} {t('mentions').toLowerCase()})
                </NumberLabel>
              </ListItem>
            );
          })}
      </ListPane>
      <MergeDrawer isOpen={isOpen} onOpenChange={onOpenChange} />
    </>
  );
}

type MergeClustersButtonProps = {
  onClick: () => void;
};

function MergeClustersButton({ onClick }: MergeClustersButtonProps) {
  return (
    <MergeClusters onPress={onClick}>
      <FiGitMerge />
      <span>Merge</span>
    </MergeClusters>
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

const MergeClusters = styled(Button)`
  display: flex;
  flex-direction: row;
  align-items: center;

  height: auto;
  padding: 6px 12px;

  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;

  cursor: pointer;

  font-size: 14px;
  font-weight: 500;
  transition: all 150ms ease;
  color: var(--muted-foreground);

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;
