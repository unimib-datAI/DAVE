import { useQuery } from '@/utils/trpc';
import styled from '@emotion/styled';
import {
  Popover,
  Avatar,
  Button,
  Dropdown,
  User,
  Text,
} from '@nextui-org/react';
import { FiSliders } from '@react-icons/all-files/fi/FiSliders';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiSettings } from '@react-icons/all-files/fi/FiSettings';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useText } from '../TranslationProvider';

const LinkButton = styled.a({
  border: 'none',
  outline: 'none',
  padding: '8px 10px',
  borderRadius: '6px',
  color: 'rgb(75 85 99)',
  transition: 'background 250ms ease-out',

  '&:hover': {
    backgroundColor: 'rgb(0 0 0/0.03)',
  },
});

const LoginAvatar = () => {
  const t = useText('common');
  const { data, status } = useSession();

  const handleAction = (key: string | number) => {
    if (key === 'logout') {
      signOut({
        callbackUrl: '/login',
      });
    }
  };

  if (status === 'loading') {
    return (
      <Skeleton
        width={40}
        height={40}
        borderRadius="50%"
        style={{ lineHeight: 'unset' }}
      />
    );
  }

  if (
    status === 'unauthenticated' &&
    process.env.NEXT_PUBLIC_USE_AUTH !== 'false'
  ) {
    return (
      <Link href="/login" passHref>
        <LinkButton>{t('toolbar.login')}</LinkButton>
      </Link>
    );
  }

  // When USE_AUTH=false or authenticated, show avatar
  const displayName = data?.user?.name || 'Anonymous';
  const avatarText = displayName.slice(0, 1).toUpperCase();

  return (
    <Dropdown placement="bottom-left">
      <Dropdown.Trigger>
        <Avatar size="md" text={avatarText} pointer />
      </Dropdown.Trigger>
      <Dropdown.Menu
        aria-label="Static Actions"
        onAction={handleAction}
        style={{ minWidth: 500 }}
      >
        {/*<Dropdown.Item key="profile" icon={<FiSliders />}>
          <Link href="/taxonomy" passHref>
            <Text as="a" b color="inherit">
              {t('toolbar.manageTaxonomy')}
            </Text>
          </Link>
        </Dropdown.Item>*/}
        <Dropdown.Item key="collections" icon={<FiFolder />}>
          <Link href="/collections" passHref>
            <Text as="a" b color="inherit">
              {t('toolbar.manageCollections')}
            </Text>
          </Link>
        </Dropdown.Item>
        {/* Annotation configuration menu entry removed from avatar.
            Access annotation configuration from Settings -> Annotation Configuration
            at /settings/annotation-configuration */}
        <Dropdown.Item key="settings" icon={<FiSettings />}>
          <Link href="/settings" passHref>
            <Text as="a" b color="inherit" style={{ paddingTop: 10 }}>
              {t('toolbar.settings')}
            </Text>
          </Link>
        </Dropdown.Item>
        {process.env.NEXT_PUBLIC_USE_AUTH !== 'false' && (
          <Dropdown.Item key="logout" color="error" withDivider>
            {t('toolbar.logout')}
          </Dropdown.Item>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};

export default LoginAvatar;
