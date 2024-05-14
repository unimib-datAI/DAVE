import { Scroller } from '@/components/Scroller';
import styled from '@emotion/styled';
import DocumentViewer from '../DocumentViewer/DocumentViewer';
import { Toolsbar } from '../Toolsbar';
import { useState } from 'react';
import { useAtom } from 'jotai';
import { documentPageAtom } from '@/utils/atoms';
import { selectDocumentText, useSelector } from '../DocumentProvider/selectors';
import { getStartAndEndIndexForPagination } from '@/utils/shared';

const DocumentContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
});

const View = () => {
  const [page, setPage] = useAtom(documentPageAtom);
  const text = useSelector(selectDocumentText);
  function loadNextPage() {
    setPage((prevPage) => {
      const { startIndex, endIndex, stopPagination } =
        getStartAndEndIndexForPagination(prevPage, text);
      if (stopPagination) return prevPage;
      else return prevPage + 1;
    });
  }
  function loadPrevPage() {
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
