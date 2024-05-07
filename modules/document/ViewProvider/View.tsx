import { Scroller } from '@/components/Scroller';
import styled from '@emotion/styled';
import DocumentViewer from '../DocumentViewer/DocumentViewer';
import { Toolsbar } from '../Toolsbar';
import { useState } from 'react';

const DocumentContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
});

const View = () => {
  const [page, setPage] = useState(1);
  async function loadNextPage() {
    console.log('loading next page');
    setPage((prevPage) => prevPage + 1);
  }
  async function loadPrevPage() {
    console.log('loading next page');
    setPage((prevPage) => (prevPage > 0 ? prevPage - 1 : 0));
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
