import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { Dropdown, Text, Loading } from '@nextui-org/react';
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
import { isAuthEnabled } from '@/utils/auth';

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
  const authEnabled = isAuthEnabled();
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
      enabled:
        !authEnabled || (status === 'authenticated' && !!session?.accessToken),
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
        <Loading size="sm" />
      </Container>
    );
  }

  if (authEnabled && status === 'unauthenticated') {
    return null;
  }

  return (
    <Container>
      {router.pathname === '/documents/[id]' ? (
        activeCollection?.name
      ) : (
        <Dropdown>
          <Dropdown.Button
            flat
            css={{
              background: '$white',
              border: '1px solid $gray300',
              minWidth: '180px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FiFolder />
              <Text size={14} weight="medium">
                {activeCollection?.name || 'Select Collection'}
              </Text>
            </div>
          </Dropdown.Button>
          <Dropdown.Menu
            aria-label="Collection selection"
            selectionMode="single"
            selectedKeys={activeCollection ? [activeCollection.id] : []}
            onAction={handleCollectionSelect}
          >
            {collections.map((collection) => (
              <Dropdown.Item key={collection.id}>
                {collection.name}
              </Dropdown.Item>
            ))}
            <Dropdown.Item key="manage" withDivider icon={<FiPlus />}>
              Manage Collections
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      )}
    </Container>
  );
};

export default CollectionSelector;
