import styled from '@emotion/styled';
import { Autocomplete } from '@heroui/react';

export const StyledAutocomplete = styled(Autocomplete)`
  [data-slot='helper-wrapper'] {
    min-height: 0;
    padding: 0;
  }

  [data-slot='input-wrapper'] {
    background-color: var(--background-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 6px 12px;
    height: fit-content;

    &:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    &[data-focus='true'] {
      border-color: var(--muted-foreground);
    }
  }

  [data-slot='inner-wrapper'] {
    height: unset;
  }

  [data-slot='input'] {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
