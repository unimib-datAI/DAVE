import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiFile } from '@react-icons/all-files/fi/FiFile';
import styled from '@emotion/styled';
import { useText } from '@/components';
import { collectionDocInfo } from '@/server/routers/collection';
import { ListItem } from './ListItem';
import { ListPane } from './ListPane';

type DocumentListProps = {
  selectedDocId: string | undefined;
  docsInfo: collectionDocInfo[];
  onDocumentSelection: (id: string) => void;
};

export function DocumentList({
  selectedDocId,
  onDocumentSelection,
  docsInfo,
}: DocumentListProps) {
  const t = useText('clusters');
  return (
    <ListPane
      title={t('documents')}
      icon={FiFolder}
      isEmpty={docsInfo?.length == 0}
      emptyMessage={t('collectionEmpty')}
    >
      {(docsInfo ?? []).map((doc) => {
        return (
          <ListItem
            key={doc.id}
            selected={doc.id === selectedDocId}
            onClick={() => onDocumentSelection(doc.id)}
          >
            <FiFile />
            <ItemLabel>{doc.name}</ItemLabel>
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
