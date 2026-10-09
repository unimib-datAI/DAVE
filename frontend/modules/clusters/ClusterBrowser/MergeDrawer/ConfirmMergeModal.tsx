import {
  Button,
  Divider,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import { ClusterWithDocId } from '../types';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import styled from '@emotion/styled';

type ConfirmMergeModalProps = {
  isOpen: boolean;
  onOpenChange: () => void;
  onMergeConfirm: () => void;
  keep: ClusterWithDocId | null;
  mergeAway: ClusterWithDocId | null;
};

export default function ConfirmMergeModal({
  isOpen,
  onOpenChange,
  onMergeConfirm,
  keep,
  mergeAway,
}: ConfirmMergeModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      classNames={{ base: 'w-fit min-w-[min(28rem,90vw)] max-w-[90vw]' }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Confirm Merge</ModalHeader>
            <ModalBody>
              {keep && mergeAway && (
                <>
                  <Description>
                    Do you confirm that you want to merge the following
                    clusters? This action is <strong>permanent</strong>. All
                    mentions of <em>{mergeAway.title}</em> will be transferred
                    to <em>{keep.title}</em>.
                  </Description>
                  <MergeRow>
                    <EntityName toBeDeleted={false} title={keep.title}>
                      {keep.title}
                    </EntityName>
                    <FiArrowLeft size={24} />
                    <EntityName toBeDeleted={true} title={mergeAway.title}>
                      {mergeAway.title}
                    </EntityName>
                  </MergeRow>
                </>
              )}
            </ModalBody>
            <Divider/>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="danger"
                onPress={() => {
                  onMergeConfirm();
                  onClose();
                }}
              >
                Merge
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

const MergeRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  justify-content: center;

  margin: 32px 0 42px 0;

  svg {
    color: var(--muted-foreground);
  }
`;

const EntityName = styled.div<{ toBeDeleted: boolean }>`
  font-size: 16px;
  background-color: ${(prop) =>
    prop.toBeDeleted
      ? 'color-mix(in srgb, var(--destructive) 5%, white)'
      : 'var(--background-secondary)'};
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid
    ${(prop) => (prop.toBeDeleted ? 'var(--destructive)' : 'var(--border)')};
`;

const Description = styled.p`
  // Prevents description from widening modal
  width: 0;
  min-width: 100%;
`;
