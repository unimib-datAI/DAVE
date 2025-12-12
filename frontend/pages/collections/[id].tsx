import { ToolbarLayout } from '@/components';
import { useContext, useMutation, useQuery } from '@/utils/trpc';
import { Button, Container, Loading, Table, Text } from '@nextui-org/react';
import { NextPage } from 'next';
import { useSession } from 'next-auth/react';
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
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const utils = useContext();
  const enabled = Boolean(id && session?.accessToken);
  const [allCollections] = useAtom(collectionsAtom);
  const [, setUploadModalOpen] = useAtom(uploadModalOpenAtom);

  const [currentCollectionName, setCurrentCollectionName] = useState(null);
  // delete mutation with onSuccess that updates cache locally
  const deleteDocumentMutation = useMutation(['document.deleteDocument'], {
    onSuccess: (_result, variables) => {
      // Build the same query key you use in useQuery
      const queryKey = [
        'collection.getCollectionInfo',
        { id: id ?? '', token: session?.accessToken },
      ];

      // Remove the deleted doc from the cached array (instant local update)
      utils.setQueryData<collectionDocInfo[] | undefined>(queryKey, (old) =>
        old ? old.filter((d) => d.id !== variables.docId) : old
      );

      // Optionally show a success message
      message.success('Document deleted successfully');
    },
    onError: () => {
      message.error('Error deleting the document');
    },
  });
  const { data, isLoading, refetch } = useQuery(
    [
      'collection.getCollectionInfo',
      { id: id ?? '', token: session?.accessToken },
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
            Back to collections{' '}
          </Button>
          <Text h2>
            Collection{' '}
            <Chip aria-label="collection-name">
              {currentCollectionName || 'untitled'}
            </Chip>{' '}
            documents
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
            <Table.Column>Id</Table.Column>
            <Table.Column>Name</Table.Column>
            <Table.Column>Preview</Table.Column>
            <Table.Column width={100}>Actions</Table.Column>
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
                      : 'No preview available'}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Popconfirm
                    okText="Confirm"
                    cancelText="Cancel"
                    title="Delete document"
                    description={`Are you sure you want to delete this document?`}
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
        <UploadDocumentsModal />
        <Button
          style={{ zIndex: 1, backgroundColor: '#0070f3', marginTop: 15 }}
          onPress={() => setUploadModalOpen(true)}
        >
          Upload annotated documents
        </Button>
      </Container>
    </ToolbarLayout>
  );
};
export default Collection;
