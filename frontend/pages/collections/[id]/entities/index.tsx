import { ToolbarLayout } from '@/components/ToolbarLayout';
import { useQuery, useMutation, useContext } from '@/utils/trpc';
import { Button, Input, Pagination, Spinner } from '@heroui/react';
import { NextPage, GetServerSideProps } from 'next';
import { useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import styled from '@emotion/styled';
import { Select, message, Popconfirm } from 'antd';
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

const TableWrapper = styled.div`
  overflow-x: auto;
  padding: 0 16px;
  margin-top: 12px;

  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 14px;
  }

  thead th {
    background: #f5f7fb;
    font-weight: 700;
    padding: 12px 8px;
    text-align: left;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  thead th:first-child {
    border-top-left-radius: 8px;
  }

  thead th:last-child {
    border-top-right-radius: 8px;
  }

  tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.04);
    vertical-align: top;
  }

  tbody tr:hover td {
    background: rgba(0, 0, 0, 0.02);
  }
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0 8px;
  padding: 0 16px;
`;

const TypeChip = styled.button<{ active: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 4px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid ${({ active }) => (active ? '#0366d6' : '#d1d5db')};
  background: ${({ active }) => (active ? '#e8f2ff' : '#fff')};
  color: ${({ active }) => (active ? '#0366d6' : '#6b7280')};
  transition: all 120ms ease;

  &:hover {
    border-color: #0366d6;
    color: #0366d6;
  }
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
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 11,
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
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: 11,
      fontWeight: 700,
      background: isLinked ? '#dcfce7' : '#f1f5f9',
      color: isLinked ? '#15803d' : '#9ca3af',
      letterSpacing: '0.04em',
    }}
  >
    {isLinked ? 'Linked' : 'NIL'}
  </span>
);

const PAGE_SIZE = 25;

const EntityRegistry: NextPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const utils = useContext();

  const token = (session as any)?.accessToken as string | undefined;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const enabled = Boolean(id && (token || authDisabled));

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [linkedFilter, setLinkedFilter] = useState<
    'all' | 'linked' | 'nil'
  >('all');
  const [sort, setSort] = useState<'doc_count' | 'display_name'>('doc_count');

  // debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedType, linkedFilter, sort]);

  const is_linked =
    linkedFilter === 'linked'
      ? true
      : linkedFilter === 'nil'
      ? false
      : undefined;

  const { data, isLoading, refetch } = useQuery(
    [
      'entity.getAll',
      {
        collectionId: id ?? '',
        token,
        page,
        limit: PAGE_SIZE,
        type: selectedType ?? undefined,
        q: q || undefined,
        sort,
        is_linked,
      },
    ],
    { enabled }
  );

  const deleteMutation = useMutation(['entity.delete'], {
    onSuccess: () => {
      message.success('Entity deleted');
      refetch();
    },
    onError: () => {
      message.error('Failed to delete entity');
    },
  });

  const entities: FacetEntry[] = data?.data ?? [];
  const types: string[] = data?.types ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  const getEntityKey = (e: FacetEntry) =>
    e.ids_ER && e.ids_ER.length > 0 ? e.ids_ER[0] : e.display_name;

  const handleView = (e: FacetEntry) => {
    router.push(
      `/collections/${id}/entities/${encodeURIComponent(getEntityKey(e))}`
    );
  };

  const handleDelete = async (e: FacetEntry) => {
    await deleteMutation.mutateAsync({
      collectionId: id ?? '',
      key: getEntityKey(e),
      token,
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
              onPress={() => router.push(`/collections/${id}`)}
            >
              Back to Collection
            </Button>
          </div>
          <h2 className="text-2xl font-bold mt-4">Entity Registry</h2>
          <p style={{ color: '#6b7280', marginTop: 4, fontSize: 14 }}>
            Browse, search, and manage all entities in this collection.
          </p>
        </Header>

        <FilterBar>
          <Input
            placeholder="Search entities..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ width: 240 }}
            size="sm"
          />
          <Select
            value={linkedFilter}
            onChange={(v) => setLinkedFilter(v as 'all' | 'linked' | 'nil')}
            style={{ width: 140 }}
            size="small"
          >
            <Select.Option value="all">All status</Select.Option>
            <Select.Option value="linked">Linked only</Select.Option>
            <Select.Option value="nil">NIL only</Select.Option>
          </Select>
          <Select
            value={sort}
            onChange={(v) =>
              setSort(v as 'doc_count' | 'display_name')
            }
            style={{ width: 160 }}
            size="small"
          >
            <Select.Option value="doc_count">Sort: Frequency</Select.Option>
            <Select.Option value="display_name">Sort: Name A–Z</Select.Option>
          </Select>
        </FilterBar>

        {/* Type filter chips */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            padding: '4px 16px 8px',
          }}
        >
          <TypeChip
            active={selectedType === null}
            onClick={() => setSelectedType(null)}
          >
            ALL
          </TypeChip>
          {types.map((type) => (
            <TypeChip
              key={type}
              active={selectedType === type}
              onClick={() =>
                setSelectedType(selectedType === type ? null : type)
              }
            >
              {type}
            </TypeChip>
          ))}
        </div>

        <TableWrapper>
          <table aria-label="Entity registry">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th style={{ width: 90 }}>Documents</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entities.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: 'center',
                      padding: 32,
                      color: '#9ca3af',
                    }}
                  >
                    No entities found.
                  </td>
                </tr>
              ) : (
                entities.map((e) => (
                  <tr key={e._id}>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>
                      {e.display_name}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <TypeBadge type={e.facetType} />
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: '#374151',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {e.doc_count ?? (e.doc_ids?.length ?? 0)}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <LinkedBadge isLinked={e.is_linked} />
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          onPress={() => handleView(e)}
                        >
                          View
                        </Button>
                        <Popconfirm
                          title="Delete entity"
                          description="Remove this entity and its cluster from all documents?"
                          okText="Delete"
                          cancelText="Cancel"
                          onConfirm={() => handleDelete(e)}
                        >
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            isDisabled={deleteMutation.isLoading}
                          >
                            <FiTrash2 />
                          </Button>
                        </Popconfirm>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrapper>

        <div
          style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}
        >
          <Pagination
            total={Math.max(1, totalPages)}
            page={page}
            onChange={(p) => setPage(p)}
          />
        </div>
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

export default EntityRegistry;
