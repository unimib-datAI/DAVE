import { ToolbarLayout } from '@/components';
import { GetServerSideProps, NextPage } from 'next';
import { useQuery } from '@/utils/trpc';
import { useSession, getSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { useState } from 'react';
import { activeCollectionAtom } from '@/atoms/collection';
import { useAtom } from 'jotai';
import {
  ByDocumentPage,
  CollectionPage,
  ModeSelectionTabs,
} from '@/modules/clusters/ClusterBrowser';
import { collectionDocInfo } from '@/server/routers/collection';
import { Button, useDisclosure } from '@heroui/react';
import { FiGitMerge } from '@react-icons/all-files/fi/FiGitMerge';

const PageContainer = styled.div`
  height: calc(100vh - var(--toolbar-height));
  overflow: hidden;
`;

const ToolbarCenteredContent = styled.div`
  /* display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: end;
  width: 100%;
  padding: 0px 12px; */
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;

const ToolbarContent = styled.div`
  pointer-events: auto;
  display: flex;
  flex-direction: row;
  gap: 12px;
`;

const Mode = {
  document: 'document',
  collection: 'collection',
} as const;

const ClustersPage: NextPage = () => {
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;
  const { data: session } = useSession();

  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // Mode selection
  const modes = [
    {
      key: Mode.document,
      label: 'By Document',
    },
    { key: Mode.collection, label: 'Collection' },
  ];
  const [selectedMode, setSelectedMode] = useState<string>(modes[0].key);

  // Get document IDs and names in the collection
  const { data: docsInfo } = useQuery([
    'collection.getCollectionInfo',
    { id: collectionId ?? '', token: (session as any)?.accessToken },
  ]) as { data: collectionDocInfo[] };

  return (
    <ToolbarLayout
      toolbarContent={
        <ToolbarCenteredContent>
          <ToolbarContent>
            {selectedMode === Mode.document && (
              <MergeClustersButton onClick={onOpen} />
            )}
            <ModeSelectionTabs
              modes={modes}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
            />
          </ToolbarContent>
        </ToolbarCenteredContent>
      }
    >
      <PageContainer>
        {selectedMode === Mode.document && (
          <ByDocumentPage
            docsInfo={docsInfo}
            isDrawerOpen={isOpen}
            onDrawerChange={onOpenChange}
            openDrawer={onOpen}
          />
        )}
        {selectedMode === Mode.collection && (
          <CollectionPage docsInfo={docsInfo} />
        )}
      </PageContainer>
    </ToolbarLayout>
  );
};

export default ClustersPage;

type MergeClustersButtonProps = {
  onClick: () => void;
};

function MergeClustersButton({ onClick }: MergeClustersButtonProps) {
  return (
    <MergeClusters onPress={onClick}>
      <FiGitMerge />
      <span>Merge</span>
    </MergeClusters>
  );
}

const MergeClusters = styled(Button)`
  display: flex;
  flex-direction: row;
  align-items: center;

  height: auto;
  padding: 6px 12px;

  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;

  cursor: pointer;

  font-size: 14px;
  font-weight: 500;
  transition: all 150ms ease;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;

// Protect this page - require authentication unless USE_AUTH is false
export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'eng';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
