import { ToolbarLayout } from '@/components/ToolbarLayout';
import { useQuery, useMutation } from '@/utils/trpc';
import { Button, Spinner } from '@heroui/react';
import { NextPage, GetServerSideProps } from 'next';
import { useSession, getSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { FiArrowLeft } from '@react-icons/all-files/fi/FiArrowLeft';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import { FiGitMerge } from '@react-icons/all-files/fi/FiGitMerge';
import { FiSave } from '@react-icons/all-files/fi/FiSave';
import styled from '@emotion/styled';
import {
  App as AntdApp,
  message,
  Popconfirm,
  Select as AntSelect,
  Input as AntInput,
} from 'antd';
import type { FacetEntry } from '@/server/routers/entity';

// ─── Styled components (exact copies from [key].tsx) ───────────────────────

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
  padding: 20px 28px;
  margin: 20px 0 28px;
`;

// ─── Section card ───────────────────────────────────────────────────────────

const Section = styled.div`
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 24px;
  background: #fff;
`;

const SectionTitle = styled.h3`
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 20px;
`;

const DangerSection = styled(Section)`
  border-color: #fca5a5;
  background: #fff5f5;
`;

const DangerTitle = styled(SectionTitle)`
  color: #b91c1c;
`;

const FieldLabel = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
`;

const FieldGroup = styled.div`
  margin-bottom: 18px;
`;

// ─── Merge result row ────────────────────────────────────────────────────────

const MergeOption = styled.div<{ selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1.5px solid ${({ selected }) => (selected ? '#0366d6' : 'rgba(0,0,0,0.07)')};
  background: ${({ selected }) => (selected ? '#e8f2ff' : '#fafafa')};
  cursor: pointer;
  margin-bottom: 6px;
  transition: all 120ms ease;

  &:hover {
    border-color: #0366d6;
    background: #f0f7ff;
  }
`;

// ─── Type badge (exact copy from [key].tsx) ──────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

type MetaRow = { key: string; value: string };

const FACET_TYPES = [
  'PERSON',
  'GPE',
  'ORG',
  'DATE',
  'TIME',
  'CARDINAL',
  'FAC',
  'UNKNOWN',
];

const getEntityKey = (e: FacetEntry) =>
  e.ids_ER && e.ids_ER.length > 0 ? e.ids_ER[0] : e.display_name;

// ─── Page component ──────────────────────────────────────────────────────────

const EntityEdit: NextPage = () => {
  const { message } = AntdApp.useApp();
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = router.query.id as string | undefined;
  const rawKey = router.query.key as string | undefined;

  const token = (session as any)?.accessToken as string | undefined;
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const enabled = Boolean(id && rawKey && (token || authDisabled));

  // ── Load current entity ───────────────────────────────────────────────────
  const { data, isLoading, refetch  } = useQuery(
    [
      'entity.getById',
      {
        collectionId: id ?? '',
        key: rawKey ?? '',
        token,
        page: 1,
        limit: 1,
      },
    ],
    { enabled }
  );

  const entity = data?.entity as (FacetEntry & { doc_count?: number }) | undefined;

  // ── Section 1: edit form state ────────────────────────────────────────────
  const [displayName, setDisplayName] = useState('');
  const [facetType, setFacetType] = useState('');
  const [wikidataInput, setWikidataInput] = useState('');
  const [metadataRows, setMetadataRows] = useState<{ key: string; value: string }[]>([]);

  // Populate form once entity loads
  useEffect(() => {
    if (!entity) return;
    setDisplayName(entity.display_name ?? '');
    setFacetType(entity.facetType ?? '');
    setWikidataInput(
      entity.ids_ER?.find((u) => u.startsWith('http')) ?? ''
    );
    const meta = (entity as any).metadata ?? {};
    setMetadataRows(
      Object.entries(meta as Record<string, string>).map(([k, v]) => ({
        key: k,
        value: String(v),
      }))
    );
  }, [entity]);

  const updateDetailsMutation = useMutation(['entity.update'], {
    onSuccess: () => {
      message.success('Entity details updated');
      refetch();
    },
    onError: () => {
      message.error('Failed to update entity details');
    },
  });

  const updateMetadataMutation = useMutation(['entity.update'], {
    onSuccess: () => {
      message.success('Metadata updated');
      refetch();
    },
    onError: () => {
      message.error('Failed to update metadata');
    },
  });

  const handleSaveDetails = () => {
    if (!id || !rawKey) return;
    if (!displayName.trim()) {
      message.warning('Display name cannot be empty');
      return;
    }

    // Rebuild ids_ER: keep non-http synthetic ids, replace http entry with input
    const nonHttpIds =
      entity?.ids_ER?.filter((u) => !u.startsWith('http')) ?? [];
    const newIdsER = wikidataInput.trim()
      ? [wikidataInput.trim(), ...nonHttpIds]
      : nonHttpIds;

    updateDetailsMutation.mutate({
      collectionId: id,
      key: rawKey,
      token,
      display_name: displayName.trim(),
      facetType: facetType || undefined,
      ids_ER: newIdsER,
      elasticIndex: process.env.NEXT_PUBLIC_ELASTIC_INDEX,
    });
  };

  const handleSaveMetadata = () => {
    if (!id || !rawKey) return;

    // Validate metadata keys: lowercase letters, numbers, underscores only
    const invalidKeys = metadataRows.filter(
      (r: MetaRow) => r.key && !/^[a-z0-9_]+$/.test(r.key)
    );
    if (invalidKeys.length > 0) {
      message.warning(
        'Metadata keys must be lowercase letters, numbers, or underscores only'
      );
      return;
    }

    // Build metadata object (skip rows with empty keys)
    const metadata: Record<string, string> = {};
    for (const row of metadataRows) {
      if (row.key.trim()) {
        metadata[row.key.trim()] = row.value;
      }
    }

    updateMetadataMutation.mutate({
      collectionId: id,
      key: rawKey,
      token,
      metadata,
      elasticIndex: process.env.NEXT_PUBLIC_ELASTIC_INDEX,
    });
  };

  // ── Section 2: merge state ────────────────────────────────────────────────
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeQ, setMergeQ] = useState('');
  const [selectedMergeTarget, setSelectedMergeTarget] =
    useState<FacetEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMergeQ(mergeSearch), 300);
    return () => clearTimeout(t);
  }, [mergeSearch]);

  // Clear selection when search changes
  useEffect(() => {
    setSelectedMergeTarget(null);
  }, [mergeQ]);

  const mergeSearchEnabled = Boolean(
    id && (token || authDisabled) && mergeQ.trim().length > 0
  );

  const { data: mergeData, isLoading: mergeSearchLoading } = useQuery(
    [
      'entity.getAll',
      {
        collectionId: id ?? '',
        token,
        q: mergeQ || undefined,
        limit: 10,
        page: 1,
      },
    ],
    { enabled: mergeSearchEnabled }
  );

  // Exclude the current entity from merge candidates
  const mergeCandidates = (mergeData?.data ?? []).filter(
    (e) => getEntityKey(e) !== rawKey
  );

  const mergeMutation = useMutation(['entity.merge'], {
    onSuccess: () => {
      message.success('Entities merged');
      router.push(`/collections/${id}/entities`);
    },
    onError: () => {
      message.error('Failed to merge entities');
    },
  });

  const handleMerge = () => {
    if (!id || !rawKey || !selectedMergeTarget) return;
    mergeMutation.mutate({
      collectionId: id,
      source_key: rawKey,
      target_key: getEntityKey(selectedMergeTarget),
      token,
      elasticIndex: process.env.NEXT_PUBLIC_ELASTIC_INDEX,
    });
  };

  // ── Section 3: delete ─────────────────────────────────────────────────────
  const deleteMutation = useMutation(['entity.delete'], {
    onSuccess: () => {
      message.success('Entity deleted');
      router.push(`/collections/${id}/entities`);
    },
    onError: () => {
      message.error('Failed to delete entity');
    },
  });

  const handleDelete = () => {
    if (!id || !rawKey) return;
    deleteMutation.mutate({
      collectionId: id,
      key: rawKey,
      token,
      elasticIndex: process.env.NEXT_PUBLIC_ELASTIC_INDEX,
    });
  };

  // ── Loading / not found ───────────────────────────────────────────────────
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
            onPress={() =>
              router.push(`/collections/${id}/entities`)
            }
          >
            Back to Entity Registry
          </Button>
          <p style={{ marginTop: 24, color: '#9ca3af' }}>Entity not found.</p>
        </PageContainer>
      </ToolbarLayout>
    );
  }

  const docCount = entity.doc_count ?? entity.doc_ids?.length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ToolbarLayout>
      <PageContainer>
        {/* Navigation */}
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
              onPress={() =>
                router.push(
                  `/collections/${id}/entities/${encodeURIComponent(rawKey ?? '')}`
                )
              }
            >
              Back to entity
            </Button>
          </div>
        </Header>

        {/* Entity identity header */}
        <EntityHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: '#111827',
              }}
            >
              {entity.display_name}
            </h2>
            <TypeBadge type={entity.facetType} />
            <span
              style={{ fontSize: 13, color: '#6b7280' }}
            >{`${docCount} document${docCount !== 1 ? 's' : ''}`}</span>
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 13,
              color: '#9ca3af',
            }}
          >
            Editing entity — changes apply to all documents in this collection.
          </p>
        </EntityHeader>

        {/* ── SECTION 1: Edit details ── */}
        <Section>
          <SectionTitle>Edit details</SectionTitle>

          <FieldGroup>
            <FieldLabel htmlFor="edit-display-name">Display name</FieldLabel>
            <AntInput
              id="edit-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Entity display name"
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="edit-facet-type">Entity type</FieldLabel>
            <AntSelect
              id="edit-facet-type"
              value={facetType}
              onChange={(v) => setFacetType(v)}
              style={{ width: '100%' }}
              placeholder="Select type"
            >
              {FACET_TYPES.map((t) => (
                <AntSelect.Option key={t} value={t}>
                  {t}
                </AntSelect.Option>
              ))}
            </AntSelect>
          </FieldGroup>

          <FieldGroup style={{ marginBottom: 24 }}>
            <FieldLabel htmlFor="edit-wikidata">
              Wikidata URL{' '}
              <span style={{ fontWeight: 400, color: '#9ca3af' }}>
                (optional)
              </span>
            </FieldLabel>
            <AntInput
              id="edit-wikidata"
              value={wikidataInput}
              onChange={(e) => setWikidataInput(e.target.value)}
              placeholder="https://www.wikidata.org/entity/Q..."
            />
          </FieldGroup>

          <Button
            color="primary"
            startContent={<FiSave />}
            onPress={handleSaveDetails}
            isLoading={updateDetailsMutation.isLoading}
            isDisabled={!displayName.trim()}
          >
            Save details
          </Button>
        </Section>

        {/* ── SECTION 1b: Custom metadata ── */}
        <Section>
          <SectionTitle>Custom metadata</SectionTitle>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: -12,
              marginBottom: 20,
            }}
          >
            Add custom information about this entity.
          </p>

          {metadataRows.map((row: MetaRow, idx: number) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <AntInput
                value={row.key}
                onChange={(e: { target: { value: string } }) => {
                  const val = e.target.value.toLowerCase().replace(/\s/g, '_');
                  setMetadataRows((prev: MetaRow[]) =>
                    prev.map((r: MetaRow, i: number) =>
                      i === idx ? { ...r, key: val } : r
                    )
                  );
                }}
                placeholder="key"
                style={{ width: 160 }}
              />
              <AntInput
                value={row.value}
                onChange={(e: { target: { value: string } }) => {
                  const val = e.target.value;
                  setMetadataRows((prev: MetaRow[]) =>
                    prev.map((r: MetaRow, i: number) =>
                      i === idx ? { ...r, value: val } : r
                    )
                  );
                }}
                placeholder="value"
                style={{ flex: 1 }}
              />
              <button
                onClick={() =>
                  setMetadataRows((prev: MetaRow[]) =>
                    prev.filter((_: MetaRow, i: number) => i !== idx)
                  )
                }
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#ef4444',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: 4,
                  flexShrink: 0,
                }}
                title="Remove field"
              >
                ×
              </button>
            </div>
          ))}

          <Button
            size="sm"
            variant="flat"
            color="default"
            onPress={() =>
              setMetadataRows((prev: MetaRow[]) => [
                ...prev,
                { key: '', value: '' },
              ])
            }
            style={{ marginTop: metadataRows.length > 0 ? 4 : 0 }}
          >
            + Add field
          </Button>
          <Button
            color="primary"
            startContent={<FiSave />}
            onPress={handleSaveMetadata}
            isLoading={updateMetadataMutation.isLoading}
            style={{ marginTop: 12, marginLeft: 8 }}
          >
            Save metadata
          </Button>
        </Section>

        {/* ── SECTION 2: Merge ── */}
        <Section>
          <SectionTitle>Merge into another entity</SectionTitle>
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              marginTop: -12,
              marginBottom: 20,
            }}
          >
            All mentions of{' '}
            <strong>{entity.display_name}</strong> will move to the target
            entity, and this entry will be deleted.
          </p>

          <FieldGroup>
            <FieldLabel>Search target entity</FieldLabel>
            <AntInput
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              placeholder="Type to search entities..."
              allowClear
              onClear={() => {
                setMergeSearch('');
                setMergeQ('');
                setSelectedMergeTarget(null);
              }}
            />
          </FieldGroup>

          {/* Search results */}
          {mergeSearchLoading && (
            <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>
              Searching…
            </p>
          )}
          {!mergeSearchLoading &&
            mergeQ.trim().length > 0 &&
            mergeCandidates.length === 0 && (
              <p
                style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}
              >
                No entities found.
              </p>
            )}
          {mergeCandidates.map((candidate) => {
            const candidateKey = getEntityKey(candidate);
            const isSelected =
              selectedMergeTarget &&
              getEntityKey(selectedMergeTarget) === candidateKey;
            return (
              <MergeOption
                key={candidate._id}
                selected={!!isSelected}
                onClick={() =>
                  setSelectedMergeTarget(
                    isSelected ? null : candidate
                  )
                }
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: '#111827',
                    }}
                  >
                    {candidate.display_name}
                  </span>
                  <TypeBadge type={candidate.facetType} />
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {candidate.doc_count ?? candidate.doc_ids?.length ?? 0} docs
                </span>
              </MergeOption>
            );
          })}

          <div style={{ marginTop: 20 }}>
            <Popconfirm
              title="Merge entities"
              description={
                selectedMergeTarget
                  ? `Merge "${entity.display_name}" into "${selectedMergeTarget.display_name}"? This cannot be undone.`
                  : ''
              }
              okText="Merge"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={handleMerge}
              disabled={!selectedMergeTarget}
            >
              <Button
                color="warning"
                variant="flat"
                startContent={<FiGitMerge />}
                isDisabled={!selectedMergeTarget}
                isLoading={mergeMutation.isLoading}
              >
                {selectedMergeTarget
                  ? `Merge into "${selectedMergeTarget.display_name}"`
                  : 'Select a target to merge'}
              </Button>
            </Popconfirm>
          </div>
        </Section>

        {/* ── SECTION 3: Danger zone ── */}
        <DangerSection>
          <DangerTitle>Danger zone</DangerTitle>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                Delete &ldquo;{entity.display_name}&rdquo;
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 13,
                  color: '#6b7280',
                }}
              >
                Removes this entity and its annotation cluster from{' '}
                <strong>
                  {docCount} document{docCount !== 1 ? 's' : ''}
                </strong>
                . This cannot be undone.
              </p>
            </div>

            <Popconfirm
              title="Delete entity"
              description={`Permanently delete "${entity.display_name}"? This affects ${docCount} document${docCount !== 1 ? 's' : ''} and cannot be undone.`}
              okText="Delete"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
              onConfirm={handleDelete}
            >
              <Button
                color="danger"
                variant="flat"
                startContent={<FiTrash2 />}
                isLoading={deleteMutation.isLoading}
              >
                Delete entity
              </Button>
            </Popconfirm>
          </div>
        </DangerSection>
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

export default EntityEdit;
