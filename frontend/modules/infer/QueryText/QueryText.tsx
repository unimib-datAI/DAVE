import {
  AnnotationTypeFilter,
  Button,
  EntityCard,
  Flex,
  IconButton,
  useText,
} from '@/components';
import { useInput, useOnceEffect } from '@/hooks';
import styled from '@emotion/styled';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@/utils/trpc';
import { Textarea, Text, Tooltip } from '@nextui-org/react';
import { flattenTree, getAllNodeData } from '@/components/Tree';
import { baseTaxonomy } from '@/modules/document/DocumentProvider/state';
import NER from '@/components/NER/NER';
import AnnotationSetFilter from './AnnotationSetFilter';
import { Document } from '@/server/routers/document';
import { FiDownload } from '@react-icons/all-files/fi/FiDownload';

type QueryTextProps = {
  contentExample: string;
};

const TextAreaWrapper = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  gap: 10px;
`;

const StyledTextarea = styled(Textarea)`
  position: relative;
  width: 100%;
  height: 100%;

  &::-webkit-scrollbar {
    height: 4px;
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.26);
  }
  &:focus {
    box-shadow: 0 0 0 1px rgb(0 0 0/0.05);
    background-color: rgb(255 255 255);
  }
`;
const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 15px;
`;

const QueryText = ({ contentExample }: QueryTextProps) => {
  const t = useText('infer');

  const inferMutation = useMutation(['infer.getResults'], { ssr: false });
  // binds for the text area
  const { binds } = useInput(contentExample);
  // states
  const [currentAnnotationSet, setCurrentAnnotationSet] =
    useState<string>('entities_best_NER');
  const [entityFilter, setEntityFilter] = useState<string[]>([]);
  // for now use base taxonomy
  const taxonomy = useMemo(() => flattenTree(baseTaxonomy), []);

  const doc = inferMutation.data;

  // useEffect(() => {
  //   // trigger pipeline when page first loads
  //   onClick();
  // }, [])

  const onClick = () => {
    inferMutation.mutate(
      {
        value: binds.value,
      },
      {
        onSuccess: (data) => {
          const firstEntityAnnSetKey = Object.keys(data.annotation_sets).find(
            (key) => key.startsWith('entities_')
          );
          if (!firstEntityAnnSetKey) {
            return;
          }

          setEntityFilter(getTypes(data, firstEntityAnnSetKey));
          setCurrentAnnotationSet(firstEntityAnnSetKey);
        },
      }
    );
  };

  const handleAnnotationSetChange = (annSet: string) => {
    if (!inferMutation.data) {
      return;
    }
    setEntityFilter(getTypes(inferMutation.data, annSet));
    setCurrentAnnotationSet(annSet);
  };

  const handleAnnotationTypeFilterChange = (types: string[]) => {
    setEntityFilter(types);
  };

  const handleDownloadDocument = () => {
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(
      JSON.stringify(doc)
    )}`;
    const link = document.createElement('a');
    link.href = jsonString;
    link.download = 'data.json';

    link.click();
  };

  // get the types for the current annotation set
  const getTypes = (document: Document, annSet: string) => {
    let typeFilter = new Set<string>();
    document.annotation_sets[annSet].annotations.forEach((ann) => {
      typeFilter.add(ann.type);
    });
    return Array.from(typeFilter);
  };

  const getTaxonomyNode = useCallback(
    (key: string) => {
      const node = getAllNodeData(taxonomy, key);
      return node;
    },
    [taxonomy]
  );

  // get all entities annotation sets
  const entityAnnotationSets = useMemo(() => {
    if (!doc) {
      return [];
    }
    return Object.values(doc.annotation_sets).filter((annSet) =>
      annSet.name.startsWith('entities_')
    );
  }, [doc]);

  // filter annotations based on the current type filter and current annotation set
  const filteredAnnotations = useMemo(() => {
    if (!doc) {
      return [];
    }
    const { annotations } = doc.annotation_sets[currentAnnotationSet];

    return annotations.filter((ann) => {
      return entityFilter.indexOf(ann.type) !== -1;
    });
  }, [doc, entityFilter, currentAnnotationSet]);

  return (
    <>
      <TextAreaWrapper>
        <StyledTextarea
          {...binds}
          size="lg"
          rows={10}
          autoComplete="off"
          spellCheck="false"
          aria-label="infer text"
        />
        <Text color="rgb(75 85 99)" css={{ textAlign: 'end' }}>
          {t('nWords', { n: binds.value.split(' ').length })}{' '}
        </Text>
      </TextAreaWrapper>
      <Button onClick={onClick} loading={inferMutation.isLoading}>
        Compute
      </Button>
      {inferMutation.isError && (
        <Text color="error">Something went wrong :(</Text>
      )}
      {doc && !inferMutation.isLoading ? (
        <Column>
          <Flex direction="row" gap="20px">
            <Tooltip content={'Download'} color="invert">
              <IconButton onClick={handleDownloadDocument}>
                <FiDownload />
              </IconButton>
            </Tooltip>
            <AnnotationSetFilter
              annotationSets={entityAnnotationSets}
              value={currentAnnotationSet}
              onChange={handleAnnotationSetChange}
            />
            <AnnotationTypeFilter
              taxonomy={taxonomy}
              annotations={
                doc.annotation_sets[currentAnnotationSet].annotations
              }
              value={entityFilter}
              onChange={handleAnnotationTypeFilterChange}
            />
          </Flex>

          <NER
            page={1}
            taxonomy={taxonomy}
            text={binds.value}
            entityAnnotations={filteredAnnotations}
            renderContentHover={(ann) => (
              <EntityCard annotation={ann} getTaxonomyNode={getTaxonomyNode} />
            )}
          />
        </Column>
      ) : null}
    </>
  );
};

export default QueryText;
