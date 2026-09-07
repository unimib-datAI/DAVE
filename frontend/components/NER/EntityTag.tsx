import { keyframes } from '@emotion/react';
import styled from '@emotion/styled';
import { darken } from 'polished';

/**
 * Styling shared between the classic (VirtualizedNER) entity tags and the
 * markdown renderer's entity mentions, so the two views stay visually
 * identical. Extracted from EntityNode.tsx.
 */
export const pulse = keyframes`
0% {
  transform: scale(1);
  box-shadow: 0 0 0 0 rgba(66, 153, 225, 0.5);
}
30% {
  transform: scale(1.05);
  box-shadow: 0 0 0 8px rgba(66, 153, 225, 0.2);
}
60% {
  transform: scale(1.1);
  box-shadow: 0 0 0 12px rgba(66, 153, 225, 0.1);
}
100% {
  transform: scale(1);
  box-shadow: 0 0 0 0 rgba(66, 153, 225, 0);
}
`;

export const Tag = styled.span<{ color: string; highlight: boolean }>(
  ({ color, highlight }) => ({
    display: 'inline-flex',
    gap: '5px',
    alignItems: 'center',
    position: 'relative',
    padding: '0px 5px',
    borderRadius: '6px',
    background: color,
    color: darken(0.7, color),
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
    border: `1px solid ${darken(0.05, color)}`,
    ...(highlight && {
      background: darken(0.1, color),
      animation: `${pulse} 1200ms ease-out`,
      zIndex: 9999,
      position: 'relative',
      border: `2px solid ${darken(0.3, color)}`,
    }),
    '& > button': {
      background: darken(0.1, color),
      '&:hover': {
        background: darken(0.2, color),
      },
    },
    transition: 'all 200ms ease-out',
  })
);

export const TagLabel = styled.span<{ color: string }>(({ color }) => ({
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  padding: '0 3px',
  borderRadius: '4px',
  pointerEvents: 'none',
  background: darken(0.35, color),
  color: color,
  verticalAlign: 'middle',
}));

export const DeleteButton = styled.button({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  fontSize: '12px',
  margin: 0,
  padding: '2px',
  borderRadius: '50%',
  cursor: 'pointer',
});
