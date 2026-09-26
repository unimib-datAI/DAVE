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
    <Tabs
      selectedKey={selectedMode}
      onSelectionChange={(key) => setSelectedMode(key as string)}
    >
      {modes.map((m) => (
        <Tab key={m.key} title={m.label} />
      ))}
    </Tabs>
  );
};
