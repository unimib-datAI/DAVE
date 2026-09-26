import { FiList } from '@react-icons/all-files/fi/FiList';
import { EntityTypeTag } from '@/components/EntityTypeTag';
import styled from '@emotion/styled';
import { useText } from '@/components';
import { Cluster } from '@/server/routers/document';
import { FlatTreeNode, getAllNodeData } from '@/components/Tree';
import { ListItem } from './ListItem';
import { ListPane } from './ListPane';

type EntityTypesListProps = {
  selectedDocId: string | undefined;
  selectedType: string | undefined;
  clustersByType: Record<string, Cluster[]>;
  onTypeSelection: (type: string) => void;
  taxonomy: { [x: string]: FlatTreeNode };
};

export function EntityTypesList({
  selectedDocId,
  selectedType,
  clustersByType,
  onTypeSelection,
  taxonomy,
}: EntityTypesListProps) {
  const t = useText('clusters');
  const isEmpty = !selectedDocId || Object.keys(clustersByType).length === 0;
  const emptyMessage = !selectedDocId
    ? t('selectDocument')
    : t('noEntitiesFound');

  return (
    <ListPane
      title={t('types')}
      icon={FiList}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
    >
      {selectedDocId &&
        Object.keys(clustersByType).map((type) => {
          return (
            <ListItem
              key={type}
              onClick={() => onTypeSelection(type)}
              selected={type === selectedType}
            >
              <EntityTypeTag
                color={getAllNodeData(taxonomy, type).color}
                label={type}
                fontSize="14px"
              />
              <NumberLabel>
                <span>
                  ({clustersByType[type].length} {t('entities').toLowerCase()})
                </span>
              </NumberLabel>
            </ListItem>
          );
        })}
    </ListPane>
  );
}

const NumberLabel = styled.div`
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 14px;
`;
