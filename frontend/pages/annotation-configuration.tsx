import React, { useState, useEffect } from 'react';
import { useAtom } from 'jotai';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation } from '@/utils/trpc';
import { useQueryClient } from 'react-query';
import { usePipelinePermissions } from '@/hooks/use-permissions';
import {
  annotationSelectedServicesAtom,
  PipelineStep,
} from '@/atoms/annotationConfig';
import { Card, Button, Input, Spacer } from '@heroui/react';
import Text from '@/components/HtmlText';
import { Modal, Popconfirm, message, Select } from 'antd';
import { GetServerSideProps } from 'next';

type ServiceRecord = {
  _id: string;
  name: string;
  uri: string;
  serviceType: string;
  description?: string;
  disabled?: boolean;
};

export default function AnnotationConfigurationPage(): JSX.Element {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken as string | undefined;

  const queryClient = useQueryClient();

  const { canEdit: canEditPipeline } = usePipelinePermissions();

  // Pipeline steps atom (ordered array)
  const [pipelineSteps, setPipelineSteps] = useAtom(
    annotationSelectedServicesAtom
  );

  // Ensure atom is initialised as an array
  useEffect(() => {
    if (!Array.isArray(pipelineSteps)) {
      setPipelineSteps([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps: PipelineStep[] = Array.isArray(pipelineSteps)
    ? pipelineSteps
    : [];

  // Fetch available services
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

  // ── Service creation form ─────────────────────────────────────────────────
  const [newName, setNewName] = useState('');
  const [newUri, setNewUri] = useState('');
  const [newType, setNewType] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Configuration management ──────────────────────────────────────────────
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(null);
  const [configName, setConfigName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [setAsActive, setSetAsActive] = useState(false);

  // ── Add-step modal state ──────────────────────────────────────────────────
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [addStepMode, setAddStepMode] = useState<'pick' | 'custom'>('pick');
  const [addStepServiceId, setAddStepServiceId] = useState<string | undefined>(
    undefined
  );
  const [addStepCustomName, setAddStepCustomName] = useState('');
  const [addStepCustomUri, setAddStepCustomUri] = useState('');
  const [addStepCustomType, setAddStepCustomType] = useState('');

  // ── Load active configuration on mount ───────────────────────────────────
  useEffect(() => {
    const loadActiveConfig = async () => {
      if (!token) return;
      try {
        const activeConfig = await queryClient.fetchQuery([
          'document.getActiveConfiguration',
          { token },
        ]);
        if (activeConfig) {
          setCurrentConfigId(activeConfig._id);
          setConfigName(activeConfig.name);
          // Prefer steps array; fall back to services Map for legacy configs
          if (
            Array.isArray(activeConfig.steps) &&
            activeConfig.steps.length > 0
          ) {
            setPipelineSteps(activeConfig.steps as PipelineStep[]);
          } else if (activeConfig.services) {
            // Legacy: convert slot-map to steps array
            setPipelineSteps(legacyServicesToSteps(activeConfig.services));
          } else {
            setPipelineSteps([]);
          }
        }
      } catch {
        console.log('No active configuration found');
      }
    };
    if (status === 'authenticated') {
      loadActiveConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const legacyServicesToSteps = (services: any): PipelineStep[] => {
    const LEGACY_SLOTS = [
      'NER',
      'NEL',
      'INDEXER',
      'NILPREDICTION',
      'CLUSTERING',
      'CONSOLIDATION',
    ];
    const result: PipelineStep[] = [];
    for (const slot of LEGACY_SLOTS) {
      const svc =
        services[slot] ||
        (services instanceof Map ? services.get(slot) : undefined);
      if (svc && svc.uri) {
        result.push({
          id: svc.id,
          name: svc.name || slot,
          uri: svc.uri,
          serviceType: svc.serviceType || slot,
        });
      }
    }
    return result;
  };

  const findServiceById = (id?: string): ServiceRecord | undefined =>
    (availableServices as ServiceRecord[]).find(
      (s) => s._id === id || (s as any).id === id
    );

  // ── Service CRUD ──────────────────────────────────────────────────────────

  const handleCreateService = async () => {
    if (!token) {
      message.warning('Sign in required');
      return;
    }
    const name = newName.trim();
    const uri = newUri.trim();
    if (!name || !uri) {
      message.warning('Name and URI are required');
      return;
    }
    setCreating(true);
    try {
      await createServiceMutation.mutateAsync({
        name,
        uri,
        serviceType: newType.trim() || 'OTHER',
        description: '',
        token,
      });
      await queryClient.invalidateQueries(['document.getServices']);
      setNewName('');
      setNewUri('');
      setNewType('');
      message.success('Service created');
    } catch (err: any) {
      message.error(`Failed to create service: ${err?.message || String(err)}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!token) {
      message.warning('Sign in required');
      return;
    }
    try {
      await deleteServiceMutation.mutateAsync({ id: serviceId, token });
      await queryClient.invalidateQueries(['document.getServices']);
      // Remove any pipeline steps that referenced this service
      setPipelineSteps((prev) =>
        (Array.isArray(prev) ? prev : []).filter((s) => s.id !== serviceId)
      );
      message.success('Service deleted');
    } catch (err: any) {
      message.error(`Failed to delete service: ${err?.message || String(err)}`);
    }
  };

  // ── Pipeline step management ──────────────────────────────────────────────

  const handleAddStep = () => {
    setAddStepMode('pick');
    setAddStepServiceId(undefined);
    setAddStepCustomName('');
    setAddStepCustomUri('');
    setAddStepCustomType('');
    setShowAddStepModal(true);
  };

  const confirmAddStep = () => {
    let newStep: PipelineStep | null = null;
    if (addStepMode === 'pick') {
      const svc = findServiceById(addStepServiceId);
      if (!svc) {
        message.warning('Please select a service');
        return;
      }
      newStep = {
        id: svc._id,
        name: svc.name,
        uri: svc.uri,
        serviceType: svc.serviceType,
      };
    } else {
      const uri = addStepCustomUri.trim();
      const name = addStepCustomName.trim();
      if (!uri) {
        message.warning('URI is required');
        return;
      }
      newStep = {
        name: name || uri,
        uri,
        serviceType: addStepCustomType.trim() || undefined,
      };
    }
    setPipelineSteps((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      newStep!,
    ]);
    setShowAddStepModal(false);
  };

  const handleRemoveStep = (index: number) => {
    setPipelineSteps((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      arr.splice(index, 1);
      return arr;
    });
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    setPipelineSteps((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  // ── Configuration CRUD ────────────────────────────────────────────────────

  const handleLoadConfiguration = (configId: string) => {
    const config = (configurations as any[]).find(
      (c: any) => c._id === configId
    );
    if (!config) return;
    setCurrentConfigId(config._id);
    setConfigName(config.name);
    if (Array.isArray(config.steps) && config.steps.length > 0) {
      setPipelineSteps(config.steps as PipelineStep[]);
    } else if (config.services) {
      setPipelineSteps(legacyServicesToSteps(config.services));
    } else {
      setPipelineSteps([]);
    }
    message.success(`Loaded: ${config.name}`);
  };

  const handleSaveConfiguration = async () => {
    if (!token) {
      message.warning('Sign in required');
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning('Configuration name is required');
      return;
    }
    try {
      if (currentConfigId) {
        await updateConfigurationMutation.mutateAsync({
          id: currentConfigId,
          name,
          steps: steps,
          token,
        });
        message.success('Configuration updated');
      } else {
        const created = await createConfigurationMutation.mutateAsync({
          name,
          steps: steps,
          isActive: true,
          token,
        });
        setCurrentConfigId((created as any)._id);
        message.success('Configuration saved');
      }
      await refetchConfigurations();
      setShowSaveModal(false);
    } catch (err: any) {
      message.error(`Failed to save: ${err?.message || String(err)}`);
    }
  };

  const handleCreateNewConfiguration = async () => {
    if (!token) {
      message.warning('Sign in required');
      return;
    }
    const name = configName.trim();
    if (!name) {
      message.warning('Configuration name is required');
      return;
    }
    try {
      const created = await createConfigurationMutation.mutateAsync({
        name,
        steps: steps,
        isActive: setAsActive,
        token,
      });
      setCurrentConfigId((created as any)._id);
      setConfigName((created as any).name);
      message.success('Configuration created');
      await refetchConfigurations();
      setShowSaveModal(false);
      setSetAsActive(false);
    } catch (err: any) {
      message.error(`Failed to create: ${err?.message || String(err)}`);
    }
  };

  const handleActivateConfiguration = async (configId: string) => {
    if (!token) {
      message.warning('Sign in required');
      return;
    }
    try {
      await activateConfigurationMutation.mutateAsync({ id: configId, token });
      await refetchConfigurations();
      handleLoadConfiguration(configId);
      message.success('Configuration activated');
    } catch (err: any) {
      message.error(`Failed to activate: ${err?.message || String(err)}`);
    }
  };

  const handleDeleteConfiguration = async (configId: string) => {
    if (!token) {
      message.warning('Sign in required');
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
      message.error(`Failed to delete: ${err?.message || String(err)}`);
    }
  };

  const handleNewConfiguration = () => {
    setCurrentConfigId(null);
    setConfigName('');
    setSetAsActive(false);
    setPipelineSteps([]);
    message.info('Started new empty configuration');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 900 }}>
        {/* Header */}
        <header style={{ marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text h3>Annotation Pipeline Configuration</Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                auto
                size="sm"
                onClick={handleNewConfiguration}
                isDisabled={!canEditPipeline}
              >
                New
              </Button>
              <Button
                auto
                size="sm"
                color="primary"
                onClick={() => setShowSaveModal(true)}
                isDisabled={!canEditPipeline}
              >
                {currentConfigId ? 'Update' : 'Save as…'}
              </Button>
            </div>
          </div>

          {/* Configuration selector */}
          <div style={{ marginBottom: 12 }}>
            <Text
              small
              css={{ color: '$accents7', display: 'block', marginBottom: 6 }}
            >
              Load saved configuration:
            </Text>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Select
                placeholder="Select a configuration…"
                style={{ flex: 1, minWidth: 280 }}
                value={currentConfigId ?? undefined}
                onChange={(value) => handleLoadConfiguration(value)}
                options={(configurations as any[]).map((c: any) => ({
                  label: c.name + (c.isActive ? ' ✓ active' : ''),
                  value: c._id,
                }))}
              />
              {currentConfigId && (
                <>
                  <Button
                    auto
                    size="sm"
                    color="success"
                    isDisabled={
                      !canEditPipeline ||
                      (configurations as any[]).find(
                        (c: any) => c._id === currentConfigId
                      )?.isActive
                    }
                    onClick={() => handleActivateConfiguration(currentConfigId)}
                  >
                    Set active
                  </Button>
                  <Popconfirm
                    title="Delete this configuration?"
                    onConfirm={() => handleDeleteConfiguration(currentConfigId)}
                    okText="Yes"
                    cancelText="No"
                    disabled={!canEditPipeline}
                  >
                    <Button
                      auto
                      size="sm"
                      color="error"
                      isDisabled={!canEditPipeline}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                </>
              )}
            </div>
            {currentConfigId &&
              (configurations as any[]).find(
                (c: any) => c._id === currentConfigId
              )?.isActive && (
                <Text
                  small
                  color="success"
                  css={{ marginTop: 6, fontWeight: 'bold' }}
                >
                  This configuration is currently active
                </Text>
              )}
          </div>

          <Text small css={{ color: '$accents7' }}>
            Define an ordered list of pipeline steps. Each step receives the
            output of the previous one and the result is saved as an annotated
            document.
          </Text>
        </header>

        {/* ── Available services ──────────────────────────────────────────── */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <Text b>Service Registry</Text>
          <Text
            small
            css={{ color: '$accents7', display: 'block', margin: '4px 0 12px' }}
          >
            Register services here so you can easily pick them when composing
            pipeline steps.
          </Text>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 140px',
              gap: 10,
              alignItems: 'end',
              marginBottom: 10,
            }}
          >
            <Input
              clearable
              fullWidth
              label="Service name"
              placeholder="e.g. SpaCy NER"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              clearable
              fullWidth
              label="URI"
              placeholder="http://spacyner:80/api/spacyner"
              value={newUri}
              onChange={(e) => setNewUri(e.target.value)}
            />
            <Input
              clearable
              fullWidth
              label="Type (optional)"
              placeholder="e.g. NER"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
            />
          </div>
          <Button
            onPress={handleCreateService}
            isDisabled={creating || !canEditPipeline}
            size="sm"
          >
            {creating ? 'Adding…' : 'Add service'}
          </Button>

          <Spacer y={0.5} />

          {isServicesLoading ? (
            <Text small>Loading services…</Text>
          ) : (availableServices as ServiceRecord[]).length === 0 ? (
            <Text small css={{ color: '$accents6' }}>
              No services registered yet.
            </Text>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                marginTop: 8,
              }}
            >
              {(availableServices as ServiceRecord[]).map((svc) => (
                <div
                  key={svc._id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'var(--nextui-colors-accents1)',
                    border: '1px solid var(--nextui-colors-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text b small>
                      {svc.name}
                    </Text>
                    {svc.serviceType && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: '#e0f0ff',
                          color: '#0366d6',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {svc.serviceType}
                      </span>
                    )}
                    <Text
                      small
                      css={{
                        color: '$accents6',
                        display: 'block',
                        fontFamily: 'monospace',
                      }}
                    >
                      {svc.uri}
                    </Text>
                  </div>
                  <Button
                    auto
                    flat
                    size="xs"
                    color="success"
                    isDisabled={!canEditPipeline}
                    onPress={() => {
                      setPipelineSteps((prev) => [
                        ...(Array.isArray(prev) ? prev : []),
                        {
                          id: svc._id,
                          name: svc.name,
                          uri: svc.uri,
                          serviceType: svc.serviceType,
                        },
                      ]);
                      message.success(
                        `Added "${svc.name}" as a new pipeline step`
                      );
                    }}
                  >
                    + Add to pipeline
                  </Button>
                  <Popconfirm
                    title={`Delete service "${svc.name}"?`}
                    onConfirm={() => handleDeleteService(svc._id)}
                    okText="Yes"
                    cancelText="No"
                    disabled={!canEditPipeline}
                  >
                    <Button
                      auto
                      flat
                      size="xs"
                      color="error"
                      isDisabled={!canEditPipeline}
                    >
                      Delete
                    </Button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Pipeline steps ──────────────────────────────────────────────── */}
        <Card variant="bordered" style={{ marginBottom: 15, padding: 15 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <div>
              <Text b>Pipeline Steps</Text>
              <Text small css={{ color: '$accents7', display: 'block' }}>
                Steps are executed in order. The document is passed from one
                step to the next.
              </Text>
            </div>
            <Button
              auto
              size="sm"
              color="primary"
              onPress={handleAddStep}
              isDisabled={!canEditPipeline}
            >
              + Add step
            </Button>
          </div>

          {steps.length === 0 ? (
            <div
              style={{
                padding: '24px 0',
                textAlign: 'center',
                border: '2px dashed var(--nextui-colors-border)',
                borderRadius: 8,
              }}
            >
              <Text css={{ color: '$accents6' }}>
                No steps configured. Add steps from the service registry or
                click "Add step".
              </Text>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--nextui-colors-border)',
                    background: 'var(--nextui-colors-background)',
                  }}
                >
                  {/* Step number badge */}
                  <div
                    style={{
                      minWidth: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#0070f3',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Step info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text b small>
                        {step.name}
                      </Text>
                      {step.serviceType && (
                        <span
                          style={{
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: '#e8f5e9',
                            color: '#388e3c',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {step.serviceType}
                        </span>
                      )}
                    </div>
                    <Text
                      small
                      css={{ color: '$accents6', fontFamily: 'monospace' }}
                    >
                      {step.uri}
                    </Text>
                  </div>

                  {/* Reorder & remove controls */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <Button
                      auto
                      flat
                      size="xs"
                      isDisabled={!canEditPipeline || index === 0}
                      onPress={() => handleMoveStep(index, 'up')}
                      title="Move up"
                    >
                      ↑
                    </Button>
                    <Button
                      auto
                      flat
                      size="xs"
                      isDisabled={
                        !canEditPipeline || index === steps.length - 1
                      }
                      onPress={() => handleMoveStep(index, 'down')}
                      title="Move down"
                    >
                      ↓
                    </Button>
                    <Button
                      auto
                      flat
                      size="xs"
                      color="error"
                      isDisabled={!canEditPipeline}
                      onPress={() => handleRemoveStep(index)}
                      title="Remove step"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── JSON Preview ────────────────────────────────────────────────── */}
        <Card variant="bordered" style={{ padding: 10 }}>
          <Text b>Preview</Text>
          <Spacer y={0.3} />
          <div style={{ background: '#dedede', padding: 12, borderRadius: 6 }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
              {JSON.stringify(steps, null, 2)}
            </pre>
          </div>
        </Card>

        {/* ── Add step modal ──────────────────────────────────────────────── */}
        <Modal
          title="Add pipeline step"
          open={showAddStepModal}
          onOk={confirmAddStep}
          onCancel={() => setShowAddStepModal(false)}
          okText="Add"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                auto
                size="sm"
                color={addStepMode === 'pick' ? 'primary' : 'default'}
                onPress={() => setAddStepMode('pick')}
              >
                Pick from registry
              </Button>
              <Button
                auto
                size="sm"
                color={addStepMode === 'custom' ? 'primary' : 'default'}
                onPress={() => setAddStepMode('custom')}
              >
                Enter URI directly
              </Button>
            </div>

            {addStepMode === 'pick' ? (
              <>
                <Text small css={{ color: '$accents7' }}>
                  Select a registered service to add as a pipeline step:
                </Text>
                <Select
                  placeholder="Select service…"
                  style={{ width: '100%' }}
                  value={addStepServiceId}
                  onChange={(v) => setAddStepServiceId(v)}
                  options={(availableServices as ServiceRecord[]).map((s) => ({
                    label: `${s.name}${
                      s.serviceType ? ` (${s.serviceType})` : ''
                    } — ${s.uri}`,
                    value: s._id,
                  }))}
                />
              </>
            ) : (
              <>
                <Text small css={{ color: '$accents7' }}>
                  Enter the details for a custom step:
                </Text>
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <input
                    placeholder="Step name (e.g. Custom NER)"
                    value={addStepCustomName}
                    onChange={(e) => setAddStepCustomName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(0,0,0,0.15)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    placeholder="URI (e.g. http://myner:8080/annotate)"
                    value={addStepCustomUri}
                    onChange={(e) => setAddStepCustomUri(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(0,0,0,0.15)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    placeholder="Type label (optional, e.g. NER)"
                    value={addStepCustomType}
                    onChange={(e) => setAddStepCustomType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(0,0,0,0.15)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </Modal>

        {/* ── Save configuration modal ────────────────────────────────────── */}
        <Modal
          title={
            currentConfigId ? 'Update configuration' : 'Save configuration'
          }
          open={showSaveModal}
          onOk={
            currentConfigId
              ? handleSaveConfiguration
              : handleCreateNewConfiguration
          }
          onCancel={() => setShowSaveModal(false)}
          okText={currentConfigId ? 'Update' : 'Create'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text>Configuration name</Text>
            <Input
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              placeholder="e.g. Full NER+NEL pipeline"
            />
            {currentConfigId && (
              <Text small color="warning">
                This will update the existing configuration "
                {
                  (configurations as any[]).find(
                    (c: any) => c._id === currentConfigId
                  )?.name
                }
                ".
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
                  {setAsActive
                    ? 'This configuration will be used for all new annotation uploads.'
                    : 'Save without activating – you can activate it later from the selector above.'}
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
  const locale = process.env.LOCALE || 'eng';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
