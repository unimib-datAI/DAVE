import React, { useMemo, useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useContext } from '@/utils/trpc';
import {
  annotationSelectedServicesAtom,
  SelectedService,
  AnnotationSelectedServices,
} from '@/atoms/annotationConfig';
import { Card, Button, Input, Text, Spacer } from '@nextui-org/react';
import { Modal, Popconfirm, message, Select } from 'antd';

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
  const token = session?.accessToken as string | undefined;

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

  // Fetch user configurations
  const { data: configurations = [], refetch: refetchConfigurations } =
    useQuery(['document.getConfigurations', { token: token ?? '' }], {
      enabled: status === 'authenticated' && !!token,
    });

  // Mutations
  const createServiceMutation = useMutation(['document.createService']);
  const deleteServiceMutation = useMutation(['document.deleteService']);
  const updateServiceMutation = useMutation(['document.updateService']);
  const createConfigurationMutation = useMutation([
    'document.createConfiguration',
  ]);
  const updateConfigurationMutation = useMutation([
    'document.updateConfiguration',
  ]);
  const deleteConfigurationMutation = useMutation([
    'document.deleteConfiguration',
  ]);
  const activateConfigurationMutation = useMutation([
    'document.activateConfiguration',
  ]);

  // Local form state for creating a new service
  const [newName, setNewName] = useState('');
  const [newUri, setNewUri] = useState('');
  const [newType, setNewType] = useState<string>('OTHER');
  const [creating, setCreating] = useState(false);

  // Configuration management state
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [setAsActive, setSetAsActive] = useState(false);

  // Load active configuration on mount
  useEffect(() => {
    const loadActiveConfig = async () => {
      if (!token) return;
      try {
        const activeConfig = await trpcContext.fetchQuery([
          'document.getActiveConfiguration',
          { token },
        ]);
        if (activeConfig) {
          setCurrentConfigId(activeConfig._id);
          setConfigName(activeConfig.name);
          // Load services from configuration
          const services: AnnotationSelectedServices = {};
          if (activeConfig.services) {
            Object.entries(activeConfig.services).forEach(
              ([slot, svc]: [string, any]) => {
                if (svc) {
                  services[slot] = {
                    id: svc.id || '',
                    name: svc.name || '',
                    uri: svc.uri || '',
                    serviceType: svc.serviceType,
                  };
                } else {
                  services[slot] = null;
                }
              }
            );
          }
          setSelectedServices(services);
        }
      } catch (err) {
        console.log('No active configuration found');
      }
    };
    if (status === 'authenticated') {
      loadActiveConfig();
    }
  }, [status, token]);

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

  // Save current configuration
  const handleSaveConfiguration = async () => {
    if (!token) {
      message.warning('You must be signed in to save a configuration.');
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning('Configuration name is required.');
      return;
    }

    try {
      // Convert selectedServices to plain object for storage
      const services: Record<string, any> = {};
      Object.entries(selectedServices || {}).forEach(([slot, svc]) => {
        services[slot] = svc;
      });

      if (currentConfigId) {
        // Update existing configuration
        console.log('sent token', token);
        await updateConfigurationMutation.mutateAsync({
          id: currentConfigId,
          name,
          services,
          token,
        });
        message.success('Configuration updated');
      } else {
        // Create new configuration and set as active
        const created = await createConfigurationMutation.mutateAsync({
          name,
          services,
          isActive: true,
          token,
        });
        setCurrentConfigId(created._id);
        message.success('Configuration saved and activated');
      }
      await refetchConfigurations();
      setShowSaveModal(false);
    } catch (err: any) {
      message.error(
        `Failed to save configuration: ${err?.message || String(err)}`
      );
    }
  };

  // Create new configuration
  const handleCreateNewConfiguration = async () => {
    if (!token) {
      message.warning('You must be signed in to create a configuration.');
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning('Configuration name is required.');
      return;
    }

    try {
      const services: Record<string, any> = {};
      Object.entries(selectedServices || {}).forEach(([slot, svc]) => {
        services[slot] = svc;
      });

      const created = await createConfigurationMutation.mutateAsync({
        name,
        services,
        isActive: setAsActive,
        token,
      });
      setCurrentConfigId(created._id);
      setConfigName(created.name);
      message.success(
        setAsActive
          ? 'Configuration created and activated'
          : 'Configuration created'
      );
      await refetchConfigurations();
      setShowSaveModal(false);
      setSetAsActive(false);
    } catch (err: any) {
      message.error(
        `Failed to create configuration: ${err?.message || String(err)}`
      );
    }
  };

  // Load a configuration
  const handleLoadConfiguration = async (configId: string) => {
    const config = configurations.find((c: any) => c._id === configId);
    if (!config) return;

    setCurrentConfigId(config._id);
    setConfigName(config.name);

    // Load services from configuration
    const services: AnnotationSelectedServices = {};
    if (config.services) {
      Object.entries(config.services).forEach(([slot, svc]: [string, any]) => {
        if (svc) {
          services[slot] = {
            id: svc.id || '',
            name: svc.name || '',
            uri: svc.uri || '',
            serviceType: svc.serviceType,
          };
        } else {
          services[slot] = null;
        }
      });
    }
    setSelectedServices(services);
    message.success(`Loaded configuration: ${config.name}`);
  };

  // Activate a configuration
  const handleActivateConfiguration = async (configId: string) => {
    if (!token) {
      message.warning('You must be signed in.');
      return;
    }
    try {
      await activateConfigurationMutation.mutateAsync({ id: configId, token });
      await refetchConfigurations();
      await handleLoadConfiguration(configId);
      message.success('Configuration activated');
    } catch (err: any) {
      message.error(
        `Failed to activate configuration: ${err?.message || String(err)}`
      );
    }
  };

  // Delete a configuration
  const handleDeleteConfiguration = async (configId: string) => {
    if (!token) {
      message.warning('You must be signed in.');
      return;
    }
    try {
      await deleteConfigurationMutation.mutateAsync({ id: configId, token });
      await refetchConfigurations();
      if (currentConfigId === configId) {
        setCurrentConfigId(null);
        setConfigName('');
      }
      message.success('Configuration deleted');
    } catch (err: any) {
      message.error(
        `Failed to delete configuration: ${err?.message || String(err)}`
      );
    }
  };

  // Reset to new configuration
  const handleNewConfiguration = () => {
    setCurrentConfigId(null);
    setConfigName('');
    setSetAsActive(false);
    setSelectedServices({
      NER: null,
      NEL: null,
      CLUSTERING: null,
      CONSOLIDATION: null,
      NORMALIZATION: null,
    });
    message.info('Started new configuration');
  };

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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text h3>Annotation Configuration</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button auto size="sm" onClick={handleNewConfiguration}>
                New
              </Button>
              <Button
                auto
                size="sm"
                color="primary"
                onClick={() => {
                  // If no current config, prompt for name first
                  if (!currentConfigId && !configName) {
                    setConfigName('');
                  }
                  setShowSaveModal(true);
                }}
              >
                {currentConfigId ? 'Update' : 'Save As...'}
              </Button>
            </div>
          </div>

          {/* Configuration Selector */}
          <div style={{ marginBottom: 16 }}>
            <Text small css={{ color: '$accents7', marginBottom: 8 }}>
              Select Configuration:
            </Text>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Select
                placeholder="Select a configuration"
                style={{ flex: 1, minWidth: 300 }}
                value={currentConfigId || undefined}
                onChange={(value) => handleLoadConfiguration(value)}
                options={configurations.map((config: any) => ({
                  label: config.name + (config.isActive ? ' (Active)' : ''),
                  value: config._id,
                }))}
              />
              {currentConfigId && (
                <>
                  <Button
                    auto
                    size="sm"
                    color="success"
                    disabled={
                      configurations.find((c: any) => c._id === currentConfigId)
                        ?.isActive
                    }
                    onClick={() => handleActivateConfiguration(currentConfigId)}
                  >
                    Set as Active
                  </Button>
                  <Popconfirm
                    title="Delete this configuration?"
                    onConfirm={() => handleDeleteConfiguration(currentConfigId)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button auto size="sm" color="error">
                      Delete
                    </Button>
                  </Popconfirm>
                </>
              )}
            </div>
            {currentConfigId &&
              configurations.find((c: any) => c._id === currentConfigId)
                ?.isActive && (
                <Text
                  small
                  color="success"
                  css={{ marginTop: 8, fontWeight: 'bold' }}
                >
                  ✓ This configuration is active and will be used for annotation
                </Text>
              )}
          </div>

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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewName(e.target.value)
                  }
                />
              </div>

              <div>
                <Input
                  clearable
                  fullWidth
                  label="URI"
                  placeholder="http://localhost:8001/ner"
                  value={newUri}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewUri(e.target.value)
                  }
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
                    border: '1px solid var(--nextui-colors-border)',
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
                            background: 'var(--nextui-colors-background)',
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
                    background: 'var(--nextui-colors-background)',
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
                          border: '1px solid var(--nextui-colors-border)',
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

        {/* Save Configuration Modal */}
        <Modal
          title={
            currentConfigId ? 'Update Configuration' : 'Save New Configuration'
          }
          visible={showSaveModal}
          onOk={
            currentConfigId
              ? handleSaveConfiguration
              : handleCreateNewConfiguration
          }
          onCancel={() => setShowSaveModal(false)}
          okText={currentConfigId ? 'Update' : 'Create'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text>Configuration Name:</Text>
            <Input
              value={configName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setConfigName(e.target.value)
              }
              placeholder="Enter configuration name"
            />
            {currentConfigId && (
              <Text small color="warning">
                This will update the existing configuration &quot;
                {
                  configurations.find((c: any) => c._id === currentConfigId)
                    ?.name
                }
                &quot;.
              </Text>
            )}
            {!currentConfigId && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    id="setAsActive"
                    checked={setAsActive}
                    onChange={(e) => setSetAsActive(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    htmlFor="setAsActive"
                    style={{ cursor: 'pointer', marginBottom: 0 }}
                  >
                    <Text small>Set as active configuration</Text>
                  </label>
                </div>
                <Text small color="primary">
                  A new configuration will be created.
                  {setAsActive
                    ? ' It will be set as active and used for annotation.'
                    : ' You can activate it later from the dropdown.'}
                </Text>
              </>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}
