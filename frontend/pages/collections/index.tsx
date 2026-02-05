import type { NextPage, GetServerSideProps } from 'next';
import { useState, useEffect, useRef } from 'react';
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
    if (
      status === 'unauthenticated' &&
      process.env.NEXT_PUBLIC_USE_AUTH !== 'false'
    ) {
      router.push('/sign-in');
    }
  }, [status, router]);

  const token = (session as any)?.accessToken as string | undefined;
  const tokenAvailable =
    !!token && typeof token === 'string' && token.trim().length > 0;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';

  const {
    data: collectionsData,
    isLoading: collectionsLoading,
    refetch: refetchCollections,
  } = useQuery(['collection.getAll', { token }], {
    enabled: tokenAvailable || authDisabled,
    onSuccess: (data) => {
      if (data) {
        setCollections(data);
      }
    },
  });

  const { data: usersData } = useQuery(['user.getAllUsers', { token }], {
    enabled: tokenAvailable || authDisabled,
    onSuccess: (data) => {
      if (data) {
        setUsers(data);
      }
    },
  });

  const createMutation = useMutation(['collection.create'], {
    onMutate: (variables) => {
      console.debug('[collection.create] onMutate', variables);
    },
    onSuccess: () => {
      refetchCollections();
      setModalOpen(false);
      setFormData({ name: '', allowedUserIds: [] });
    },
    onError: (err) => {
      console.error('[collection.create] error', err);
    },
  });

  const updateMutation = useMutation(['collection.update'], {
    onMutate: (variables) => {
      console.debug('[collection.update] onMutate', variables);
    },
    onSuccess: () => {
      refetchCollections();
      setModalOpen(false);
      setFormData({ name: '', allowedUserIds: [] });
    },
    onError: (err) => {
      console.error('[collection.update] error', err);
    },
  });

  const deleteMutation = useMutation(['collection.delete'], {
    onMutate: (variables) => {
      console.debug('[collection.delete] onMutate', variables);
    },
    onSuccess: (result) => {
      refetchCollections();
      if (activeCollection?.id === result.collection.id) {
        setActiveCollection(null);
      }
    },
    onError: (err) => {
      console.error('[collection.delete] error', err);
    },
  });

  const [exportingCollectionId, setExportingCollectionId] = useState<
    string | null
  >(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportLogs, setExportLogs] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

  // State and TRPC-driven download flow
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { data: downloadData, isLoading: isDownloading } = useQuery(
    ['collection.download', { id: downloadingId || '', token }],
    {
      enabled: !!downloadingId && (tokenAvailable || authDisabled),
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

  const pollRef = useRef<number | null>(null);

  const cleanupPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startExport = async (collectionId: string) => {
    setExportLogs('');
    setExportingCollectionId(collectionId);
    setIsExporting(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_DOCS_BASE_URL || ''}/api/export/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && !authDisabled
              ? { Authorization: `Bearer ${token}` }
              : {}),
          },
          body: JSON.stringify({ collectionId }),
        }
      );
      if (!res.ok) throw new Error('Failed to start export');
      const data = await res.json();
      const jobId = data.jobId;
      setExportJobId(jobId);

      // start polling for status and logs
      pollRef.current = window.setInterval(async () => {
        try {
          const sRes = await fetch(`/api/export/${jobId}/status`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' },
          });
          if (!sRes.ok) throw new Error('Status fetch failed');
          const sJson = await sRes.json();

          // fetch logs for progress
          const lRes = await fetch(`/api/export/${jobId}/logs?tail=4096`, {
            headers: { Authorization: token ? `Bearer ${token}` : '' },
          });
          if (lRes.ok) {
            const lJson = await lRes.json();
            setExportLogs(lJson.logs || '');
          }

          if (sJson && sJson.status) {
            if (sJson.status === 'completed') {
              // final logs
              try {
                const lFinal = await fetch(
                  `/api/export/${jobId}/logs?tail=8192`,
                  {
                    headers: { Authorization: token ? `Bearer ${token}` : '' },
                  }
                );
                if (lFinal.ok) {
                  const lj = await lFinal.json();
                  setExportLogs(lj.logs || '');
                }
              } catch (e) {
                console.warn('Failed to fetch final logs', e);
              }

              // download file
              const dlRes = await fetch(`/api/export/${jobId}/download`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' },
              });
              if (!dlRes.ok) {
                throw new Error('Download failed');
              }
              const blob = await dlRes.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              // attempt to parse filename from headers
              const cd = dlRes.headers.get('Content-Disposition');
              const filenameMatch = cd
                ? cd.match(/filename=\"?([^\";]+)\"?/)
                : null;
              const filename = filenameMatch
                ? filenameMatch[1]
                : `collection_${collectionId}.zip`;
              a.href = url;
              a.download = filename;
              a.click();
              window.URL.revokeObjectURL(url);

              cleanupPolling();
              setExportingCollectionId(null);
              setExportJobId(null);
              setIsExporting(false);
            } else if (sJson.status === 'failed') {
              // final logs on failure
              try {
                const lFinal = await fetch(
                  `/api/export/${jobId}/logs?tail=8192`,
                  {
                    headers: { Authorization: token ? `Bearer ${token}` : '' },
                  }
                );
                if (lFinal.ok) {
                  const lj = await lFinal.json();
                  setExportLogs(lj.logs || '');
                }
              } catch (e) {
                console.warn('Failed to fetch logs after failure', e);
              }

              cleanupPolling();
              setIsExporting(false);
              setExportingCollectionId(null);
              setExportJobId(null);
            }
          }
        } catch (err) {
          console.error('Export polling error', err);
          cleanupPolling();
          setIsExporting(false);
          setExportingCollectionId(null);
          setExportJobId(null);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to start export', err);
      setIsExporting(false);
      setExportingCollectionId(null);
    }
  };

  const handleDownload = (collection: Collection) => {
    // Use TRPC-backed download flow: set downloadingId, the useQuery above will run
    setDownloadingId(collection.id);
  };
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
    const payload = {
      id: collectionId,
      token: authDisabled ? undefined : token,
    };
    console.info('[collections] delete payload', payload);
    deleteMutation.mutate(payload);
  };

  const handleSubmit = async () => {
    // Require a name always
    if (!formData.name.trim()) return;
    // Allow creating collections when auth is disabled. Otherwise require a token.
    if (!authDisabled && !token) return;

    if (editingCollection) {
      const payload = {
        id: editingCollection.id,
        name: formData.name,
        allowedUserIds: formData.allowedUserIds,
        token: authDisabled ? undefined : token,
      };
      console.info('[collections] update payload', payload);
      updateMutation.mutate(payload);
    } else {
      const payload = {
        name: formData.name,
        allowedUserIds: formData.allowedUserIds,
        token: authDisabled ? undefined : token,
      };
      console.info('[collections] create payload', payload);
      createMutation.mutate(payload);
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
          <Text h2>{t('title')}</Text>
          <Button auto color="primary" icon={<FiPlus />} onPress={handleCreate}>
            {t('newCollection')}
          </Button>
        </Header>

        {collections.length === 0 ? (
          <Card>
            <Card.Body css={{ textAlign: 'center', padding: '40px' }}>
              <Text color="$gray600">{t('emptyState')}</Text>
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
                        {t('owner')}
                      </Text>
                    )}
                  </div>
                  <Actions>
                    <IconBtn
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(collection);
                      }}
                      title={t('download')}
                      disabled={
                        (isExporting &&
                          exportingCollectionId === collection.id) ||
                        (isDownloading && downloadingId === collection.id)
                      }
                    >
                      {(isExporting &&
                        exportingCollectionId === collection.id) ||
                      (isDownloading && downloadingId === collection.id) ? (
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
                      title={t('edit')}
                    >
                      <EditIcon size={18} />
                    </IconBtn>
                    {collection.ownerId === (session?.user as any)?.userId && (
                      <Popconfirm
                        title={t('deleteTitle')}
                        description={t('deleteDescription')}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(collection.id);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText={t('yes')}
                        cancelText={t('no')}
                      >
                        <IconBtn
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          title={t('delete')}
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
                          {t('sharedWith')}
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
              {editingCollection ? t('editModalTitle') : t('newModalTitle')}
            </Text>
          </Modal.Header>
          <Modal.Body>
            <Input
              fullWidth
              label={t('collectionNameLabel')}
              placeholder={t('collectionNamePlaceholder')}
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
            <Spacer y={1} />
            <Text size={14} weight="medium">
              {t('shareWithUsers')}
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
                .filter((user) => user.id !== (session as any)?.user?.userId)
                .map((user) => (
                  <label
                    key={user.id}
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
              {t('cancel')}
            </Button>
            <Button
              auto
              color="primary"
              onPress={handleSubmit}
              disabled={createMutation.isLoading || updateMutation.isLoading}
            >
              {editingCollection ? t('update') : t('create')}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </ToolbarLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  const localeMap: { [key: string]: string } = { en: 'eng', ita: 'ita' };
  const locale = localeMap[process.env.LOCALE || 'ita'] || 'ita';
  const localeObj = (await import(`../../translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};

export default Collections;
