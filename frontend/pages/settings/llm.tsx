import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import styled from '@emotion/styled';
import { useAtom } from 'jotai';
import {
  persistedLLMSettingsAtom,
  loadLLMSettingsAtom,
  clearLLMSettingsAtom,
  LLMSettings,
} from '@/atoms/llmSettings';
import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Card,
  Text,
  Loading,
  Switch,
  Textarea,
} from '@nextui-org/react';
import { FiSave } from '@react-icons/all-files/fi/FiSave';
import { FiTrash2 } from '@react-icons/all-files/fi/FiTrash2';
import { FiEye } from '@react-icons/all-files/fi/FiEye';
import { FiEyeOff } from '@react-icons/all-files/fi/FiEyeOff';
import { FiAlertCircle } from '@react-icons/all-files/fi/FiAlertCircle';
import { FiCheckCircle } from '@react-icons/all-files/fi/FiCheckCircle';
import { FiXCircle } from '@react-icons/all-files/fi/FiXCircle';
import Link from 'next/link';
import { useText } from '@/components/TranslationProvider';

const Container = styled.div({
  maxWidth: '800px',
  margin: '0 auto',
  padding: '40px 24px',
});

const Header = styled.div({
  marginBottom: '32px',
});

const Title = styled.h1({
  fontSize: '32px',
  fontWeight: 700,
  marginBottom: '8px',
  color: '#000',
});

const Breadcrumb = styled.div({
  fontSize: '14px',
  color: '#666',
  marginBottom: '16px',

  '& a': {
    color: '#0070f3',
    textDecoration: 'none',
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

const Subtitle = styled.p({
  fontSize: '16px',
  color: '#666',
  lineHeight: '1.6',
});

const FormSection = styled.div({
  marginBottom: '32px',
});

const SectionTitle = styled.h2({
  fontSize: '20px',
  fontWeight: 600,
  marginBottom: '16px',
  color: '#000',
});

const FormGroup = styled.div({
  marginBottom: '24px',
});

const Label = styled.label({
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  marginBottom: '8px',
  color: '#374151',
});

const HelpText = styled.p({
  fontSize: '13px',
  color: '#6B7280',
  marginTop: '6px',
  lineHeight: '1.5',
});

const ButtonGroup = styled.div({
  display: 'flex',
  gap: '12px',
  marginTop: '32px',
});

const AlertBox = styled.div({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#FEF3C7',
  border: '1px solid #FCD34D',
  marginBottom: '24px',
  fontSize: '14px',
  color: '#92400E',
  lineHeight: '1.5',
});

const InfoBox = styled.div({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#EFF6FF',
  border: '1px solid #DBEAFE',
  marginBottom: '24px',
  fontSize: '14px',
  color: '#1E40AF',
  lineHeight: '1.5',
});

const PasswordInputWrapper = styled.div({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
});

const TogglePasswordButton = styled.button({
  position: 'absolute',
  right: '12px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#6B7280',
  padding: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  '&:hover': {
    color: '#374151',
  },
});

const SwitchWrapper = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '24px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: '#F9FAFB',
  border: '1px solid #E5E7EB',
});

const TestResultBox = styled.div<{ success: boolean }>(({ success }) => ({
  marginTop: '16px',
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: success ? '#F0FDF4' : '#FEF2F2',
  border: `1px solid ${success ? '#86EFAC' : '#FECACA'}`,
  fontSize: '14px',
  lineHeight: '1.6',
}));

const TestResultHeader = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
  fontWeight: 600,
  fontSize: '15px',
});

const TestResultContent = styled.pre({
  marginTop: '8px',
  padding: '12px',
  borderRadius: '6px',
  backgroundColor: 'rgba(0, 0, 0, 0.05)',
  fontSize: '13px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
});

const LLMSettingsPage = () => {
  const t = useText('settingsLLM');
  const [settings, setSettings] = useAtom(persistedLLMSettingsAtom);
  const [, loadSettings] = useAtom(loadLLMSettingsAtom);
  const [, clearSettings] = useAtom(clearLLMSettingsAtom);

  const [formData, setFormData] = useState<LLMSettings>({
    baseURL: '',
    apiKey: '',
    model: '',
    useCustomSettings: false,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    response?: string;
  } | null>(null);

  useEffect(() => {
    const loadStoredSettings = async () => {
      try {
        const stored = await loadSettings();
        if (stored) {
          setFormData(stored);
        } else {
          setFormData(settings);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredSettings();
  }, []);

  const handleInputChange = (
    field: keyof LLMSettings,
    value: string | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setSettings(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert(t('messages.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (confirm(t('messages.confirmClear'))) {
      setIsSaving(true);
      try {
        await clearSettings();
        setFormData({
          baseURL: '',
          apiKey: '',
          model: '',
          useCustomSettings: false,
        });
        setSaveSuccess(false);
      } catch (error) {
        console.error('Error clearing settings:', error);
        alert(t('messages.clearFailed'));
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleTest = async () => {
    if (!formData.useCustomSettings) {
      alert(t('messages.enableCustom'));
      return;
    }

    if (!formData.baseURL || !formData.model) {
      alert(t('messages.fillRequired'));
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const basePath =
        process.env.NEXT_PUBLIC_BASE_PATH === '/'
          ? ''
          : process.env.NEXT_PUBLIC_BASE_PATH || '';

      const apiMessages = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Please respond briefly.',
        },
        {
          role: 'user',
          content:
            'Hello! Please respond with a brief greeting to confirm you are working.',
        },
      ];

      const response = await fetch(`${basePath}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          model: formData.model,
          max_tokens: 100,
          temperature: 0.7,
          customSettings: formData,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || response.statusText);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
      }

      setTestResult({
        success: true,
        message: t('test.success'),
        response: fullResponse,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: t('messages.testFailed', {
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
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
          <Breadcrumb>
            <Link href="/settings">Settings</Link> / LLM Configuration
          </Breadcrumb>
          <Title>LLM Configuration</Title>
          <Subtitle>
            Configure custom LLM API settings. When enabled, DAVE will use your
            custom configuration instead of the default settings. All sensitive
            data is encrypted before being stored in your browser.
          </Subtitle>
        </Header>

        <InfoBox>
          <div style={{ marginTop: '2px' }}>ℹ️</div>
          <div>
            <strong>Encryption & Security:</strong> Your API key and other
            settings are encrypted using AES-GCM encryption before being stored
            in your browser&apos;s local storage. The encryption uses a
            device-specific key, meaning your settings are tied to this browser
            and device.
          </div>
        </InfoBox>

        <FormSection>
          <SwitchWrapper>
            <Switch
              checked={formData.useCustomSettings}
              onChange={(e) =>
                handleInputChange('useCustomSettings', e.target.checked)
              }
              color="primary"
            />
            <div>
              <Label style={{ marginBottom: '4px' }}>
                Use Custom LLM Settings
              </Label>
              <HelpText style={{ marginTop: 0 }}>
                Enable this to use your custom API configuration. When disabled,
                the system will use default environment settings.
              </HelpText>
            </div>
          </SwitchWrapper>

          {formData.useCustomSettings && (
            <AlertBox>
              <div style={{ marginTop: '2px' }}>⚠️</div>
              <div>
                <strong>Important:</strong> Make sure your API endpoint is
                OpenAI-compatible (supports the same API format). This works
                with OpenAI, Azure OpenAI, local models via
                text-generation-webui, LM Studio, Ollama with openai-compatible
                endpoints, and similar services.
              </div>
            </AlertBox>
          )}

          <FormGroup>
            <Label htmlFor="baseURL">API Base URL</Label>
            <Input
              id="baseURL"
              fullWidth
              placeholder="https://api.openai.com/v1"
              value={formData.baseURL}
              onChange={(e) => handleInputChange('baseURL', e.target.value)}
              disabled={!formData.useCustomSettings}
              contentRight={null}
            />
            <HelpText>
              The base URL for your LLM API endpoint. Examples:
              <br />• OpenAI: <code>https://api.openai.com/v1</code>
              <br />• Local server: <code>http://localhost:8000/v1</code>
              <br />• Azure OpenAI:{' '}
              <code>
                https://your-resource.openai.azure.com/openai/deployments/your-deployment
              </code>
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="apiKey">API Key</Label>
            <PasswordInputWrapper>
              <Input
                id="apiKey"
                fullWidth
                type={showApiKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={formData.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                disabled={!formData.useCustomSettings}
                contentRight={null}
              />
              <TogglePasswordButton
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                disabled={!formData.useCustomSettings}
              >
                {showApiKey ? '👁️' : '👁️‍🗨️'}
              </TogglePasswordButton>
            </PasswordInputWrapper>
            <HelpText>
              Your API key for authentication. This will be encrypted before
              storage. For local models that don&apos;t require authentication,
              you can use any placeholder value.
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="model">Model Name</Label>
            <Input
              id="model"
              fullWidth
              placeholder="gpt-4, phi4-mini, llama-3.1, etc."
              value={formData.model}
              onChange={(e) => handleInputChange('model', e.target.value)}
              disabled={!formData.useCustomSettings}
              contentRight={null}
            />
            <HelpText>
              The model identifier to use. This depends on your API provider:
              <br />• OpenAI: <code>gpt-4</code>, <code>gpt-3.5-turbo</code>
              <br />• Local models: <code>phi4-mini</code>,{' '}
              <code>llama-3.1-8b</code>, etc.
              <br />
              Check your API provider&apos;s documentation for available models.
            </HelpText>
          </FormGroup>

          {formData.useCustomSettings && (
            <FormGroup>
              <Button
                auto
                color="secondary"
                onClick={handleTest}
                disabled={isTesting || !formData.baseURL || !formData.model}
                style={{ width: '100%' }}
              >
                {isTesting ? (
                  <>
                    <Loading size="sm" color="white" /> Testing Connection...
                  </>
                ) : (
                  '🔌 Test Connection'
                )}
              </Button>

              {testResult && (
                <TestResultBox success={testResult.success}>
                  <TestResultHeader>
                    {testResult.success ? (
                      <>
                        <FiCheckCircle size={20} color="#16A34A" />
                        <span style={{ color: '#16A34A' }}>Success</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle size={20} color="#DC2626" />
                        <span style={{ color: '#DC2626' }}>Failed</span>
                      </>
                    )}
                  </TestResultHeader>
                  <div
                    style={{
                      color: testResult.success ? '#166534' : '#991B1B',
                    }}
                  >
                    {testResult.message}
                  </div>
                  {testResult.response && (
                    <div>
                      <strong
                        style={{
                          color: testResult.success ? '#166534' : '#991B1B',
                        }}
                      >
                        Response:
                      </strong>
                      <TestResultContent>
                        {testResult.response}
                      </TestResultContent>
                    </div>
                  )}
                </TestResultBox>
              )}
            </FormGroup>
          )}
        </FormSection>

        <ButtonGroup>
          <Button
            auto
            color="primary"
            onClick={handleSave}
            disabled={isSaving || !formData.useCustomSettings}
          >
            {isSaving ? (
              <Loading size="sm" color="white" />
            ) : (
              '💾 Save Settings'
            )}
          </Button>

          <Button
            auto
            color="error"
            flat
            onClick={handleClear}
            disabled={isSaving}
          >
            🗑️ Clear Settings
          </Button>

          {saveSuccess && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: '#059669',
                fontWeight: 500,
              }}
            >
              ✓ Settings saved successfully!
            </div>
          )}
        </ButtonGroup>

        <InfoBox style={{ marginTop: '32px' }}>
          <div style={{ marginTop: '2px' }}>💡</div>
          <div>
            <strong>Pro Tip:</strong> Use the &quot;Test Connection&quot; button
            above to verify your configuration before saving. This sends a
            simple test message to ensure your API URL, key, and model are all
            working correctly. You can always clear settings to revert to
            defaults if needed.
          </div>
        </InfoBox>
      </Container>
    </ToolbarLayout>
  );
};

export default LLMSettingsPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (process.env.USE_AUTH !== 'false') {
    const session = await getSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/sign-in',
          permanent: false,
        },
      };
    }
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
