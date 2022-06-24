import { useQuery } from "@/utils/trpc";
import styled from "@emotion/styled";
import { Popover, Avatar, Button, Dropdown, User, Text } from "@nextui-org/react";
import { FaSignOutAlt } from "@react-icons/all-files/fa/FaSignOutAlt";
import Link from "next/link";
import { useRouter } from "next/router";
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'


const LinkButton = styled.a({
  border: 'none',
  outline: 'none',
  padding: '8px 10px',
  borderRadius: '6px',
  color: 'rgb(75 85 99)',
  transition: 'background 250ms ease-out',

  '&:hover': {
    backgroundColor: 'rgb(0 0 0/0.03)'
  }
})

const LoginAvatar = () => {
  const { data } = useQuery(['auth.user']);
  const { refetch } = useQuery(['auth.logout'], { enabled: false });
  const router = useRouter();

  const handleLogout = () => {
    refetch().then(() => {
      router.push('/login');
    })
  }
  const handleAction = (key: string | number) => {
    if (key === 'logout') {
      handleLogout();
    }
  }

  if (!data) {
    return (
      <Skeleton width={40} height={40} borderRadius="50%" style={{ lineHeight: 'unset' }} />
    )
  }

  if (!data.isLoggedIn) {
    return (
      <Link href="/login" passHref>
        <LinkButton>Login</LinkButton>
      </Link>
    )
  }

  return (
    <Dropdown placement="bottom-left">
      <Dropdown.Trigger>
        <Avatar
          size="md"
          text={data.username.slice(0, 1).toUpperCase()}
          pointer
        />
      </Dropdown.Trigger>
      <Dropdown.Menu aria-label="Static Actions" onAction={handleAction}>
        <Dropdown.Item key="profile">
          <Text b color="inherit">
            Signed in as @{data.username}
          </Text>
        </Dropdown.Item>
        <Dropdown.Item key="logout" color="error" withDivider>
          Log Out
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

export default LoginAvatar;