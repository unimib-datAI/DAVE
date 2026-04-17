import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { GetServerSideProps, NextPage } from 'next';
import { getSession } from 'next-auth/react';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import { useText } from '@/components/TranslationProvider';
import { usePermissions, useIsAdmin } from '@/hooks';
import { useMutation, useQuery, useContext } from '@/utils/trpc';
import {
  Checkbox,
  message,
  Modal,
  Form,
  Input,
  Select as AntSelect,
  Tag,
  Popconfirm,
} from 'antd';
import { Button, Spinner } from '@heroui/react';
import { Shield, Lock, Users } from 'lucide-react';
import type { DAVEPermissions } from '@/server/routers/permission';
import type { User } from '@/server/routers/user';

// ─────────────────────────────────────────────────────────────────────────────
// Static config – roles and permission map
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_ROLES = ['admin', 'editor', 'viewer'] as const;

const PERMISSION_SECTIONS = [
  {
    key: 'collections',
    actions: ['create', 'update', 'delete', 'view', 'deAnonimize'],
  },
  { key: 'document', actions: ['update'] },
  { key: 'chat', actions: ['canUse', 'canDevMode'] },
  { key: 'settings', actions: ['llm', 'pipeline'] },
] as const;

type DraftPermissions = Omit<DAVEPermissions, '_id'>;

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

const AdminPage: NextPage = () => {
  const t = useText('admin');
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = useIsAdmin();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const trpcCtx = useContext();

  const [draft, setDraft] = useState<DraftPermissions | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const [activeSection, setActiveSection] = useState<'permissions' | 'users'>(
    'permissions'
  );

  // Users state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm] = Form.useForm();

  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
  const token = (session as any)?.accessToken as string | undefined;

  // Initialise (or re-initialise) the draft whenever the server document changes.
  const permissionsId = permissions?._id;
  useEffect(() => {
    if (permissions) {
      const { _id, ...rest } = permissions;
      setDraft(JSON.parse(JSON.stringify(rest)));
    }
  }, [permissionsId]);

  const updateMutation = useMutation(['permission.update'], {
    onSuccess: () => {
      setSaveState('saved');
      try {
        trpcCtx.invalidateQueries(['permission.getCurrent']);
      } catch (_) {}
      setTimeout(() => setSaveState('idle'), 2500);
    },
    onError: () => {
      message.error(t('permissions.saveError'));
      setSaveState('idle');
    },
  });

  const usersQuery = useQuery(
    ['user.getAllUsers', { token: authDisabled ? undefined : token }],
    {
      enabled: !authDisabled && activeSection === 'users',
      retry: false,
    }
  );

  const createUserMutation = useMutation(['user.createUser'], {
    onSuccess: () => {
      message.success(t('users.createSuccess'));
      setUserModalOpen(false);
      userForm.resetFields();
      usersQuery.refetch();
    },
    onError: () => {
      message.error(t('users.errorCreate'));
    },
  });

  const updateUserMutation = useMutation(['user.updateUser'], {
    onSuccess: () => {
      message.success(t('users.updateSuccess'));
      setUserModalOpen(false);
      setEditingUser(null);
      userForm.resetFields();
      usersQuery.refetch();
    },
    onError: () => {
      message.error(t('users.errorUpdate'));
    },
  });

  const deleteUserMutation = useMutation(['user.deleteUser'], {
    onSuccess: () => {
      message.success(t('users.deleteSuccess'));
      usersQuery.refetch();
    },
    onError: () => {
      message.error(t('users.errorDelete'));
    },
  });

  const handleSave = () => {
    if (!draft) return;
    setSaveState('saving');
    updateMutation.mutate({
      token: authDisabled ? undefined : token,
      permissions: draft,
    });
  };

  const handleUserSubmit = () => {
    userForm.validateFields().then((values) => {
      if (editingUser) {
        const payload: any = {
          id: editingUser.id,
          token: authDisabled ? undefined : token,
        };
        if (values.email) payload.email = values.email;
        if (values.firstName !== undefined)
          payload.firstName = values.firstName;
        if (values.lastName !== undefined) payload.lastName = values.lastName;
        if (values.password) payload.password = values.password;
        if (values.role !== undefined) payload.role = values.role;
        updateUserMutation.mutate(payload);
      } else {
        createUserMutation.mutate({
          email: values.email,
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role || undefined,
          token: authDisabled ? undefined : token,
        });
      }
    });
  };

  const toggleRole = (section: string, action: string, role: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const current: string[] = (prev as any)[section]?.[action] ?? [];
      const next = current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role];
      return {
        ...prev,
        [section]: { ...(prev as any)[section], [action]: next },
      };
    });
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (sessionStatus === 'loading') {
    return (
      <ToolbarLayout>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
          }}
        >
          <Spinner size="lg" />
        </div>
      </ToolbarLayout>
    );
  }

  // ── Not authorized ────────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <ToolbarLayout>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            gap: 16,
            padding: 32,
          }}
        >
          <Lock size={48} color="#cbd5e1" />
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                fontWeight: 600,
                fontSize: 18,
                color: '#1e293b',
                margin: 0,
              }}
            >
              {t('notAuthorized')}
            </p>
            <p style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>
              {t('notAuthorizedDescription')}
            </p>
          </div>
        </div>
      </ToolbarLayout>
    );
  }

  // ── Admin panel ───────────────────────────────────────────────────────────
  return (
    <ToolbarLayout>
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
        {/* ── Left sidebar ──────────────────────────────────────────────── */}
        <aside
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid #e2e8f0',
            background: '#f8fafc',
            padding: '24px 12px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '0 12px 16px',
              marginBottom: 8,
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#94a3b8',
              }}
            >
              {t('title')}
            </span>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => setActiveSection('permissions')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                background:
                  activeSection === 'permissions' ? '#0f172a' : 'transparent',
                color: activeSection === 'permissions' ? '#fff' : '#475569',
                transition: 'background 0.15s',
              }}
            >
              <Shield size={15} />
              {t('nav.permissions')}
            </button>
            <button
              onClick={() => setActiveSection('users')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
                background:
                  activeSection === 'users' ? '#0f172a' : 'transparent',
                color: activeSection === 'users' ? '#fff' : '#475569',
                transition: 'background 0.15s',
              }}
            >
              <Users size={15} />
              {t('nav.users')}
            </button>
          </nav>
        </aside>

        {/* ── Content ───────────────────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            padding: '36px 44px',
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {activeSection === 'permissions' && (
            <>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  margin: '0 0 4px',
                  color: '#0f172a',
                }}
              >
                {t('permissions.title')}
              </h1>
              <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
                {t('permissions.description')}
              </p>

              {isLoadingPermissions || !draft ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    paddingTop: 60,
                  }}
                >
                  <Spinner size="lg" />
                </div>
              ) : (
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
                >
                  {PERMISSION_SECTIONS.map((section) => (
                    <div
                      key={section.key}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Section header */}
                      <div
                        style={{
                          background: '#f1f5f9',
                          padding: '10px 16px',
                          borderBottom: '1px solid #e2e8f0',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#334155',
                          }}
                        >
                          {t(`permissions.sections.${section.key}` as any)}
                        </span>
                      </div>

                      {/* Role columns table */}
                      <table
                        style={{ width: '100%', borderCollapse: 'collapse' }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '8px 16px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                width: 220,
                                borderBottom: '1px solid #f1f5f9',
                              }}
                            >
                              {t('permissions.actionLabel')}
                            </th>
                            {KNOWN_ROLES.map((role) => (
                              <th
                                key={role}
                                style={{
                                  textAlign: 'center',
                                  padding: '8px 16px',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: '#94a3b8',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  borderBottom: '1px solid #f1f5f9',
                                }}
                              >
                                {t(`permissions.roles.${role}` as any)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.actions.map((action, idx) => {
                            const currentRoles: string[] =
                              (draft as any)[section.key]?.[action] ?? [];
                            return (
                              <tr
                                key={action}
                                style={{
                                  background:
                                    idx % 2 === 1 ? '#fafafa' : '#fff',
                                  borderBottom:
                                    idx < section.actions.length - 1
                                      ? '1px solid #f1f5f9'
                                      : 'none',
                                }}
                              >
                                <td
                                  style={{
                                    padding: '11px 16px',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: '#334155',
                                  }}
                                >
                                  {t(`permissions.actions.${action}` as any)}
                                </td>
                                {KNOWN_ROLES.map((role) => (
                                  <td
                                    key={role}
                                    style={{
                                      textAlign: 'center',
                                      padding: '11px 16px',
                                    }}
                                  >
                                    <Checkbox
                                      checked={currentRoles.includes(role)}
                                      onChange={() =>
                                        toggleRole(section.key, action, role)
                                      }
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {/* Save row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      paddingTop: 8,
                    }}
                  >
                    <Button
                      color="primary"
                      onPress={handleSave}
                      isDisabled={saveState === 'saving'}
                    >
                      {saveState === 'saving'
                        ? t('permissions.saving')
                        : saveState === 'saved'
                        ? t('permissions.saved')
                        : t('permissions.save')}
                    </Button>
                    {saveState === 'saved' && (
                      <span style={{ fontSize: 13, color: '#16a34a' }}>
                        ✓ {t('permissions.saved')}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {activeSection === 'users' && (
            <>
              {authDisabled ? (
                <div
                  style={{
                    padding: '60px 0',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 15,
                  }}
                >
                  {t('users.notEnabled')}
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: 24,
                    }}
                  >
                    <div>
                      <h1
                        style={{
                          fontSize: 22,
                          fontWeight: 700,
                          margin: '0 0 4px',
                          color: '#0f172a',
                        }}
                      >
                        {t('users.title')}
                      </h1>
                      <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
                        {t('users.subtitle')}
                      </p>
                    </div>
                    <Button
                      color="primary"
                      onPress={() => {
                        setEditingUser(null);
                        userForm.resetFields();
                        setUserModalOpen(true);
                      }}
                    >
                      {t('users.addUser')}
                    </Button>
                  </div>

                  {usersQuery.isLoading ? (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        paddingTop: 60,
                      }}
                    >
                      <Spinner size="lg" />
                    </div>
                  ) : usersQuery.error ? (
                    <p style={{ color: '#ef4444' }}>{t('users.errorLoad')}</p>
                  ) : (
                    <div
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <table
                        style={{ width: '100%', borderCollapse: 'collapse' }}
                      >
                        <thead>
                          <tr
                            style={{
                              background: '#f1f5f9',
                              borderBottom: '1px solid #e2e8f0',
                            }}
                          >
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 16px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {t('users.table.email')}
                            </th>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 16px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {t('users.table.name')}
                            </th>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 16px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {t('users.table.roles')}
                            </th>
                            <th
                              style={{
                                textAlign: 'right',
                                padding: '10px 16px',
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#94a3b8',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}
                            >
                              {t('users.table.actions')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(usersQuery.data || []).map((user, idx) => (
                            <tr
                              key={user.id}
                              style={{
                                background: idx % 2 === 1 ? '#fafafa' : '#fff',
                                borderBottom:
                                  idx < (usersQuery.data?.length ?? 0) - 1
                                    ? '1px solid #f1f5f9'
                                    : 'none',
                              }}
                            >
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: 13,
                                  color: '#334155',
                                }}
                              >
                                {user.email}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  fontSize: 13,
                                  color: '#334155',
                                }}
                              >
                                {user.name ||
                                  [user.firstName, user.lastName]
                                    .filter(Boolean)
                                    .join(' ') ||
                                  '—'}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {user.roles && user.roles.length > 0 ? (
                                  user.roles.map((role) => (
                                    <Tag
                                      key={role}
                                      color={
                                        role === 'admin'
                                          ? 'red'
                                          : role === 'editor'
                                          ? 'blue'
                                          : 'default'
                                      }
                                      style={{ marginRight: 4 }}
                                    >
                                      {role}
                                    </Tag>
                                  ))
                                ) : (
                                  <span
                                    style={{ color: '#94a3b8', fontSize: 13 }}
                                  >
                                    {t('users.table.noRoles')}
                                  </span>
                                )}
                              </td>
                              <td
                                style={{
                                  padding: '12px 16px',
                                  textAlign: 'right',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    justifyContent: 'flex-end',
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      setEditingUser(user);
                                      userForm.setFieldsValue({
                                        email: user.email,
                                        firstName: user.firstName || '',
                                        lastName: user.lastName || '',
                                        password: '',
                                        role: user.roles?.[0] || '',
                                      });
                                      setUserModalOpen(true);
                                    }}
                                    style={{
                                      padding: '4px 12px',
                                      fontSize: 12,
                                      border: '1px solid #e2e8f0',
                                      borderRadius: 6,
                                      background: '#fff',
                                      cursor: 'pointer',
                                      color: '#334155',
                                    }}
                                  >
                                    {t('users.editUser')}
                                  </button>
                                  <Popconfirm
                                    title={t('users.deleteConfirmTitle')}
                                    description={t(
                                      'users.deleteConfirmDescription'
                                    )}
                                    onConfirm={() =>
                                      deleteUserMutation.mutate({
                                        id: user.id,
                                        token: authDisabled ? undefined : token,
                                      })
                                    }
                                    okText={t('users.deleteConfirmOk')}
                                    cancelText={t('users.deleteConfirmCancel')}
                                    okButtonProps={{ danger: true }}
                                  >
                                    <button
                                      style={{
                                        padding: '4px 12px',
                                        fontSize: 12,
                                        border: '1px solid #fca5a5',
                                        borderRadius: 6,
                                        background: '#fff',
                                        cursor: 'pointer',
                                        color: '#ef4444',
                                      }}
                                    >
                                      {t('users.deleteUser')}
                                    </button>
                                  </Popconfirm>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Create / Edit Modal */}
                  <Modal
                    open={userModalOpen}
                    title={
                      editingUser ? t('users.editUser') : t('users.addUser')
                    }
                    onCancel={() => {
                      setUserModalOpen(false);
                      setEditingUser(null);
                      userForm.resetFields();
                    }}
                    onOk={handleUserSubmit}
                    okText={
                      editingUser
                        ? t('users.confirmPassword')
                        : t('users.addUser')
                    }
                    confirmLoading={
                      createUserMutation.isLoading ||
                      updateUserMutation.isLoading
                    }
                    destroyOnClose
                  >
                    <Form
                      form={userForm}
                      layout="vertical"
                      style={{ marginTop: 16 }}
                    >
                      <Form.Item
                        name="email"
                        label={t('users.form.email')}
                        rules={[{ required: true, type: 'email' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name="firstName"
                        label={t('users.form.firstName')}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name="lastName"
                        label={t('users.form.lastName')}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name="password"
                        label={
                          editingUser
                            ? t('users.form.passwordOptional')
                            : t('users.form.password')
                        }
                        rules={editingUser ? [] : [{ required: true, min: 8 }]}
                      >
                        <Input.Password />
                      </Form.Item>
                      <Form.Item name="role" label={t('users.form.role')}>
                        <AntSelect
                          allowClear
                          placeholder={t('users.form.noRole')}
                        >
                          <AntSelect.Option value="admin">
                            {t('permissions.roles.admin')}
                          </AntSelect.Option>
                          <AntSelect.Option value="editor">
                            {t('permissions.roles.editor')}
                          </AntSelect.Option>
                          <AntSelect.Option value="viewer">
                            {t('permissions.roles.viewer')}
                          </AntSelect.Option>
                        </AntSelect>
                      </Form.Item>
                    </Form>
                  </Modal>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </ToolbarLayout>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Server-side: require authenticated session, load locale
// ─────────────────────────────────────────────────────────────────────────────

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);
    if (!session) {
      return {
        redirect: { destination: '/sign-in', permanent: false },
      };
    }
  }

  const locale = context.req.cookies.locale || process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: { locale: localeObj },
  };
};

export default AdminPage;
