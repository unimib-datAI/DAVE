import { ToolbarLayout, useText } from '@/components';
import { useContext, useMutation, useQuery } from '@/utils/trpc';
import { Button, Container, Loading, Table, Text } from '@nextui-org/react';
import { NextPage } from 'next';
import { useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import styled from '@emotion/styled';
import { collectionDocInfo } from '@/server/routers/collection';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import { message, notification, Popconfirm } from 'antd';
import { useAtom } from 'jotai';
import { activeCollectionAtom, collectionsAtom } from '@/atoms/collection';
import { UploadDocumentsModal } from '@/components/UploadDocumentsModal';
import { uploadModalOpenAtom } from '@/atoms/upload';
import { GetServerSideProps } from 'next';
const Header = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: start;
  margin-top: 25px;
  margin-bottom: 0px;
`;
const Chip = styled.span({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '5px 15px',
  borderRadius: 9999,
  backgroundColor: '#e8f2ff', // soft background
  color: '#0366d6', // accent text color
  fontWeight: 600,
  fontSize: '25px',
  border: '1px solid rgba(3,102,214,0.12)',
  lineHeight: 1,
});
const Collection: NextPage = () => {
  const t = useText('collections');
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const utils = useContext();
  const enabled = Boolean(id && session?.accessToken);
  const [allCollections] = useAtom(collectionsAtom);
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);

  const [currentCollectionName, setCurrentCollectionName] = useState<
    string | null
  >(null);
  // delete mutation with onSuccess that updates cache locally
  const deleteDocumentMutation = useMutation(['document.deleteDocument'], {
    onSuccess: (_result, variables) => {
      // Build the same query key you use in useQuery
      const queryKey = [
        'collection.getCollectionInfo',
        { id: id ?? '', token: (session as any)?.accessToken },
      ] as const;

      // Remove the deleted doc from the cached array (instant local update)
      utils.setQueryData(queryKey, (old: collectionDocInfo[] | undefined) =>
        old
          ? old.filter((d: collectionDocInfo) => d.id !== variables.docId)
          : old
      );

      // Optionally show a success message
      message.success(t('documentDeleted'));
    },
    onError: () => {
      message.error(t('errorDeleting'));
    },
  });
  const { data, isLoading, refetch } = useQuery(
    [
      'collection.getCollectionInfo',
      { id: id ?? '', token: (session as any)?.accessToken },
    ],
    { enabled: enabled }
  );
  async function handleDeleteDocument(docId: string) {
    try {
      await deleteDocumentMutation.mutateAsync({
        docId: docId,
      });
    } catch (error) {
      console.error(`Error deleting the document ${docId}`);
    }
  }
  useEffect(() => {
    if (allCollections && id) {
      const currentCol = allCollections.find((coll) => coll.id === id);
      if (currentCol) setCurrentCollectionName(currentCol.name);
    }
  }, [allCollections, id]);
  if (status === 'loading' || isLoading) {
    return (
      <ToolbarLayout>
        <Container>
          <Loading size="lg" />
        </Container>
      </ToolbarLayout>
    );
  }

  return (
    <ToolbarLayout>
      <Container>
        <Header>
          <Button
            auto
            icon={<FiArrowLeft />}
            onPress={() => router.push('/collections')}
          >
            {' '}
            {t('backToCollections')}{' '}
          </Button>
          <Text h2>
            {t('collectionDocuments', {
              name: currentCollectionName || t('untitled'),
            })}
          </Text>
        </Header>
        <Table
          aria-label="Collection documents"
          css={{ height: 'auto', minWidth: '100%' }}
          selectionMode="single"
          onSelectionChange={(keys) => {
            console.log(keys);
          }}
        >
          <Table.Header>
            <Table.Column>{t('tableHeaders.id')}</Table.Column>
            <Table.Column>{t('tableHeaders.name')}</Table.Column>
            <Table.Column>{t('tableHeaders.preview')}</Table.Column>
            <Table.Column width={100}>{t('tableHeaders.actions')}</Table.Column>
          </Table.Header>
          <Table.Body>
            {(data ?? []).map((docInfo: collectionDocInfo) => (
              <Table.Row key={docInfo.id}>
                <Table.Cell>{docInfo.id.slice(0, 10) + '...'}</Table.Cell>
                <Table.Cell>
                  <Text>{docInfo.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text css={{ maxWidth: '500px' }}>
                    {docInfo.preview
                      ? docInfo.preview.slice(0, 50) + '...'
                      : t('noPreview')}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Popconfirm
                    okText="Confirm"
                    cancelText="Cancel"
                    title={t('deleteDocument')}
                    description={t('deleteConfirmation')}
                    onConfirm={() => handleDeleteDocument(docInfo.id)}
                  >
                    <Button
                      auto
                      style={{ margin: 'auto' }}
                      size="sm"
                      color="error"
                      flat
                    >
                      <FiTrash2 />
                    </Button>
                  </Popconfirm>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
        <UploadDocumentsModal doneUploading={refetch} collectionId={id} />
        <Button
          style={{ zIndex: 1, backgroundColor: '#0070f3', marginTop: 15 }}
          onPress={() => setUploadModalOpen(true)}
        >
          {t('uploadAnnotatedDocuments')}
        </Button>
      </Container>
    </ToolbarLayout>
  );
};

// Protect this page - require authentication
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/sign-in',
        permanent: false,
      },
    };
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Collection;
