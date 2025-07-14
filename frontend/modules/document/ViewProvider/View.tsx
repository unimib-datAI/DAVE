import { Scroller } from '@/components/Scroller';
import styled from '@emotion/styled';
import DocumentViewer from '../DocumentViewer/DocumentViewer';
import { Toolsbar } from '../Toolsbar';
import { useState, useCallback, useEffect } from 'react';
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
  const [isLoading, setIsLoading] = useState(false);
  const text = useSelector(selectDocumentText);

  // Calculate total pages for reference
  const totalPages = Math.ceil(text.length / 4000);

  const loadNextPage = useCallback(() => {
    if (isLoading) return;
    
    setIsLoading(true);
    setPage((prevPage) => {
      const { stopPagination } = getStartAndEndIndexForPagination(prevPage, text);
      if (stopPagination || prevPage >= totalPages) {
        setIsLoading(false);
        return prevPage;
      }
      
      const nextPage = prevPage + 1;
      // Reset loading state after a short delay to prevent rapid loading
      setTimeout(() => setIsLoading(false), 300);
      return nextPage;
    });
  }, [isLoading, text, totalPages]);

  const loadPrevPage = useCallback(() => {
    if (isLoading) return;
    
    setIsLoading(true);
    setPage((prevPage) => {
      const newPage = prevPage > 1 ? prevPage - 1 : 1;
      // Reset loading state after a short delay to prevent rapid loading
      setTimeout(() => setIsLoading(false), 300);
      return newPage;
    });
  }, [isLoading]);

  // Reset page to 1 when text changes (new document)
  useEffect(() => {
    setPage(1);
  }, [text, setPage]);

  return (
    <>
      <Toolsbar />
      <Scroller onScrollEnd={loadNextPage} onScrollTop={loadPrevPage} page={page}>
        <DocumentContainer>
          <DocumentViewer page={page} />
        </DocumentContainer>
      </Scroller>
    </>
  );
};

export default View;
