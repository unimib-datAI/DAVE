import { GetServerSideProps } from 'next';
import { getSession } from 'next-auth/react';
import { ToolbarLayout } from '@/components/ToolbarLayout';
import styled from '@emotion/styled';
import Link from 'next/link';
import { FiCpu } from '@react-icons/all-files/fi/FiCpu';
import { FiSettings } from '@react-icons/all-files/fi/FiSettings';
import { Card, Text } from '@nextui-org/react';

const Container = styled.div({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '40px 24px',
});

const Title = styled.h1({
  fontSize: '32px',
  fontWeight: 700,
  marginBottom: '8px',
  color: '#000',
});

const Subtitle = styled.p({
  fontSize: '16px',
  color: '#666',
  marginBottom: '40px',
});

const SettingsGrid = styled.div({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '24px',
  marginTop: '24px',
});

const SettingCard = styled.a({
  display: 'flex',
  flexDirection: 'column',
  padding: '24px',
  borderRadius: '12px',
  border: '1px solid #E5E7EB',
  backgroundColor: '#FFF',
  transition: 'all 0.2s ease',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',

  '&:hover': {
    borderColor: '#0070f3',
    boxShadow: '0 4px 12px rgba(0, 112, 243, 0.1)',
    transform: 'translateY(-2px)',
  },
});

const IconWrapper = styled.div({
  width: '48px',
  height: '48px',
  borderRadius: '12px',
  backgroundColor: '#F3F4F6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '16px',
  fontSize: '24px',
  color: '#0070f3',
});

const CardTitle = styled.h3({
  fontSize: '18px',
  fontWeight: 600,
  marginBottom: '8px',
  color: '#000',
});

const CardDescription = styled.p({
  fontSize: '14px',
  color: '#666',
  lineHeight: '1.5',
});

const SettingsPage = () => {
  return (
    <ToolbarLayout>
      <Container>
        <Title>Settings</Title>
        <Subtitle>
          Configure your DAVE experience and manage integrations
        </Subtitle>

        <SettingsGrid>
          <Link href="/settings/llm" passHref>
            <SettingCard>
              <IconWrapper>
                <FiCpu />
              </IconWrapper>
              <CardTitle>LLM Configuration</CardTitle>
              <CardDescription>
                Configure custom LLM API endpoints, API keys, and model
                preferences. Use your own OpenAI-compatible API or stick with
                the default configuration.
              </CardDescription>
            </SettingCard>
          </Link>

          {/* Placeholder for future settings */}
          <SettingCard
            style={{
              opacity: 0.6,
              cursor: 'not-allowed',
              pointerEvents: 'none',
            }}
          >
            <IconWrapper>
              <FiSettings />
            </IconWrapper>
            <CardTitle>General Settings</CardTitle>
            <CardDescription>
              Coming soon: Configure general application preferences and display
              options.
            </CardDescription>
          </SettingCard>
        </SettingsGrid>
      </Container>
    </ToolbarLayout>
  );
};

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

  return {
    props: {},
  };
};

export default SettingsPage;
