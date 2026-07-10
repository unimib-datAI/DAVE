import { ToolbarLayout } from '@/components/ToolbarLayout';
import { useQuery, useMutation } from '@/utils/trpc';
import { Button, Pagination, Spinner } from '@heroui/react';
import { NextPage, GetServerSideProps } from 'next';
import { useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { FiEdit2 } from '@react-icons/all-files/fi/FiEdit2';
import { FiExternalLink } from '@react-icons/all-files/fi/FiExternalLink';
import styled from '@emotion/styled';
import { message, Modal, Input as AntInput } from 'antd';
import type { FacetEntry } from '@/server/routers/entity';

const PageContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: start;
  align-items: start;
  margin-top: 25px;
  margin-bottom: 0px;
`;

const EntityHeader = styled.div`
  background: #f5f7fb;
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 12px;
  padding: 24px 28px;
  margin: 20px 0 24px;
`;

const MentionCard = styled.div`
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 10px;
  background: #fff;

  &:hover {
    background: #fafbff;
    border-color: rgba(3, 102, 214, 0.2);
  }
`;

const ContextSnippet = styled.p`
  font-size: 14px;
  color: #374151;
  margin: 8px 0 0;
  line-height: 1.6;
  font-family: 'Georgia', serif;
`;

const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  PERSON:       { bg: '#dbeafe', color: '#1d4ed8' },
  ORG:          { bg: '#ede9fe', color: '#6d28d9' },
  ORGANIZATION: { bg: '#ede9fe', color: '#6d28d9' },
  GPE:          { bg: '#dcfce7', color: '#15803d' },
  LOC:          { bg: '#dcfce7', color: '#15803d' },
  LOCATION:     { bg: '#dcfce7', color: '#15803d' },
  DATE:         { bg: '#fef3c7', color: '#b45309' },
  TIME:         { bg: '#fef3c7', color: '#b45309' },
  MISC:         { bg: '#fce7f3', color: '#9d174d' },
};

const getTypeStyle = (type: string) =>
  TYPE_COLORS[type.toUpperCase()] ?? { bg: '#f1f5f9', color: '#475569' };

const TypeBadge = ({ type }: { type: string }) => {
  const { bg, color } = getTypeStyle(type);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 12px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 700,
        background: bg,
        color,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {type}
    </span>
  );
};

const LinkedBadge = ({ isLinked }: { isLinked: boolean }) => (
  <span
    style={{
      display: 'inline-flex',
      padding: '3px 12px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 700,
      background: isLinked ? '#dcfce7' : '#f1f5f9',
      color: isLinked ? '#15803d' : '#9ca3af',
      letterSpacing: '0.04em',
    }}
  >
    {isLinked ? 'Linked' : 'NIL'}
  </span>
);

const highlightMention = (context: string, mention: string) => {
  if (!mention) return context;
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = context.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === mention.toLowerCase() ? (
          <mark
            key={i}
            style={{
              background: '#fef08a',
              borderRadius: 2,
              padding: '0 1px',
              fontWeight: 600,
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

const MENTIONS_PER_PAGE = 10;

const EntityDetail: NextPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const rawKey = router.query.key as string | undefined;

  const token = (session as any)?.accessToken as string | undefined;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';

  const [mentionPage, setMentionPage] = useState(1);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');

  const enabled = Boolean(id && rawKey && (token || authDisabled));

  const { data, isLoading, refetch } = useQuery(
    [
      'entity.getById',
      {
        collectionId: id ?? '',
        key: rawKey ?? '',
        token,
        page: mentionPage,
        limit: MENTIONS_PER_PAGE,
      },
    ],
    { enabled }
  );

  const updateMutation = useMutation(['entity.update'], {
    onSuccess: () => {
      message.success('Entity updated');
      setEditModalOpen(false);
      refetch();
    },
    onError: () => {
      message.error('Failed to update entity');
    },
  });

  const entity = data?.entity as (FacetEntry & { doc_count?: number }) | undefined;
  const mentions = data?.mentions ?? [];
  const pagination = data?.pagination;

  const wikidataUrl =
    entity?.is_linked && entity?.ids_ER?.length
      ? entity.ids_ER.find((u) => u.startsWith('http'))
      : null;

  const handleOpenEdit = () => {
    setEditName(entity?.display_name ?? '');
    setEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!id || !rawKey || !editName.trim()) return;
    updateMutation.mutate({
      collectionId: id,
      key: rawKey,
      token,
      display_name: editName.trim(),
      elasticIndex: process.env.NEXT_PUBLIC_ELASTIC_INDEX,
    });
  };

  if (status === 'loading' || isLoading) {
    return (
      <ToolbarLayout>
        <PageContainer>
          <Spinner size="lg" />
        </PageContainer>
      </ToolbarLayout>
    );
  }

  if (!entity) {
    return (
      <ToolbarLayout>
        <PageContainer>
          <Button
            color="primary"
            startContent={<FiArrowLeft />}
            onPress={() => router.push(`/collections/${id}/entities`)}
          >
            Back to Entity Registry
          </Button>
          <p style={{ marginTop: 24, color: '#9ca3af' }}>Entity not found.</p>
        </PageContainer>
      </ToolbarLayout>
    );
  }

  return (
    <ToolbarLayout>
      <PageContainer>
        <Header>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <Button
              color="primary"
              startContent={<FiArrowLeft />}
              onPress={() => router.push(`/collections/${id}/entities`)}
            >
              Back to Entity Registry
            </Button>
            <Button
              variant="flat"
              color="secondary"
              startContent={<FiEdit2 />}
              onPress={() =>
  router.push(`/collections/${id}/entities/${encodeURIComponent(rawKey ?? '')}/edit`)
       }
            >
              Edit
            </Button>
          </div>
        </Header>

        <EntityHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 700,
                color: '#111827',
              }}
            >
              {entity.display_name}
            </h2>
            <TypeBadge type={entity.facetType} />
            <LinkedBadge isLinked={entity.is_linked} />
          </div>

          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: '#6b7280', display: 'block' }}>
                Documents
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                {entity.doc_count ?? entity.doc_ids?.length ?? 0}
              </span>
            </div>
            <div>
              <span style={{ fontSize: 12, color: '#6b7280', display: 'block' }}>
                Total mentions
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                {pagination?.total ?? '—'}
              </span>
            </div>
            {wikidataUrl && (
              <div>
                <span
                  style={{ fontSize: 12, color: '#6b7280', display: 'block' }}
                >
                  Wikidata
                </span>
                <a
                  href={wikidataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                    color: '#0366d6',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  {wikidataUrl.replace('http://www.wikidata.org/entity/', 'wd:')}
                  <FiExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          {entity.metadata && Object.keys(entity.metadata).length > 0 && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              {Object.entries(entity.metadata).map(([k, v]) => (
                <div
                  key={k}
                  style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}
                >
                  <span style={{ fontWeight: 600, color: '#6b7280' }}>{k}:</span>{' '}
                  {v}
                </div>
              ))}
            </div>
          )}
        </EntityHeader>

        {/* Mentions list */}
        <div style={{ marginBottom: 8 }}>
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              margin: '0 0 12px',
              color: '#374151',
            }}
          >
            Mentions
          </h3>
        </div>

        {mentions.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '16px 0' }}>
            No mentions available.
          </p>
        ) : (
          mentions.map((mention, idx) => (
            <MentionCard key={`${mention.doc_id}-${mention.annotation_id ?? idx}`}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}
                >
                  {mention.doc_name || mention.doc_id}
                </span>
                <Button
                  size="sm"
                  variant="flat"
                  color="primary"
                  onPress={() =>
                    router.push(`/documents/${mention.doc_id}`)
                  }
                >
                  Open document
                </Button>
              </div>
              <ContextSnippet>
                {highlightMention(mention.context, mention.text)}
              </ContextSnippet>
            </MentionCard>
          ))
        )}

        {(pagination?.totalPages ?? 1) > 1 && (
          <div
            style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}
          >
            <Pagination
              total={pagination?.totalPages ?? 1}
              page={mentionPage}
              onChange={(p) => setMentionPage(p)}
            />
          </div>
        )}

        {/* Edit modal */}
        <Modal
          title="Edit entity"
          open={editModalOpen}
          onCancel={() => setEditModalOpen(false)}
          onOk={handleSaveEdit}
          okText="Save"
          confirmLoading={updateMutation.isLoading}
        >
          <div style={{ marginTop: 12 }}>
            <label
              style={{
                fontSize: 13,
                fontWeight: 500,
                display: 'block',
                marginBottom: 6,
              }}
            >
              Display name
            </label>
            <AntInput
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Entity display name"
            />
          </div>
        </Modal>
      </PageContainer>
    </ToolbarLayout>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);
    if (!session) {
      return {
        redirect: { destination: '/sign-in', permanent: false },
      };
    }
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: { locale: localeObj },
  };
};

export default EntityDetail;
