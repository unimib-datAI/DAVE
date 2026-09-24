import styled from '@emotion/styled';
import Link from 'next/link';
import { PropsWithChildren } from 'react';
import { LoginAvatar } from '../LoginAvatar';
import { CollectionSelector } from '../CollectionSelector';
import { GlobalAnonymizationToggle } from '../GlobalAnonymizationToggle';
import { useRouter } from 'next/router';
import { FiHome } from '@react-icons/all-files/fi/FiHome';
import { Button } from '@heroui/react';
import { useAtom } from 'jotai';
import { activeCollectionAtom } from '@/atoms/collection';
import { FiServer } from '@react-icons/all-files/fi/FiServer';

const Container = styled.div({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  height: '48px',
  display: 'flex',
  flexDirection: 'row',
  background: '#FFF',
  borderBottom: '1px solid #F3F3F5',
  zIndex: 10,
});

const ToolbarContent = styled.div({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '6px 12px',
  flexGrow: 1,
  justifyContent: 'space-between',
  minWidth: 0,
});

const ActionsContainer = styled.div({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
});

const Logo = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '22px',
  fontWeight: 700,
  width: '70px',
  padding: '6px 12px',
  borderRight: '1px solid #F3F3F5',
});

const Toolbar = ({ children }: PropsWithChildren<{}>) => {
  return (
    <Container id="toolbar">
      <Link href="/" passHref>
        <Logo>
          <FiHome />
        </Logo>
      </Link>
      <ToolbarContent>
        <ActionsContainer>
          <CollectionSelector />
          <GoToClustersPageButton />
        </ActionsContainer>

        {children}
        <ActionsContainer>
          <GlobalAnonymizationToggle />
          <LoginAvatar />
        </ActionsContainer>
      </ToolbarContent>
    </Container>
  );
};

const ClustersButton = styled(Button)`
  height: auto;
  min-height: unset;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 150ms ease;

  &:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }
`;

const GoToClustersPageButton = () => {
  const router = useRouter();
  const [activeCollection] = useAtom(activeCollectionAtom);
  return (
    <ClustersButton
      variant="bordered"
      onPress={() =>
        router.push('collections/' + activeCollection?.id + '/clusters')
      }
    >
      <div className="flex flex-row items-center gap-[8px]">
        <FiServer />
        <span>Clusters</span>
      </div>
    </ClustersButton>
  );
};

export default Toolbar;
