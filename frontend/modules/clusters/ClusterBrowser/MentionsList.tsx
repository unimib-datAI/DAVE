import { useText } from '@/components';
import { FiFileText } from '@react-icons/all-files/fi/FiFileText';
import styled from '@emotion/styled';
import { Cluster } from '@/server/routers/document';
import { ListPane } from './ListPane';

export type Mention = {
  start: number;
  end: number;
  context: string;
  id: number;
  mention: string;
  documentTitle?: string;
};

type MentionsListType = {
  selectedEntity: Cluster | undefined;
  mentions: Mention[];
};

export function MentionsList({ selectedEntity, mentions }: MentionsListType) {
  const t = useText('clusters');

  const renderMention = (start: number, end: number, context: string) => {
    const before = context.substring(0, start);
    const mention = context.substring(start, end);
    const after = context.substring(end, context.length);
    return (
      <p>
        {before}
        <Highlight>{mention}</Highlight>
        {after}
      </p>
    );
  };

  return (
    <ListPane
      title={t('mentions')}
      icon={FiFileText}
      isEmpty={!selectedEntity}
      emptyMessage={t('selectEntity')}
    >
      {selectedEntity &&
        mentions.map((m) => {
          return (
            <MentionContainer key={m.id}>
              <DocumentName>{m.documentTitle}</DocumentName>
              {renderMention(m.start, m.end, m.context)}
            </MentionContainer>
          );
        })}
    </ListPane>
  );
}

const MentionContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 16px;
  cursor: pointer;
  font-size: 16px;
  border-bottom: 2px solid var(--muted);

  &:hover {
    background-color: var(--muted);
  }
`;

const DocumentName = styled.span`
  font-weight: var(--font-semibold);
`;

const Highlight = styled.span`
  background-color: var(--highlight);
  padding: 4px 4px;
`;
