import type { NextPage, GetServerSideProps } from 'next';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import styled from '@emotion/styled';
import {
  Card,
  Text,
  Button,
  Input,
  Modal,
  Table,
  Dropdown,
  Loading,
  Spacer,
  Grid,
} from '@nextui-org/react';
import { Popconfirm } from 'antd';
import { FiPlus } from '@react-icons/all-files/fi/FiPlus';
import { FiEdit2 as EditIcon } from '@react-icons/all-files/fi/FiEdit2';
import { FiTrash2 as TrashIcon } from '@react-icons/all-files/fi/FiTrash2';
import { FiUsers as UsersIcon } from '@react-icons/all-files/fi/FiUsers';
import { FiDownload } from '@react-icons/all-files/fi/FiDownload';
import { useAtom } from 'jotai';
import {
  collectionsAtom,
  activeCollectionAtom,
  Collection,
} from '@/atoms/collection';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import { useQuery, useMutation } from '@/utils/trpc';
import { useText } from '@/components/TranslationProvider';

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
`;

const CollectionCard = styled(Card)`
  margin-bottom: 16px;
  transition: all 150ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
`;

const CardContent = styled.div`
  padding: 0 20px 16px 20px;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const IconBtn = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;

const UserBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 12px;
  font-size: 13px;
  color: #6b7280;
`;

interface User {
  id: string;
  email: string;
  name?: string;
}

const Collections: NextPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [collections, setCollections] = useAtom(collectionsAtom);
  const [activeCollection, setActiveCollection] = useAtom(activeCollectionAtom);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: '',
    allowedUserIds: [] as string[],
  });

  const t = useText('collections');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/sign-in');
    }
  }, [status, router]);

  const token = (session as any)?.accessToken as string | undefined;
  const tokenAvailable =
    !!token && typeof token === 'string' && token.trim().length > 0;

  const {
    data: collectionsData,
    isLoading: collectionsLoading,
    refetch: refetchCollections,
  } = useQuery(['collection.getAll', { token }], {
    enabled: tokenAvailable,
    onSuccess: (data) => {
      if (data) {
        setCollections(data);
      }
    },
  });

  const { data: usersData } = useQuery(['user.getAllUsers', { token }], {
    enabled: tokenAvailable,
    onSuccess: (data) => {
      if (data) {
        setUsers(data);
      }
    },
  });

  const createMutation = useMutation('collection.create', {
    onSuccess: () => {
      refetchCollections();
      setModalOpen(false);
      setFormData({ name: '', allowedUserIds: [] });
    },
  });

  const updateMutation = useMutation('collection.update', {
    onSuccess: () => {
      refetchCollections();
      setModalOpen(false);
      setFormData({ name: '', allowedUserIds: [] });
    },
  });

  const deleteMutation = useMutation('collection.delete', {
    onSuccess: (result) => {
      refetchCollections();
      if (activeCollection?.id === result.collection.id) {
        setActiveCollection(null);
      }
    },
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: downloadData, isLoading: isDownloading } = useQuery(
    ['collection.download', { id: downloadingId || '', token }],
    {
      enabled: !!downloadingId && tokenAvailable,
      onSuccess: (data) => {
        if (data) {
          const blob = new Blob(
            [Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0))],
            { type: 'application/zip' }
          );
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = data.filename;
          a.click();
          window.URL.revokeObjectURL(url);
          setDownloadingId(null);
        }
      },
    }
  );

  useEffect(() => {
    setLoading(collectionsLoading);
  }, [collectionsLoading]);

  const handleCreate = () => {
    setEditingCollection(null);
    setFormData({ name: '', allowedUserIds: [] });
    setModalOpen(true);
  };

  const handleEdit = (collection: Collection) => {
    setEditingCollection(collection);
    setFormData({
      name: collection.name,
      allowedUserIds: collection.allowedUserIds || [],
    });
    setModalOpen(true);
  };

  const handleDelete = async (collectionId: string) => {
    deleteMutation.mutate({
      id: collectionId,
      token: (session as any)?.accessToken,
    });
  };

  const handleDownload = (collection: Collection) => {
    setDownloadingId(collection.id);
  };

  const handleSubmit = async () => {
    if (!(session as any)?.accessToken || !formData.name.trim()) return;

    if (editingCollection) {
      updateMutation.mutate({
        id: editingCollection.id,
        name: formData.name,
        allowedUserIds: formData.allowedUserIds,
        token: (session as any).accessToken,
      });
    } else {
      createMutation.mutate({
        name: formData.name,
        allowedUserIds: formData.allowedUserIds,
        token: (session as any).accessToken,
      });
    }
  };

  const toggleUser = (userId: string) => {
    setFormData((prev) => ({
      ...prev,
      allowedUserIds: prev.allowedUserIds.includes(userId)
        ? prev.allowedUserIds.filter((id) => id !== userId)
        : [...prev.allowedUserIds, userId],
    }));
  };

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user?.name || user?.email || userId;
  };

  if (status === 'loading' || loading) {
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
          <Text h2>{t.title}</Text>
          <Button auto color="primary" icon={<FiPlus />} onPress={handleCreate}>
            {t.newCollection}
          </Button>
        </Header>

        {collections.length === 0 ? (
          <Card>
            <Card.Body css={{ textAlign: 'center', padding: '40px' }}>
              <Text color="$gray600">{t.emptyState}</Text>
            </Card.Body>
          </Card>
        ) : (
          collections.map((collection) => (
            <div
              key={collection.id}
              onClick={() => {
                console.log('clicked collection', collection.id);
                router.push(`/collections/${collection.id}`);
              }}
            >
              <CollectionCard style={{ cursor: 'pointer' }}>
                <CardHeader>
                  <div>
                    <Text h4 css={{ margin: 0 }}>
                      {collection.name}
                    </Text>
                    {collection.ownerId === (session?.user as any)?.userId && (
                      <Text
                        size={12}
                        color="$gray600"
                        css={{ marginTop: '4px' }}
                      >
                        {t.owner}
                      </Text>
                    )}
                  </div>
                  <Actions>
                    <IconBtn
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(collection);
                      }}
                      title={t.download}
                      disabled={
                        isDownloading && downloadingId === collection.id
                      }
                    >
                      {isDownloading && downloadingId === collection.id ? (
                        <Loading size="xs" />
                      ) : (
                        <FiDownload size={18} />
                      )}
                    </IconBtn>
                    <IconBtn
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(collection);
                      }}
                      title={t.edit}
                    >
                      <EditIcon size={18} />
                    </IconBtn>
                    {collection.ownerId === (session?.user as any)?.userId && (
                      <Popconfirm
                        title={t.deleteTitle}
                        description={t.deleteDescription}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(collection.id);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText={t.yes}
                        cancelText={t.no}
                      >
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          title={t.delete}
                          style={{ color: '#ef4444' }}
                        >
                          <TrashIcon size={18} />
                        </IconBtn>
                      </Popconfirm>
                    )}
                  </Actions>
                </CardHeader>
                <CardContent>
                  {collection.allowedUserIds &&
                    collection.allowedUserIds.length > 0 && (
                      <div>
                        <Text
                          size={13}
                          color="$gray600"
                          css={{ marginBottom: '8px' }}
                        >
                          {t.sharedWith}
                        </Text>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {collection.allowedUserIds.map((userId) => (
                            <UserBadge key={userId}>
                              <UsersIcon size={12} />
                              {getUserName(userId)}
                            </UserBadge>
                          ))}
                        </div>
                      </div>
                    )}
                </CardContent>
              </CollectionCard>
            </div>
          ))
        )}

        <Modal
          closeButton
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          width="600px"
        >
          <Modal.Header>
            <Text h3>
              {editingCollection ? t.editModalTitle : t.newModalTitle}
            </Text>
          </Modal.Header>
          <Modal.Body>
            <Input
              fullWidth
              label={t.collectionNameLabel}
              placeholder={t.collectionNamePlaceholder}
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <Spacer y={1} />
            <Text size={14} weight="medium">
              {t.shareWithUsers}
            </Text>
            <Spacer y={0.5} />
            <div
              style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
              }}
            >
              {users
                .filter((user) => user.userId !== session?.user?.userId)
                .map((user) => (
                  <label
                    key={user.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = '#f9fafb')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = 'transparent')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={formData.allowedUserIds.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                      style={{ marginRight: '12px' }}
                    />
                    <div>
                      <Text size={14}>{user.name || user.email}</Text>
                      {user.name && (
                        <Text size={12} color="$gray600">
                          {user.email}
                        </Text>
                      )}
                    </div>
                  </label>
                ))}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button auto flat onPress={() => setModalOpen(false)}>
              {t.cancel}
            </Button>
            <Button
              auto
              color="primary"
              onPress={handleSubmit}
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {editingCollection ? t.update : t.create}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </ToolbarLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Collections;
