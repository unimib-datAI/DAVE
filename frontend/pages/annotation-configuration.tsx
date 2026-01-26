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
import { useText } from '@/components/TranslationProvider';
import { GetServerSideProps } from 'next';

type ServiceRecord = {
  _id: string;
  name: string;
  uri: string;
  serviceType: string;
  description?: string;
  disabled?: boolean;
};

// Canonical pipeline slots and order used by the backend pipeline.
// The UI must present and save exactly these keys so backend and UI align.
const CANONICAL_SLOTS: string[] = [
  'NER',
  'NEL',
  'INDEXER',
  'NILPREDICTION',
  'CLUSTERING',
  'CONSOLIDATION',
];

// Known service types used in the "Add service" dropdown and grouping
const KNOWN_SERVICE_TYPES = [...CANONICAL_SLOTS, 'OTHER'] as string[];

export default function AnnotationConfigurationPage(): JSX.Element {
  const t = useText('annotationConfig');
  const { data: session, status } = useSession();
  // accessToken is not part of the typed Session interface here, cast to any
  const token = (session as any)?.accessToken as string | undefined;

  const trpcContext = useContext();

  // selected services mapping atom (slot -> selected service or null)
  const [selectedServices, setSelectedServices] = useAtom(
    annotationSelectedServicesAtom
  );

  // Utility: normalize a services object so it contains all canonical slots (preserving existing values)
  const ensureCanonicalServices = (
    src?: AnnotationSelectedServices | null
  ): AnnotationSelectedServices => {
    const out: AnnotationSelectedServices = {};
    const srcObj = src || {};
    for (const slot of CANONICAL_SLOTS) {
      out[slot] = slot in srcObj ? srcObj[slot] ?? null : null;
    }
    // Preserve any additional non-canonical keys as well
    Object.keys(srcObj).forEach((k) => {
      if (!(k in out)) {
        out[k] = srcObj[k];
      }
    });
    return out;
  };

  // Ensure selectedServices always contains canonical slots when the page mounts
  useEffect(() => {
    if (!selectedServices) {
      // initialize atom with canonical empty slots
      const init: AnnotationSelectedServices = {};
      for (const slot of CANONICAL_SLOTS) init[slot] = null;
      setSelectedServices(init);
      return;
    }
    // Fill any missing canonical slots while preserving existing values
    setSelectedServices((prev) => {
      const copy: AnnotationSelectedServices = { ...(prev || {}) };
      let changed = false;
      for (const slot of CANONICAL_SLOTS) {
        if (!(slot in copy)) {
          copy[slot] = null;
          changed = true;
        }
      }
      return changed ? copy : prev || copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Load active configuration on mount and normalize it to canonical slots
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

          // Load services from configuration and normalize to canonical slots
          const services: AnnotationSelectedServices = {};
          // populate canonical slots first so order is guaranteed
          for (const slot of CANONICAL_SLOTS) {
            services[slot] = null;
          }

          if (activeConfig.services) {
            Object.entries(activeConfig.services).forEach(
              ([slot, svc]: [string, any]) => {
                const normalizedSlot = slot.toUpperCase();
                if (CANONICAL_SLOTS.includes(normalizedSlot)) {
                  if (svc) {
                    services[normalizedSlot] = {
                      id: svc.id || '',
                      name: svc.name || '',
                      uri: svc.uri || '',
                      serviceType: svc.serviceType,
                    };
                  } else {
                    services[normalizedSlot] = null;
                  }
                } else {
                  // keep unknown slot as-is to preserve any custom entries
                  services[slot] = svc
                    ? {
                        id: svc.id || '',
                        name: svc.name || '',
                        uri: svc.uri || '',
                        serviceType: svc.serviceType,
                      }
                    : null;
                }
              }
            );
          }
          setSelectedServices(ensureCanonicalServices(services));
        }
      } catch (err) {
        console.log('No active configuration found');
      }
    };
    if (status === 'authenticated') {
      loadActiveConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  // UI helper: group services by serviceType (ensure canonical groups exist)
  const servicesByType = useMemo(() => {
    const groups: Record<string, ServiceRecord[]> = {};
    (availableServices || []).forEach((s: ServiceRecord) => {
      const st = (s.serviceType || 'OTHER').toUpperCase();
      if (!groups[st]) groups[st] = [];
      groups[st].push(s);
    });
    // ensure canonical types exist
    for (const t of [...CANONICAL_SLOTS, 'OTHER']) {
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
      return ensureCanonicalServices(copy);
    });
  };

  // Create a new service via TRPC and refresh list; if created, optionally select it
  const handleCreateService = async (selectIntoSlot?: string) => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    const name = newName.trim();
    const uri = newUri.trim();
    const serviceType = (newType || 'OTHER').trim();
    if (!name || !uri) {
      message.warning(t('messages.nameRequired'));
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
      message.success(t('messages.serviceCreated'));
    } catch (err: any) {
      const msg = err?.message || String(err);
      message.error(t('messages.createFailed', { error: msg }));
    } finally {
      setCreating(false);
    }
  };

  // Delete service
  const handleDeleteService = async (serviceId: string) => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
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
        return ensureCanonicalServices(copy);
      });
      message.success(t('messages.serviceDeleted'));
    } catch (err: any) {
      message.error(
        t('messages.deleteFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Update service (basic inline update for URI or name)
  const handleUpdateService = async (
    serviceId: string,
    patch: Partial<ServiceRecord>
  ) => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    try {
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        ...patch,
        token,
      });
      await trpcContext.invalidateQueries(['document.getServices']);
      message.success(t('messages.serviceUpdated'));
    } catch (err: any) {
      message.error(
        t('messages.updateFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Pipeline slots to render: use canonical ordering so saved configs match backend pipeline
  const pipelineSlots = CANONICAL_SLOTS;

  // Helper to find service record by id
  const findServiceById = (id?: string) =>
    (availableServices || []).find(
      (s: ServiceRecord) => s._id === id || (s as any).id === id
    ) || null;

  // Save current configuration
  const handleSaveConfiguration = async () => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning(t('messages.nameRequired'));
      return;
    }

    try {
      // Convert selectedServices to plain object for storage and ensure canonical keys/order
      const services: Record<string, any> = {};
      for (const slot of CANONICAL_SLOTS) {
        services[slot] = (selectedServices || {})[slot] ?? null;
      }
      // preserve any additional keys the user might have (not strictly necessary)
      Object.keys(selectedServices || {}).forEach((k) => {
        if (!(k in services)) {
          services[k] = selectedServices![k];
        }
      });

      if (currentConfigId) {
        // Update existing configuration
        await updateConfigurationMutation.mutateAsync({
          id: currentConfigId,
          name,
          services,
          token,
        });
        message.success(t('messages.configUpdated'));
      } else {
        // Create new configuration and set as active
        const created = await createConfigurationMutation.mutateAsync({
          name,
          services,
          isActive: true,
          token,
        });
        setCurrentConfigId(created._id);
        message.success(t('messages.configSaved'));
      }
      await refetchConfigurations();
      setShowSaveModal(false);
    } catch (err: any) {
      message.error(
        t('messages.saveFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Create new configuration
  const handleCreateNewConfiguration = async () => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning(t('messages.nameRequired'));
      return;
    }

    try {
      const services: Record<string, any> = {};
      for (const slot of CANONICAL_SLOTS) {
        services[slot] = (selectedServices || {})[slot] ?? null;
      }
      Object.keys(selectedServices || {}).forEach((k) => {
        if (!(k in services)) services[k] = selectedServices![k];
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
          ? t('messages.configCreated') +
              ' and ' +
              t('messages.configActivated').toLowerCase()
          : t('messages.configCreated')
      );
      await refetchConfigurations();
      setShowSaveModal(false);
      setSetAsActive(false);
    } catch (err: any) {
      message.error(
        t('messages.saveFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Load a configuration
  const handleLoadConfiguration = async (configId: string) => {
    const config = configurations.find((c: any) => c._id === configId);
    if (!config) return;

    setCurrentConfigId(config._id);
    setConfigName(config.name);

    // Load services from configuration and normalize to canonical slots
    const services: AnnotationSelectedServices = {};
    for (const slot of CANONICAL_SLOTS) {
      services[slot] = null;
    }

    if (config.services) {
      Object.entries(config.services).forEach(([slot, svc]: [string, any]) => {
        const normalizedSlot = slot.toUpperCase();
        if (CANONICAL_SLOTS.includes(normalizedSlot)) {
          if (svc) {
            services[normalizedSlot] = {
              id: svc.id || '',
              name: svc.name || '',
              uri: svc.uri || '',
              serviceType: svc.serviceType,
            };
          } else {
            services[normalizedSlot] = null;
          }
        } else {
          // preserve unknown keys
          services[slot] = svc
            ? {
                id: svc.id || '',
                name: svc.name || '',
                uri: svc.uri || '',
                serviceType: svc.serviceType,
              }
            : null;
        }
      });
    }

    setSelectedServices(ensureCanonicalServices(services));
    message.success(t('messages.configLoaded', { name: config.name }));
  };

  // Activate a configuration
  const handleActivateConfiguration = async (configId: string) => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    try {
      await activateConfigurationMutation.mutateAsync({ id: configId, token });
      await refetchConfigurations();
      await handleLoadConfiguration(configId);
      message.success(t('messages.configActivated'));
    } catch (err: any) {
      message.error(
        t('messages.activateFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Delete a configuration
  const handleDeleteConfiguration = async (configId: string) => {
    if (!token) {
      message.warning(t('messages.signInRequired'));
      return;
    }
    try {
      await deleteConfigurationMutation.mutateAsync({ id: configId, token });
      await refetchConfigurations();
      if (currentConfigId === configId) {
        setCurrentConfigId(null);
        setConfigName('');
      }
      message.success(t('messages.configDeleted'));
    } catch (err: any) {
      message.error(
        t('messages.deleteFailed', { error: err?.message || String(err) })
      );
    }
  };

  // Reset to new configuration (initialize canonical slots)
  const handleNewConfiguration = () => {
    setCurrentConfigId(null);
    setConfigName('');
    setSetAsActive(false);
    const init: AnnotationSelectedServices = {};
    for (const slot of CANONICAL_SLOTS) init[slot] = null;
    setSelectedServices(init);
    message.info(t('messages.newConfigStarted'));
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
            <Text h3>{t('header')}</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button auto size="sm" onClick={handleNewConfiguration}>
                {t('buttons.new')}
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
                {currentConfigId ? t('buttons.update') : t('buttons.saveAs')}
              </Button>
            </div>
          </div>

          {/* Configuration Selector */}
          <div style={{ marginBottom: 16 }}>
            <Text small css={{ color: '$accents7', marginBottom: 8 }}>
              {t('configSelector.label')}
            </Text>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Select
                placeholder={t('configSelector.placeholder')}
                style={{ flex: 1, minWidth: 300 }}
                value={currentConfigId || undefined}
                onChange={(value) => handleLoadConfiguration(value)}
                options={configurations.map((config: any) => ({
                  label:
                    config.name +
                    (config.isActive ? t('configSelector.activeSuffix') : ''),
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
                    {t('configSelector.setActive')}
                  </Button>
                  <Popconfirm
                    title="Delete this configuration?"
                    onConfirm={() => handleDeleteConfiguration(currentConfigId)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button auto size="sm" color="error">
                      {t('configSelector.delete')}
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
                  {t('configSelector.activeNote')}
                </Text>
              )}
          </div>

          <Text small css={{ color: '$accents7' }}>
            {t('description')}
          </Text>
        </header>

        {/* Add new service */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text b>{t('addService.title')}</Text>

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
                  label={t('addService.nameLabel')}
                  placeholder={t('addService.namePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div>
                <Input
                  clearable
                  fullWidth
                  label={t('addService.uriLabel')}
                  placeholder={t('addService.uriPlaceholder')}
                  value={newUri}
                  onChange={(e) => setNewUri(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  {t('addService.typeLabel')}
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
                  {KNOWN_SERVICE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Button onPress={() => handleCreateService()} disabled={creating}>
                {creating
                  ? t('addService.creating')
                  : t('addService.createButton')}
              </Button>
              <Text small css={{ color: '$accents7' }}>
                {t('addService.note')}
              </Text>
            </div>
          </div>
        </Card>

        {/* Available services */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <Text b>{t('availableServices.title')}</Text>
          <Spacer y={0.5} />
          {isServicesLoading ? (
            <Text>{t('availableServices.loading')}</Text>
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
                        {t('availableServices.count', { n: list.length })}
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
                              {t('availableServices.edit')}
                            </Button>

                            <Popconfirm
                              title="Delete this service?"
                              onConfirm={() => handleDeleteService(svc._id)}
                              okText="Delete"
                              cancelText="Cancel"
                            >
                              <Button color="error" size="sm">
                                {t('availableServices.delete')}
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
          <Text b>{t('pipeline.title')}</Text>
          <Text small css={{ color: '$accents7', mt: '$2' }}>
            {t('pipeline.description')}
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
              const current = (selectedServices || {})[
                slot
              ] as SelectedService | null;
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
                      <Text b>{t('pipeline.slotLabel', { slot })}</Text>
                      <Text
                        small
                        css={{ color: '$accents7', marginLeft: '10px' }}
                      >
                        {t('pipeline.selectImpl')}
                      </Text>
                      <Text small css={{ color: '$accents7' }}>
                        {slot === 'NER'
                          ? 'Named Entity Recognition - identifies entities like persons, organizations, locations.'
                          : slot === 'NEL'
                          ? 'Named Entity Linking - links entities to knowledge base entries.'
                          : slot === 'INDEXER'
                          ? 'Searches for candidate entities in the knowledge base.'
                          : slot === 'NILPREDICTION'
                          ? 'Predicts if entities are NIL (not in knowledge base).'
                          : slot === 'CLUSTERING'
                          ? 'Groups similar entities into clusters.'
                          : 'Consolidates and finalizes annotation results.'}
                      </Text>
                    </div>
                    <div>
                      <Button
                        light
                        color="error"
                        auto
                        onPress={() => selectServiceForSlot(slot, null)}
                      >
                        {t('pipeline.clear')}
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
                        {t('pipeline.chooseService', { slot })}
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
                        <option value="">{t('pipeline.notSelected')}</option>
                        {options.length === 0 ? (
                          <option value="" disabled>
                            {t('pipeline.noServices')}
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
                        {t('pipeline.previewLabel')}
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
                            : t('pipeline.noService')}
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
                            setNewType(slot as string);
                            Modal.confirm({
                              title: t('pipeline.prefillModalTitle', { slot }),
                              content: t('pipeline.prefillModalContent'),
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
                          {t('pipeline.prefillButton')}
                        </Button>

                        <Button
                          auto
                          color="success"
                          onPress={() => {
                            Modal.confirm({
                              title: t('pipeline.createSelectModalTitle'),
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
                                    placeholder={t('pipeline.namePlaceholder')}
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
                                    placeholder={t('pipeline.uriPlaceholder')}
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
                                  message.warning(
                                    t('pipeline.validationWarning')
                                  );
                                  throw new Error('validation');
                                }
                                setCreating(true);
                                try {
                                  const inserted =
                                    await createServiceMutation.mutateAsync({
                                      name: name.trim(),
                                      uri: uri.trim(),
                                      serviceType: slot as string,
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
                                      t('pipeline.successMessage')
                                    );
                                  }
                                } catch (err: any) {
                                  if ((err as Error).message !== 'validation') {
                                    message.error(
                                      t('messages.createFailed', {
                                        error: err?.message || String(err),
                                      })
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
                          {t('pipeline.createSelectButton')}
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
          <Text b>{t('preview.title')}</Text>
          <Spacer y={0.5} />
          <div
            style={{
              background: '#dedede',
              padding: 12,
              borderRadius: 6,
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(
                ensureCanonicalServices(selectedServices),
                null,
                2
              )}
            </pre>
          </div>
        </Card>

        {/* Save Configuration Modal */}
        <Modal
          title={
            currentConfigId
              ? t('saveModal.updateTitle')
              : t('saveModal.saveTitle')
          }
          visible={showSaveModal}
          onOk={
            currentConfigId
              ? handleSaveConfiguration
              : handleCreateNewConfiguration
          }
          onCancel={() => setShowSaveModal(false)}
          okText={currentConfigId ? t('buttons.update') : 'Create'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text>{t('saveModal.nameLabel')}</Text>
            <Input
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              placeholder={t('saveModal.namePlaceholder')}
            />
            {currentConfigId && (
              <Text small color="warning">
                {t('saveModal.updateNote', {
                  name: configurations.find(
                    (c: any) => c._id === currentConfigId
                  )?.name,
                })}
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
                    <Text small>{t('saveModal.setActiveLabel')}</Text>
                  </label>
                </div>
                <Text small color="primary">
                  {setAsActive
                    ? t('saveModal.createNoteActive')
                    : t('saveModal.createNoteInactive')}
                </Text>
              </>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
