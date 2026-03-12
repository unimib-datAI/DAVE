import { ChildNodeWithColor } from '@/components/Tree';
import { EntityAnnotation } from '@/server/routers/document';
import { useQuery } from '@/utils/trpc';
import styled from '@emotion/styled';
import { useMemo } from 'react';
import { Button } from '../Button';
import { Tag } from '../Tag';
import EntityCardSkeleton from './EntityCardSkeleton';

export type EntityCardProps = {
  annotation: EntityAnnotation;
  getTaxonomyNode: (key: string) => ChildNodeWithColor;
};

const Container = styled.div({
  display: 'flex',
  flexDirection: 'column',
  padding: '12px',
  width: '300px',
  gap: '5px',
});

const ContainerImgTitle = styled.div({
  display: 'flex',
  flexDirection: 'column',
  gap: '5px',
  width: '70%',
});

const EntityCard = ({ annotation, getTaxonomyNode }: EntityCardProps) => {
  const { top_candidate } = annotation.features.linking;

  const { data, isFetching } = useQuery(
    [
      'annotation.getAnnotationDetails',
      { id: top_candidate.id, indexer: top_candidate.indexer },
    ],
    { staleTime: Infinity, enabled: !!top_candidate }
  );

  const node = useMemo(() => getTaxonomyNode(annotation.type), [annotation]);

  if (isFetching) {
    return <EntityCardSkeleton />;
  }

  return (
    <Container>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}
      >
        <ContainerImgTitle>
          {data?.thumbnail && (
            <img
              style={{
                border: '1px solid #EAECED',
                margin: '0',
                width: 100,
                height: 80,
                objectFit: 'cover',
              }}
              src={data?.thumbnail.source}
              alt=""
            />
          )}
          <h5
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              margin: 0,
            }}
          >
            {data?.title}
          </h5>
        </ContainerImgTitle>
        <Button
          as="a"
          href={top_candidate.url}
          target="_blank"
          variant="bordered"
          style={{
            margin: '0 auto',
            color: '#000',
            borderColor: '#000',
            maxHeight: '30px',
          }}
          size="sm"
        >
          Details
        </Button>
      </div>
      <Tag node={node} style={{ alignSelf: 'flex-start' }} />
      <span style={{ fontSize: '14px' }}>{data?.extract}</span>
    </Container>
  );
};

export default EntityCard;
