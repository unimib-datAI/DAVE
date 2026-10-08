import styled from '@emotion/styled';
import { DocumentMetadataFeatures } from '../DocumentProvider/types';
import MetadataCard from './MetadataCard';

type MetadataListProps = {
  features: DocumentMetadataFeatures;
};

const ListContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  padding: '10px',
});

// Keys of `features` that hold document-processing state rather than metadata
const INTERNAL_KEYS = new Set([
  'clusters',
  'anonymized',
  'save',
  'reannotate',
  'linking',
]);

const isPrimitive = (value: unknown): value is string | number | boolean =>
  ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Turns a metadata value into display text, or null when there is nothing
 * sensible to show (empty values, nested objects).
 */
const formatValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (isPrimitive(value)) return String(value);
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isPrimitive)
      ? value.join('\n')
      : null;
  }
  return null;
};

const MetadataList = ({ features }: MetadataListProps) => {
  const entries = Object.entries(features)
    .filter(([key]) => !INTERNAL_KEYS.has(key))
    .map(([key, value]) => [key, formatValue(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  return (
    <ListContainer>
      {entries.map(([key, content]) => (
        <MetadataCard key={key} title={key} content={content} />
      ))}
    </ListContainer>
  );
};

export default MetadataList;
