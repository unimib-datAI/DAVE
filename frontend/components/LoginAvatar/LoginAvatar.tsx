import { useQuery } from '@/utils/trpc';
import styled from '@emotion/styled';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
} from '@heroui/react';
import { FiSliders } from '@react-icons/all-files/fi/FiSliders';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
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

const StyledLink = styled.a({
  fontWeight: 'bold',
  color: 'inherit',
  textDecoration: 'none',
});

const LoginAvatar = () => {
  const t = useText('infer');
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

  if (status === 'unauthenticated') {
    return (
      <Link href="/login" passHref>
        <LinkButton>Login</LinkButton>
      </Link>
    );
  }

  return (
    <Dropdown placement="bottom-left">
      <DropdownTrigger>
        <Avatar
          size="md"
          name={data?.user?.name?.slice(0, 1).toUpperCase()}
          as="button"
          className="cursor-pointer"
        />
      </DropdownTrigger>
      <DropdownMenu aria-label="User Actions" onAction={handleAction}>
        <DropdownItem key="profile" startContent={<FiSliders />}>
          <Link href="/taxonomy" passHref>
            <StyledLink>Gestisci tassonomia</StyledLink>
          </Link>
        </DropdownItem>
        <DropdownItem key="collections" startContent={<FiFolder />}>
          <Link href="/collections" passHref>
            <StyledLink>Manage Collections</StyledLink>
          </Link>
        </DropdownItem>
        <DropdownItem key="annotation-config" startContent={<FiSliders />}>
          <Link href="/annotation-configuration" passHref>
            <StyledLink>Annotation config</StyledLink>
          </Link>
        </DropdownItem>
        <DropdownItem key="logout" color="danger" showDivider>
          {t('toolbar.logout')}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
};

export default LoginAvatar;
