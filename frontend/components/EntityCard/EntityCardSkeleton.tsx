import styled from '@emotion/styled';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  width: '300px',
  gap: '10px',
});

const EntityCardSkeleton = () => {
  return (
    <Container>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Skeleton width="100px" height="80px" />
        <Skeleton width="150px" height="20px" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Skeleton width="100%" height="10px" />
        <Skeleton width="80%" height="10px" />
        <Skeleton width="100%" height="10px" count={2} />
      </div>
    </Container>
  );
};

export default EntityCardSkeleton;
