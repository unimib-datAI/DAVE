import { Scroller } from '@/components/Scroller';
import styled from '@emotion/styled';
import DocumentViewer from '../DocumentViewer/DocumentViewer';
import { Toolsbar } from '../Toolsbar';
import { useState } from 'react';
import { useAtom } from 'jotai';
import { documentPageAtom } from '@/utils/atoms';

const DocumentContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
});

const View = () => {
  const [page, setPage] = useAtom(documentPageAtom)
  async function loadNextPage() {
    setPage((prevPage) => prevPage + 1);
  }
  async function loadPrevPage() {
    setPage((prevPage) => (prevPage > 1 ? prevPage - 1 : 1));
  }
  return (
    <>
      <Toolsbar />
      <Scroller onScrollEnd={loadNextPage} onScrollTop={loadPrevPage}>
        <DocumentContainer>
          <DocumentViewer page={page} />
        </DocumentContainer>
      </Scroller>
    </>
  );
};

export default View;
