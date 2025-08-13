import type { GetServerSideProps, NextPage } from 'next';
import { Button, ToolbarLayout } from '@/components';
import styled from '@emotion/styled';
import { useInfiniteQuery, useQuery } from '@/utils/trpc';
import { NextPageWithLayout } from '../_app';
import { ReactElement, useCallback, useEffect } from 'react';
import { Card } from '@nextui-org/react';
import ActionBar from '@/modules/documents/ActionBar';
import DocumentCard from '@/modules/documents/DocumentCard';
import DocumentsList from '@/modules/documents/DocumentsList';
import ToolbarContent from '@/modules/documents/ToolbarContent';
import { useInView } from 'react-intersection-observer';
import withLocale from '@/components/TranslationProvider/withLocale';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
`;

const LoadMoreContainer = styled.div({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const PageTitle = styled.h1`
  font-size: 32px;
  font-weight: 500;
  margin-bottom: 48px;
`;

/**
 * Homepage component
 */
import { useRouter } from 'next/router';

const Documents: NextPageWithLayout = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/search?text=');
  }, [router]);
  return null;
};

Documents.getLayout = function getLayout(page: ReactElement) {
  return (
    <ToolbarLayout toolbarContent={<ToolbarContent />}>{page}</ToolbarLayout>
  );
};

export const getStaticProps = withLocale(() => {
  return {
    props: {},
  };
});

export default Documents;
