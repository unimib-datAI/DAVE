import { useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from '@heroui/react';
import { Spinner } from '@heroui/spinner';
import {
  activeCollectionAtom,
  collectionsAtom,
  Collection,
} from '@/atoms/collection';
import { useSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { FiFolder } from '@react-icons/all-files/fi/FiFolder';
import { FiPlus } from '@react-icons/all-files/fi/FiPlus';
import { useRouter } from 'next/router';
import { useQuery } from '@/utils/trpc';

const Container = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginRight: '10px',
});

const CollectionButton = styled.button({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  borderRadius: '8px',
  border: '1px solid #E5E7EB',
  background: '#FFFFFF',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'all 150ms ease',

  '&:hover': {
    background: '#F9FAFB',
    borderColor: '#D1D5DB',
  },
});

const CollectionSelector = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [activeCollection, setActiveCollection] = useAtom(activeCollectionAtom);
  const [collections, setCollections] = useAtom(collectionsAtom);

  const { data: collectionsData, isLoading } = useQuery(
    [
      'collection.getAll',
      {
        token: session?.accessToken,
      },
    ],
    {
      enabled: status === 'authenticated' && !!session?.accessToken,
      onSuccess: (data) => {
        if (data) {
          setCollections(data);
          // Set first collection as active if none selected
          if (!activeCollection && data.length > 0) {
            setActiveCollection(data[0]);
          }
        }
      },
    }
  );

  const handleCollectionSelect = (key: string | number) => {
    console.log('collection id ', key);
    if (key === 'manage') {
      router.push('/collections');
      return;
    }
    console.log('*** searching for collection', key);
    const selected = collections.find((c) => c.id === key);
    if (selected) {
      console.log('*** found collection', key, selected);
      setActiveCollection(selected);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <Container>
        <Spinner size="sm" />
      </Container>
    );
  }

  if (status === 'unauthenticated' || collections.length === 0) {
    return null;
  }

  return (
    <Container>
      {router.pathname === '/documents/[id]' ? (
        activeCollection?.name
      ) : (
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="flat"
              style={{
                background: '#FFFFFF',
                border: '1px solid #E5E7EB',
                minWidth: '180px',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FiFolder />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {activeCollection?.name || 'Select Collection'}
                </span>
              </div>
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Collection selection"
            selectionMode="single"
            selectedKeys={activeCollection ? [activeCollection.id] : []}
            onAction={handleCollectionSelect}
          >
            {collections.map((collection) => (
              <DropdownItem key={collection.id}>{collection.name}</DropdownItem>
            ))}
            <DropdownItem key="manage" showDivider startContent={<FiPlus />}>
              Manage Collections
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </Container>
  );
};

export default CollectionSelector;
