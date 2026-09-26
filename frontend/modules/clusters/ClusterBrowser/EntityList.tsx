import { useText } from '@/components';
import { FiTag } from '@react-icons/all-files/fi/FiTag';
import styled from '@emotion/styled';
import { Cluster } from '@/server/routers/document';
import { ListItem } from './ListItem';
import { ListPane } from './ListPane';

type EntityListProps = {
  selectedType: string | undefined;
  entities: Cluster[];
  selectedEntity: Cluster | undefined;
  onEntitySelection: (e: Cluster) => void;
};

export function EntityList({
  selectedType,
  entities,
  selectedEntity,
  onEntitySelection,
}: EntityListProps) {
  const t = useText('clusters');
  return (
    <ListPane
      title={t('entities')}
      icon={FiTag}
      isEmpty={!selectedType}
      emptyMessage={t('selectType')}
    >
      {selectedType &&
        entities.map((e) => {
          return (
            <ListItem
              key={e.id}
              selected={selectedEntity?.id === e.id}
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
