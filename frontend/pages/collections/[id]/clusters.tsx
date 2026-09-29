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

const PageContainer = styled.div`
  height: calc(100vh - var(--toolbar-height));
  overflow: hidden;
`;

const ToolbarContentContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: end;
  width: 100%;
  padding: 0px 12px;
`;

const Mode = {
  document: 'document',
  collection: 'collection',
} as const;

const ClustersPage: NextPage = () => {
  const [activeCollection] = useAtom(activeCollectionAtom);
  const collectionId = activeCollection?.id;
  const { data: session } = useSession();

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
        <ToolbarContentContainer>
          <ModeSelectionTabs
            modes={modes}
            selectedMode={selectedMode}
            setSelectedMode={setSelectedMode}
          />
        </ToolbarContentContainer>
      }
    >
      <PageContainer>
        {selectedMode === Mode.document && (
          <ByDocumentPage docsInfo={docsInfo} />
        )}
        {selectedMode === Mode.collection && (
          <CollectionPage docsInfo={docsInfo} />
        )}
      </PageContainer>
    </ToolbarLayout>
  );
};

export default ClustersPage;

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
