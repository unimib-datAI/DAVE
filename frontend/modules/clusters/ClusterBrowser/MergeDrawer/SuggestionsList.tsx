import styled from '@emotion/styled';
import { Button, Spinner } from '@heroui/react';
import SuggestionsTable from './SuggestionsTable';
import { ClusterWithDocId } from '../types';
import { FlatTreeNode } from '@/components/Tree';
import { useEffect, useState } from 'react';
import { useSimilaritySuggestions } from './useSimilaritySuggestions';
import { useText } from '@/components';

type SuggestionsListProps = {
  clusters: ClusterWithDocId[];
  taxonomy: { [x: string]: FlatTreeNode };
  enabled: boolean;
  onEditSuggestion: (
    keep: ClusterWithDocId,
    mergeAway: ClusterWithDocId
  ) => void;
  onMergePress: (keep: ClusterWithDocId, mergeAway: ClusterWithDocId) => void;
};

const PAGE_SIZE = 10;
const SIMILARITY_THRESHOLD = 0.98;

export default function SuggestionsList({
  clusters,
  taxonomy,
  enabled,
  onEditSuggestion,
  onMergePress,
}: SuggestionsListProps) {
  const t = useText('clusters');

  // Used for slicing the actual suggestions list
  const [visibleSuggestionsCount, setVisibleSuggestionsCount] =
    useState<number>(PAGE_SIZE);

  // Compute suggestions based on clusters received
  const {
    suggestions,
    isLoading: isLoadingSuggestions,
    hasJobFailed,
    retry: retrySuggestions,
  } = useSimilaritySuggestions(clusters, SIMILARITY_THRESHOLD, enabled);

  useEffect(() => {
    // When new suggestions are computed, go back to the first page
    setVisibleSuggestionsCount(PAGE_SIZE);
  }, [suggestions]);

  if (hasJobFailed) {
    return (
      <SuggestionsFeedback>
        <Message>{t('merge.suggestions.errorMessage')}</Message>
        <RetryButton onClick={retrySuggestions}>
          {t('merge.suggestions.retryButton')}
        </RetryButton>
      </SuggestionsFeedback>
    );
  }

  if (suggestions === undefined || isLoadingSuggestions) {
    return (
      <SuggestionsFeedback>
        <Spinner variant="spinner" />
      </SuggestionsFeedback>
    );
  }

  if (suggestions.length === 0) {
    return (
      <SuggestionsFeedback>
        <Message>{t('merge.suggestions.noSuggestionsFound')}</Message>
      </SuggestionsFeedback>
    );
  }

  const visibleSuggestions = suggestions.slice(0, visibleSuggestionsCount);
  const remaining = suggestions.length - visibleSuggestionsCount;

  return (
    <SuggestionsContainer>
      <SuggestionsTable
        suggestions={visibleSuggestions ?? []}
        taxonomy={taxonomy}
        onEdit={onEditSuggestion}
        onMergePress={onMergePress}
      />

      {suggestions.length > PAGE_SIZE && (
        <Count>
          {/* ({t('merge.suggestions.foundSuggestions', { total: suggestions.length })}) */}
          Showing {visibleSuggestions.length} of {suggestions.length}
        </Count>
      )}

      {remaining > 0 && (
        <LoadMoreButton
          onPress={() => setVisibleSuggestionsCount((prev) => prev + PAGE_SIZE)}
        >
          {t('merge.suggestions.loadMore')}
        </LoadMoreButton>
      )}
    </SuggestionsContainer>
  );
}

const SuggestionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`;

const SuggestionsFeedback = styled.div`
  width: 100%;
  padding: 36px 0px;
  display: flex;
  flex-direction: row;
  gap: 4px;
  align-items: center;
  justify-content: center;
`;

const LoadMoreButton = styled(Button)`
  width: fit-content;
  margin: 0px auto;
`;

const Message = styled.p`
  color: var(--muted-foreground);
`;

const RetryButton = styled.button`
  background-color: transparent;
  color: var(--muted-foreground);
  text-decoration: underline;
`;

const Count = styled.p`
  align-self: center;
  font-size: 14px;
  color: var(--muted-foreground);
`;
