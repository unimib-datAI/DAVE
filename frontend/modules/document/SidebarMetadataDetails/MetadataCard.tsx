import { useText } from '@/components';
import styled from '@emotion/styled';
import { darken } from 'polished';

type MetadataCardProps = {
  title: string;
  content: string | number;
};

/** Turn a raw feature key (e.g. `cf_giudice`) into a readable label. */
const humanize = (key: string) =>
  key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const ClusterContainer = styled.button<{}>(() => ({
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
    top: '0px',
    right: '10px',
    borderRadius: '50%',
    background: '#c7c7c7',
    transform: 'scale(0)',
    transition: 'all 250ms ease-out',
  },
}));

const Tag = styled.span<{ color: string }>(({ color }) => ({
  position: 'relative',
  padding: '2px',
  paddingBottom: '0px',
  borderRadius: '6px',
  fontSize: '10px',
  fontWeight: 600,
  background: color,
  color: darken(0.7, color),
  border: `1px solid ${darken(0.05, color)}`,
}));

const MetadataCard = ({ title, content }: MetadataCardProps) => {
  const t = useText('document');

  // Prefer an explicit translation for known fields, fall back to a
  // humanized version of the raw key.
  const translatedTitle =
    t(`leftSidebar.metadataContent.fields.${title}`) || humanize(title);

  return (
    <>
      <ClusterContainer>
        <strong
          style={{
            textAlign: 'start',
            width: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
          }}
        >
          {translatedTitle}
        </strong>
        <span
          style={{
            fontSize: '12px',
            textAlign: 'start',
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
          }}
        >
          {content}
        </span>
      </ClusterContainer>
    </>
  );
};

export default MetadataCard;
