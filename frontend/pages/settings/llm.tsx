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
      <Container>{/* JSX unchanged */}</Container>
    </ToolbarLayout>
  );
};

export default LLMSettingsPage;

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
