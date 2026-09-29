import styled from '@emotion/styled';
import { Tab, Tabs } from '@heroui/react';

type ModeSelectionTabsProps = {
  modes: {
    key: string;
    label: string;
  }[];
  selectedMode: string;
  setSelectedMode: (mode: string) => void;
};

export const ModeSelectionTabs = ({
  modes,
  selectedMode,
  setSelectedMode,
}: ModeSelectionTabsProps) => {
  return (
    <StyledTabs
      selectedKey={selectedMode}
      onSelectionChange={(key) => setSelectedMode(key as string)}
    >
      {modes.map((m) => (
        <Tab key={m.key} title={m.label} />
      ))}
    </StyledTabs>
  );
};

const StyledTabs = styled(Tabs)`
  [role='tablist']{
    border-radius: 8px;
    padding: 4px 6px;
  }

  [data-slot='cursor']{
    border-radius: 4px;
  }

  [role='tab'] {
    height: 26px;
    border-radius: 8px;
  }
`;
