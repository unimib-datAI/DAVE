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

  // Load settings on mount
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
      console.error('Error clearing settings:', error);
      alert(t('messages.clearFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (
      confirm(
        t('messages.confirmClear')
      )
    ) {
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
        console.error('Error saving settings:', error);
        alert(t('messages.saveFailed'));
      } finally {
        setIsSaving(false);
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

      const testMessage =
        'Hello! Please respond with a brief greeting to confirm you are working.';

      console.log('[LLM Test] Starting test connection...');
      console.log(
        '[LLM Test] NEXT_PUBLIC_BASE_PATH:',
        process.env.NEXT_PUBLIC_BASE_PATH
      );
      console.log('[LLM Test] Computed basePath:', basePath);
      console.log('[LLM Test] Base URL:', formData.baseURL);
      console.log('[LLM Test] Model:', formData.model);

      // Match the exact format used by useChat hook
      const apiMessages = [
        {
          role: 'system',
          content: 'You are a helpful assistant. Please respond briefly.',
        },
        {
          role: 'user',
          content: testMessage,
        },
      ];

      console.log('[LLM Test] Sending messages:', apiMessages);

      const fullApiUrl = `${basePath}/api/generate`;
      console.log('[LLM Test] Full API URL:', fullApiUrl);

      const response = await fetch(fullApiUrl, {
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

      console.log('[LLM Test] Response status:', response.status);
      console.log(
        '[LLM Test] Response headers:',
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[LLM Test] Error response:', errorText);
        throw new Error(
          `API Error ${response.status}: ${errorText || response.statusText}`
        );
      }

      // Read the streaming response - match useChat implementation exactly
      const reader = response.body?.getReader();
      if (!reader) {
        console.error('[LLM Test] No response body available');
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullResponse = '';
      let chunkCount = 0;

      console.log('[LLM Test] Starting to read stream...');

      // Add timeout for stream reading
      const streamTimeout = setTimeout(() => {
        console.warn(
          '[LLM Test] Stream reading timeout - no data received in 30 seconds'
        );
      }, 30000);

      try {
        // Match the exact streaming logic from useChat
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[LLM Test] Stream completed');
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          chunkCount++;
          console.log(
            `[LLM Test] Chunk ${chunkCount} (${value?.length} bytes):`,
            chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '')
          );
          fullResponse += chunk;
        }
      } finally {
        clearTimeout(streamTimeout);
      }

      console.log('[LLM Test] Total chunks received:', chunkCount);
      console.log('[LLM Test] Full response length:', fullResponse.length);
      console.log('[LLM Test] Full response:', fullResponse);

      if (!fullResponse || fullResponse.trim() === '') {
        console.error('[LLM Test] Response is empty after streaming');
        console.error('[LLM Test] This usually means:');
        console.error(
          '[LLM Test] 1. The API is buffering the entire response before sending'
        );
        console.error(
          '[LLM Test] 2. The stream closed before any data was written'
        );
        console.error(
          '[LLM Test] 3. There is a proxy/middleware intercepting the stream'
        );
        throw new Error(
          'Empty response from API - no data received from stream. Check that streaming is properly configured.'
        );
      }

      console.log('[LLM Test] Test successful!');
      setTestResult({
        success: true,
        message: 'Connection successful! The API responded correctly.',
        response: fullResponse,
      });
    } catch (error) {
      console.error('[LLM Test] Test failed:', error);
      setTestResult({
        success: false,
        message: t('messages.testFailed', { error: error instanceof Error ? error.message : 'Unknown error occurred' }),
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <ToolbarLayout>
        <Container>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px',
            }}
          >
            <Loading size="lg" />
          </div>
        </Container>
      </ToolbarLayout>
    );
  }

  return (
    <ToolbarLayout>
      <Container>
        <Header>
          <Breadcrumb>
            <Link href="/settings">{t('breadcrumb')}</Link> / {t('title')}
          </Breadcrumb>
          <Title>{t('title')}</Title>
          <Subtitle>
            {t('subtitle')}
          </Subtitle>
        </Header>

        <InfoBox>
          <div style={{ marginTop: '2px' }}>ℹ️</div>
          <div>
            <strong>{t('infoBox.title')}</strong> {t('infoBox.content')}
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
                {t('switch.label')}
              </Label>
              <HelpText style={{ marginTop: 0 }}>
                {t('switch.help')}
              </HelpText>
            </div>
          </SwitchWrapper>

          {formData.useCustomSettings && (
            <AlertBox>
              <div style={{ marginTop: '2px' }}>⚠️</div>
              <div>
                <strong>{t('alertBox.title')}</strong> {t('alertBox.content')}
              </div>
            </AlertBox>
          )}

          <FormGroup>
            <Label htmlFor="baseURL">{t('form.baseURL.label')}</Label>
            <Input
              id="baseURL"
              fullWidth
              placeholder={t('form.baseURL.placeholder')}
              value={formData.baseURL}
              onChange={(e) => handleInputChange('baseURL', e.target.value)}
              disabled={!formData.useCustomSettings}
              contentRight={null}
            />
            <HelpText>
              {t('form.baseURL.help')}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="apiKey">{t('form.apiKey.label')}</Label>
            <PasswordInputWrapper>
              <Input
                id="apiKey"
                fullWidth
                type={showApiKey ? 'text' : 'password'}
                placeholder={t('form.apiKey.placeholder')}
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
              {t('form.apiKey.help')}
            </HelpText>
          </FormGroup>

          <FormGroup>
            <Label htmlFor="model">{t('form.model.label')}</Label>
            <Input
              id="model"
              fullWidth
              placeholder={t('form.model.placeholder')}
              value={formData.model}
              onChange={(e) => handleInputChange('model', e.target.value)}
              disabled={!formData.useCustomSettings}
              contentRight={null}
            />
            <HelpText>
              {t('form.model.help')}
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
                    <Loading size="sm" color="white" /> {t('test.testing')}
                  </>
                ) : (
                  t('test.button')
                )}
              </Button>

              {testResult && (
                <TestResultBox success={testResult.success}>
                  <TestResultHeader>
                    {testResult.success ? (
                      <>
                        <FiCheckCircle size={20} color="#16A34A" />
                        <span style={{ color: '#16A34A' }}>{t('test.success')}</span>
                      </>
                    ) : (
                      <>
                        <FiXCircle size={20} color="#DC2626" />
                        <span style={{ color: '#DC2626' }}>{t('test.failed')}</span>
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
                        {t('test.response')}
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
              t('buttons.save')
            )}
          </Button>

          <Button
            auto
            color="error"
            flat
            onClick={handleClear}
            disabled={isSaving}
          >
            {t('buttons.clear')}
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
              {t('buttons.success')}
            </div>
          )}
        </ButtonGroup>

        <InfoBox style={{ marginTop: '32px' }}>
          <div style={{ marginTop: '2px' }}>💡</div>
          <div>
            <strong>{t('proTip.title')}</strong> {t('proTip.content')}
          </div>
        </InfoBox>
      </Container>
    </ToolbarLayout>
  );
};

export default LLMSettingsPage;

// Protect this page - require authentication
export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/sign-in',
        permanent: false,
      },
    };
  }

  const locale = process.env.LOCALE || 'ita';
  const localeObj = (await import(`@/translation/${locale}`)).default;

  return {
    props: {
      locale: localeObj,
    },
  };
};
