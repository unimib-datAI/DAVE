import React, { useMemo, useState } from 'react';
import { useAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useContext } from '@/utils/trpc';
import {
  annotationSelectedServicesAtom,
  SelectedService,
  AnnotationSelectedServices,
} from '@/atoms/annotationConfig';
import { Card, Button, Input, Spacer } from "@heroui/react";
import { Modal, Popconfirm, message } from 'antd';

type ServiceRecord = {
  _id: string;
  name: string;
  uri: string;
  serviceType: string;
  description?: string;
  disabled?: boolean;
};

const KNOWN_SERVICE_TYPES = [
  'NER',
  'NEL',
  'CLUSTERING',
  'CONSOLIDATION',
  'NORMALIZATION',
  'OTHER',
];

export default function AnnotationConfigurationPage(): JSX.Element {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken as string | undefined;

  const trpcContext = useContext();

  // selected services mapping atom (slot -> selected service or null)
  const [selectedServices, setSelectedServices] = useAtom(
    annotationSelectedServicesAtom
  );

  // Fetch available services from backend (requires JWT)
  const { data: availableServices = [], isLoading: isServicesLoading } =
    useQuery(['document.getServices', { token: token ?? '' }], {
      enabled: status === 'authenticated' && !!token,
    });

  // Mutations
  const createServiceMutation = useMutation(['document.createService']);
  const deleteServiceMutation = useMutation(['document.deleteService']);
  const updateServiceMutation = useMutation(['document.updateService']);

  // Local form state for creating a new service
  const [newName, setNewName] = useState('');
  const [newUri, setNewUri] = useState('');
  const [newType, setNewType] = useState<string>('OTHER');
  const [creating, setCreating] = useState(false);

  // UI helper: group services by serviceType
  const servicesByType = useMemo(() => {
    const groups: Record<string, ServiceRecord[]> = {};
    (availableServices || []).forEach((s: ServiceRecord) => {
      const t = s.serviceType || 'OTHER';
      if (!groups[t]) groups[t] = [];
      groups[t].push(s);
    });
    // ensure known types exist (empty arrays)
    for (const t of KNOWN_SERVICE_TYPES) {
      groups[t] = groups[t] || [];
    }
    return groups;
  }, [availableServices]);

  // Helper to set selected service for a pipeline slot
  const selectServiceForSlot = (slot: string, svc: ServiceRecord | null) => {
    setSelectedServices((prev) => {
      const copy: AnnotationSelectedServices = { ...(prev || {}) };
      if (svc) {
        copy[slot] = {
          id: svc._id,
          name: svc.name,
          uri: svc.uri,
        } as SelectedService;
      } else {
        copy[slot] = null;
      }
      return copy;
    });
  };

  // Create a new service via TRPC and refresh list; if created, optionally select it
  const handleCreateService = async (selectIntoSlot?: string) => {
    if (!token) {
      message.warning('You must be signed in to create a service.');
      return;
    }
    const name = newName.trim();
    const uri = newUri.trim();
    const serviceType = (newType || 'OTHER').trim();
    if (!name || !uri) {
      message.warning('Name and URI are required.');
      return;
    }
    setCreating(true);
    try {
      const inserted = await createServiceMutation.mutateAsync({
        name,
        uri,
        serviceType,
        description: '',
        token,
      });
      await trpcContext.invalidateQueries(['document.getServices']);
      if (selectIntoSlot && inserted) {
        selectServiceForSlot(selectIntoSlot, {
          _id: inserted._id || inserted.id || inserted._id,
          name: inserted.name,
          uri: inserted.uri,
          serviceType: inserted.serviceType || serviceType,
        } as ServiceRecord);
      }
      setNewName('');
      setNewUri('');
      setNewType('OTHER');
      message.success('Service created');
    } catch (err: any) {
      const msg = err?.message || String(err);
      message.error(`Failed to create service: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  // Delete service
  const handleDeleteService = async (serviceId: string) => {
    if (!token) {
      message.warning('You must be signed in to delete a service.');
      return;
    }
    try {
      await deleteServiceMutation.mutateAsync({ id: serviceId, token });
      await trpcContext.invalidateQueries(['document.getServices']);
      // If any slot pointed to this service, clear it
      setSelectedServices((prev) => {
        const copy = { ...(prev || {}) };
        Object.keys(copy).forEach((k) => {
          if (copy[k] && copy[k]!.id === serviceId) {
            copy[k] = null;
          }
        });
        return copy;
      });
      message.success('Service deleted');
    } catch (err: any) {
      message.error(`Failed to delete service: ${err?.message || String(err)}`);
    }
  };

  // Update service (basic inline update for URI or name)
  const handleUpdateService = async (
    serviceId: string,
    patch: Partial<ServiceRecord>
  ) => {
    if (!token) {
      message.warning('You must be signed in to update a service.');
      return;
    }
    try {
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        ...patch,
        token,
      });
      await trpcContext.invalidateQueries(['document.getServices']);
      message.success('Service updated');
    } catch (err: any) {
      message.error(`Failed to update service: ${err?.message || String(err)}`);
    }
  };

  // Pipeline slots to manage (derive from atom keys)
  const pipelineSlots = useMemo(
    () => Object.keys(selectedServices || {}),
    [selectedServices]
  );

  // Helper to find service record by id
  const findServiceById = (id?: string) =>
    (availableServices || []).find(
      (s: ServiceRecord) => s._id === id || (s as any).id === id
    ) || null;

  // Layout: single centered column with stacked cards
  return (
    <div
      style={{
        padding: 24,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 900 }}>
        <header style={{ marginBottom: 16 }}>
          <Text h3>Annotation Configuration</Text>
          <Text small css={{ color: '$accents7' }}>
            Configure persisted services and pick which implementation the
            annotation pipeline should use for each slot.
          </Text>
        </header>

        {/* Add new service */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text b>Add new service</Text>

            {/* CSS grid: 1fr 1fr 160px so Name + URI expand, Type is fixed */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 160px',
                gap: 12,
                alignItems: 'start',
              }}
              className="ac-grid"
            >
              <div>
                <Input
                  clearable
                  fullWidth
                  label="Name"
                  placeholder="e.g. NER-service-1"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div>
                <Input
                  clearable
                  fullWidth
                  label="URI"
                  placeholder="http://localhost:8001/ner"
                  value={newUri}
                  onChange={(e) => setNewUri(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--heroui-colors-border)',
                    background: 'transparent',
                    boxSizing: 'border-box',
                  }}
                >
                  {KNOWN_SERVICE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Button onPress={() => handleCreateService()} disabled={creating}>
                {creating ? 'Creating...' : 'Create service'}
              </Button>
              <Text small css={{ color: '$accents7' }}>
                Services are persisted in the documents microservice. You must
                be signed in.
              </Text>
            </div>
          </div>
        </Card>

        {/* Available services */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <Text b>Available services</Text>
          <Spacer y={0.5} />
          {isServicesLoading ? (
            <Text>Loading services…</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.keys(servicesByType).map((type) => {
                const list = servicesByType[type] || [];
                if (list.length === 0) return null;
                return (
                  <div key={type}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <Text b>{type}</Text>
                      <Text small css={{ color: '$accents7' }}>
                        {list.length} service(s)
                      </Text>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {list.map((svc) => (
                        <div
                          key={svc._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: 12,
                            borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.04)',
                            background: 'var(--heroui-colors-background)',
                          }}
                        >
                          <div style={{ minWidth: 0, marginRight: 12 }}>
                            <Text b css={{ mb: '$2' }}>
                              {svc.name}
                            </Text>
                            <Text
                              small
                              css={{
                                color: '$accents7',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {svc.uri}
                            </Text>
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                              bordered
                              onPress={() => {
                                Modal.confirm({
                                  title: 'Edit URI',
                                  content: (
                                    <div>
                                      <input
                                        id={`edit-uri-${svc._id}`}
                                        defaultValue={svc.uri}
                                        style={{
                                          width: '100%',
                                          padding: 8,
                                          boxSizing: 'border-box',
                                          borderRadius: 4,
                                          border: '1px solid rgba(0,0,0,0.1)',
                                        }}
                                      />
                                    </div>
                                  ),
                                  onOk: async () => {
                                    const el = document.getElementById(
                                      `edit-uri-${svc._id}`
                                    ) as HTMLInputElement | null;
                                    const newUri = el?.value ?? '';
                                    if (newUri && newUri.trim() !== svc.uri) {
                                      await handleUpdateService(svc._id, {
                                        uri: newUri.trim(),
                                      });
                                    }
                                  },
                                });
                              }}
                              size="sm"
                            >
                              Edit
                            </Button>

                            <Popconfirm
                              title="Delete this service?"
                              onConfirm={() => handleDeleteService(svc._id)}
                              okText="Delete"
                              cancelText="Cancel"
                            >
                              <Button color="error" size="sm">
                                Delete
                              </Button>
                            </Popconfirm>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Pipeline slot selection (stacked single column) */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <Text b>Pipeline slot selection</Text>
          <Text small css={{ color: '$accents7', mt: '$2' }}>
            Pick an implementation for each pipeline slot. Selections are stored
            locally.
          </Text>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginTop: 12,
            }}
          >
            {pipelineSlots.map((slot) => {
              const current = selectedServices[slot] as SelectedService | null;
              const currentId = current?.id;
              const options = servicesByType[slot] || [];

              return (
                <div
                  key={slot}
                  style={{
                    borderRadius: 8,
                    padding: 12,
                    background: 'var(--heroui-colors-background)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <Text b>{slot}</Text>
                      <Text
                        small
                        css={{ color: '$accents7', marginLeft: '10px' }}
                      >
                        Select a service implementation
                      </Text>
                    </div>
                    <div>
                      <Button
                        light
                        color="error"
                        auto
                        onPress={() => selectServiceForSlot(slot, null)}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', marginBottom: 6 }}>
                        Choose service (only services of type: {slot})
                      </label>
                      <select
                        value={currentId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) {
                            selectServiceForSlot(slot, null);
                            return;
                          }
                          const svc = findServiceById(id);
                          if (svc) selectServiceForSlot(slot, svc);
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--heroui-colors-border)',
                          background: 'transparent',
                        }}
                      >
                        <option value="">-- not selected --</option>
                        {options.length === 0 ? (
                          <option value="" disabled>
                            -- no services for this slot --
                          </option>
                        ) : (
                          options.map((s) => (
                            <option key={s._id} value={s._id}>
                              {s.name} — {s.uri}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: 6 }}>
                        Selected service preview
                      </label>
                      <div
                        style={{
                          background: '#dedede',
                          padding: 10,
                          borderRadius: 6,
                        }}
                      >
                        <Text small css={{ fontFamily: 'monospace' }}>
                          {current
                            ? `${current.name} — ${current.uri}`
                            : 'No service selected'}
                        </Text>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: 6 }}>
                        Quick add & select
                      </label>
                      <div
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                      >
                        <Button
                          auto
                          onPress={() => {
                            setNewType(
                              slot in KNOWN_SERVICE_TYPES ? slot : 'OTHER'
                            );
                            Modal.confirm({
                              title: `Create a new service and select it for slot ${slot}?`,
                              content: 'Click OK to continue and fill details.',
                              onOk: () => {
                                const input =
                                  document.querySelector<HTMLInputElement>(
                                    'input[placeholder*="NER-service"]'
                                  );
                                input?.focus();
                              },
                            });
                          }}
                          size="sm"
                        >
                          Prefill create form
                        </Button>

                        <Button
                          auto
                          color="success"
                          onPress={() => {
                            Modal.confirm({
                              title: 'Create & select service',
                              content: (
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    flexDirection: 'column',
                                  }}
                                >
                                  <input
                                    id={`quick-name-${slot}`}
                                    placeholder="Service name (e.g. my-ner)"
                                    style={{
                                      width: '100%',
                                      padding: 8,
                                      boxSizing: 'border-box',
                                      borderRadius: 4,
                                      border: '1px solid rgba(0,0,0,0.1)',
                                    }}
                                  />
                                  <input
                                    id={`quick-uri-${slot}`}
                                    placeholder="Service URI (e.g. http://localhost:8001/ner)"
                                    style={{
                                      width: '100%',
                                      padding: 8,
                                      boxSizing: 'border-box',
                                      borderRadius: 4,
                                      border: '1px solid rgba(0,0,0,0.1)',
                                    }}
                                  />
                                </div>
                              ),
                              onOk: async () => {
                                const nameEl = document.getElementById(
                                  `quick-name-${slot}`
                                ) as HTMLInputElement | null;
                                const uriEl = document.getElementById(
                                  `quick-uri-${slot}`
                                ) as HTMLInputElement | null;
                                const name = nameEl?.value ?? '';
                                const uri = uriEl?.value ?? '';
                                if (!name.trim() || !uri.trim()) {
                                  message.warning('Name and URI required');
                                  throw new Error('validation');
                                }
                                setCreating(true);
                                try {
                                  const inserted =
                                    await createServiceMutation.mutateAsync({
                                      name: name.trim(),
                                      uri: uri.trim(),
                                      serviceType: slot,
                                      description: '',
                                      token: token || '',
                                    });
                                  await trpcContext.invalidateQueries([
                                    'document.getServices',
                                  ]);
                                  if (inserted) {
                                    selectServiceForSlot(slot, {
                                      _id: inserted._id || inserted.id,
                                      name: inserted.name,
                                      uri: inserted.uri,
                                      serviceType: inserted.serviceType || slot,
                                    } as ServiceRecord);
                                    message.success(
                                      'Service created & selected'
                                    );
                                  }
                                } catch (err: any) {
                                  if ((err as Error).message !== 'validation') {
                                    message.error(
                                      `Failed to create & select service: ${
                                        err?.message || String(err)
                                      }`
                                    );
                                  }
                                } finally {
                                  setCreating(false);
                                }
                              },
                            });
                          }}
                          size="sm"
                        >
                          Create & select
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card variant="bordered" style={{ padding: 10 }}>
          <Text b>Persisted selected configuration (preview)</Text>
          <Spacer y={0.5} />
          <div
            style={{
              background: '#dedede',
              padding: 12,
              borderRadius: 6,
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(selectedServices, null, 2)}
            </pre>
          </div>
        </Card>
      </div>
    </div>
  );
}
