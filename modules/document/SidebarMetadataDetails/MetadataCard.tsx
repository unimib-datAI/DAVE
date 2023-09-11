import { useText } from '@/components';
import styled from '@emotion/styled';
import { Text } from '@nextui-org/react';
import { darken } from 'polished';

type MetadataCardProps = {
  title: string;
  content: String | Number;
};

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

  return (
    <>
      <ClusterContainer>
        <Text
          b
          css={{
            textAlign: 'start',
            width: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </Text>
        <Text size="12px">{content}</Text>
      </ClusterContainer>
    </>
  );
};

export default MetadataCard;
