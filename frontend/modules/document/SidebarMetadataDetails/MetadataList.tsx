import { useText } from '@/components';
import styled from '@emotion/styled';
import MetadataCard from './MetadataCard';

type MetadataListProps = {
  features: Record<string, unknown>;
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  padding: '10px',
});

const EmptyState = styled.div({
  padding: '10px',
  fontSize: '13px',
  color: 'rgba(0,0,0,0.5)',
});

/**
 * Keys living in the document `features` object that are not user-facing
 * metadata (internal bookkeeping added by the annotation pipeline).
 */
const NON_METADATA_KEYS = new Set([
  'clusters',
  'anonymized',
  'anonymization',
  'sofa',
  'offset_type',
]);

const isDisplayableValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(isDisplayableValue);
  return false;
};

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.filter(isDisplayableValue).map(String).join('\n');
  }
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  return String(value);
};

const MetadataList = ({ features }: MetadataListProps) => {
  const t = useText('document');

  const entries = Object.entries(features ?? {}).filter(
    ([key, value]) => !NON_METADATA_KEYS.has(key) && isDisplayableValue(value)
  );

  if (entries.length === 0) {
    return <EmptyState>{t('leftSidebar.metadataContent.empty')}</EmptyState>;
  }

  return (
    <ListContainer>
      {entries.map(([key, value]) => (
        <MetadataCard key={key} title={key} content={formatValue(value)} />
      ))}
    </ListContainer>
  );
};

export default MetadataList;
