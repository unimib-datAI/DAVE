import { useEffect } from 'react';
import { useAtom } from 'jotai';
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Spinner,
} from '@heroui/react';
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
  // Explicit check: auth is disabled when NEXT_PUBLIC_USE_AUTH is literally 'false'.
  // This is checked separately from !authEnabled so the component is resilient even
  // when the env-var is missing from the build (authEnabled would be true in that case,
  // but authDisabled would still be false — the Dockerfile/compose fix handles the root cause).
  const authDisabled = process.env.NEXT_PUBLIC_USE_AUTH === 'false';
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
        authDisabled ||
        !authEnabled ||
        (status === 'authenticated' && !!session?.accessToken),
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

  // When auth is disabled, never block rendering with a spinner or hide the selector.
  // The collections will appear as soon as the query resolves in the background.
  if (!authDisabled && (status === 'loading' || isLoading)) {
    return (
      <Container>
        <Spinner size="sm" />
      </Container>
    );
  }

  // Only hide the selector when auth is explicitly enabled AND the user is not authenticated.
  // Never hide it when USE_AUTH=false.
  if (!authDisabled && authEnabled && status === 'unauthenticated') {
    return null;
  }

  return (
    <Container>
      {router.pathname === '/documents/[id]' ? (
        activeCollection?.name
      ) : (
        <Dropdown>
          <DropdownTrigger>
            <CollectionButton id="collectionSelector">
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FiFolder />
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {activeCollection?.name || 'Select Collection'}
                </span>
              </div>
            </CollectionButton>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Collection selection"
            selectionMode="single"
            selectedKeys={
              activeCollection ? new Set([activeCollection.id]) : new Set()
            }
            onAction={(key) => handleCollectionSelect(key as string)}
            // Cap the menu height so a long list of collections doesn't run off
            // screen; the list scrolls instead.
            classNames={{
              base: 'max-h-[min(60vh,360px)] overflow-y-auto',
            }}
          >
            {collections.map((collection) => (
              <DropdownItem
                key={collection.id}
                // classNames={{
                //   base: 'text-gray-900 data-[hover=true]:bg-gray-100',
                // }}
              >
                {collection.name}
              </DropdownItem>
            ))}
            <DropdownItem
              key="manage"
              startContent={<FiPlus />}
              classNames={{
                base: 'text-gray-900 data-[hover=true]:bg-gray-100',
              }}
            >
              Manage Collections
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </Container>
  );
};

export default CollectionSelector;
