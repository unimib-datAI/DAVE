import { useEffect, useState } from 'react';
import { useQuery, useMutation, useContext } from '@/utils/trpc';
import { useSession } from 'next-auth/react';
import styled from '@emotion/styled';
import { Modal, Button, Input, Table, Loading } from "@heroui/react";
import { FiPlus } from '@react-icons/all-files/fi/FiPlus';

const Container = styled.div({
  padding: '2rem',
  maxWidth: '1200px',
  margin: '0 auto',
});

const Header = styled.div({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '2rem',
});

const Title = styled.h1({
  fontSize: '2rem',
  fontWeight: 'bold',
  margin: 0,
});

const ModalContent = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1rem 0',
});

const ErrorText = styled(Text)({
  color: '#f31260',
  fontSize: '0.875rem',
});

const SuccessText = styled(Text)({
  color: '#17c964',
  fontSize: '0.875rem',
});

// Placeholder data for development
const PLACEHOLDER_USERS = [
  {
    id: '1',
    email: 'admin@example.com',
    name: 'Admin User',
    createdAt: '2024-01-15T10:30:00Z',
  },
  {
    id: '2',
    email: 'john.doe@example.com',
    name: 'John Doe',
    createdAt: '2024-01-20T14:22:00Z',
  },
  {
    id: '3',
    email: 'jane.smith@example.com',
    name: 'Jane Smith',
    createdAt: '2024-02-01T09:15:00Z',
  },
  {
    id: '4',
    email: 'bob.wilson@example.com',
    name: 'Bob Wilson',
    createdAt: '2024-02-10T16:45:00Z',
  },
];

const AdminPage = () => {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const trpcContext = useContext();

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use placeholder data for now
  const { data: users, isLoading } = useQuery(
    ['user.getAllUsers', { token: session?.accessToken }],
    {
      staleTime: Infinity,
      enabled: !!session?.accessToken && mounted,
    }
  );

  useEffect(() => {
    if (users) {
      console.log('found users', users);
    }
  }, [users]);

  const createUserMutation = useMutation(['user.createUser'], {
    onSuccess: () => {
      setSuccess('User created successfully!');
      setError('');
      // Reset form
      setEmail('');
      setPassword('');
      // Refetch users
      trpcContext.invalidateQueries(['user.getAllUsers']);
      // Close modal after 2 seconds
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess('');
      }, 2000);
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create user');
      setSuccess('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    createUserMutation.mutate({
      email,
      password,
      token: session?.accessToken,
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEmail('');
    setPassword('');
    setError('');
    setSuccess('');
  };

  // Use placeholder data
  const displayUsers = users || PLACEHOLDER_USERS;

  const columns = [
    { name: 'ID', uid: 'id' },
    { name: 'Email', uid: 'email' },
    { name: 'Created At', uid: 'createdAt' },
  ];

  const renderCell = (user: any, columnKey: string) => {
    switch (columnKey) {
      case 'id':
        return <Text>{user.id}</Text>;
      case 'email':
        return <Text>{user.email}</Text>;
      case 'createdAt':
        // Only render dates on client side to avoid hydration mismatch
        if (!mounted) return <Text>-</Text>;
        return (
          <Text>
            {user.createdAt
              ? new Date(user.createdAt).toLocaleDateString()
              : '-'}
          </Text>
        );
      default:
        return <Text>-</Text>;
    }
  };

  // Show loading until mounted to avoid hydration issues
  if (!mounted) {
    return (
      <Container>
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}
        >
          <Loading size="lg" />
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>User Management</Title>
        <Button
          auto
          icon={<FiPlus />}
          onPress={() => setIsModalOpen(true)}
          color="primary"
        >
          Add User
        </Button>
      </Header>

      {isLoading ? (
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}
        >
          <Loading size="lg" />
        </div>
      ) : (
        <Table
          aria-label="Users table"
          css={{
            height: 'auto',
            minWidth: '100%',
          }}
        >
          <Table.Header columns={columns}>
            {(column) => (
              <Table.Column key={column.uid}>{column.name}</Table.Column>
            )}
          </Table.Header>
          <Table.Body items={displayUsers}>
            {(item) => (
              <Table.Row key={item.id}>
                {(columnKey) => (
                  <Table.Cell>
                    {renderCell(item, columnKey as string)}
                  </Table.Cell>
                )}
              </Table.Row>
            )}
          </Table.Body>
        </Table>
      )}

      <Modal
        closeButton
        aria-labelledby="add-user-modal"
        open={isModalOpen}
        onClose={handleCloseModal}
      >
        <Modal.Header>
          <Text id="add-user-modal" size={18} b>
            Add New User
          </Text>
        </Modal.Header>
        <Modal.Body>
          <ModalContent>
            <Input
              clearable
              bordered
              fullWidth
              color="primary"
              size="lg"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              label="Email"
              required
            />
            <Input
              clearable
              bordered
              fullWidth
              color="primary"
              size="lg"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label="Password"
              required
            />
            {error && <ErrorText>{error}</ErrorText>}
            {success && <SuccessText>{success}</SuccessText>}
          </ModalContent>
        </Modal.Body>
        <Modal.Footer>
          <Button auto flat color="error" onPress={handleCloseModal}>
            Cancel
          </Button>
          <Button
            auto
            onPress={handleSubmit}
            disabled={createUserMutation.isLoading}
          >
            {createUserMutation.isLoading ? 'Creating...' : 'Create User'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default AdminPage;
