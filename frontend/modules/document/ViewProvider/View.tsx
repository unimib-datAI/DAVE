import styled from '@emotion/styled';
import DocumentViewer from '../DocumentViewer/DocumentViewer';
import { Toolsbar } from '../Toolsbar';

const ViewContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
});

const ScrollableContainer = styled.div({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
});

const DocumentContainer = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  minHeight: '100%',
});

const View = () => {
  return (
    <ViewContainer>
      <Toolsbar />
      <ScrollableContainer>
        <DocumentContainer>
          <DocumentViewer />
        </DocumentContainer>
      </ScrollableContainer>
    </ViewContainer>
  );
};

export default View;
