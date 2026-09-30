import styled from '@emotion/styled';
import { Drawer, DrawerBody, DrawerContent, DrawerHeader } from '@heroui/react';

type MergeDrawerProps = {
  isOpen: boolean;
  onOpenChange: () => void;
};

function MergeDrawer({ isOpen, onOpenChange }: MergeDrawerProps) {
  return (
    <StyledDrawer isOpen={isOpen} onOpenChange={onOpenChange} backdrop="opaque">
      <DrawerContent>
        <DrawerHeader>Merge Clusters</DrawerHeader>
        <DrawerBody></DrawerBody>
      </DrawerContent>
    </StyledDrawer>
  );
}

export default MergeDrawer;

const StyledDrawer = styled(Drawer)`
  border-radius: 0px;
`;
