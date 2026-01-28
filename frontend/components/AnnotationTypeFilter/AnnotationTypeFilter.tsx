import {
  FlattenedTaxonomy,
  Taxonomy,
} from '@/modules/document/DocumentProvider/types';
import { getAnnotationTypes } from '@/modules/document/DocumentProvider/utils';
import { EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { Checkbox } from '@nextui-org/react';
import { useMemo, useState } from 'react';
import { getNormalizedEntityType } from '@/modules/document/DocumentProvider/utils';

const Container = styled.div({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  padding: '5px',
  overflowX: 'auto',
  '::-webkit-scrollbar': {
    height: '0px',
    width: '0px',
  },
});

const FilterButton = styled.button({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '10px',
  flexShrink: 0,
  border: 'none',
  outline: 'none',
  background: '#FFF',
  borderRadius: '16px',
  fontSize: '13px',
  padding: '3px 10px',
  color: 'rgb(0 0 0 / 50%)',
  boxShadow: '0 0 0 1px rgb(0 0 0 / 10%)',
  fontWeight: 600,
  cursor: 'pointer',
  '&:hover': {
    background: 'rgba(0,0,0,0.05)',
  },
  // ...(selected && {
  //   background: 'rgba(0, 112, 243, 0.05)',
  //   color: 'rgb(0, 112, 243)',
  //   boxShadow: '0 0 0 1px #0070F3',
  // })
});

type AnnotationTypeListProps = {
  annotations: EntityAnnotation[];
  taxonomy: FlattenedTaxonomy;
  value: string[];
  onChange: (types: string[]) => void;
};

type Item = {
  key: string;
  label: string;
  n: number;
};

const AnnotationTypeFilter = ({
  taxonomy,
  annotations,
  value,
  onChange,
}: AnnotationTypeListProps) => {
  // Create grouped items by normalized entity type
  const items = useMemo(() => {
    // Group annotations by their normalized type
    const groupedAnnotations = new Map<string, EntityAnnotation[]>();

    annotations.forEach((annotation) => {
      if (!groupedAnnotations.has(annotation.type)) {
        groupedAnnotations.set(annotation.type, []);
      }
      groupedAnnotations.get(annotation.type)!.push(annotation);
    });

    // Convert to the format expected by the component
    const result = Array.from(groupedAnnotations.entries()).map(
      ([normalizedType, anns]) => {
        // Get the node from taxonomy - case insensitive matching
        const lowerNormalizedType = normalizedType.toLowerCase();
        const node = taxonomy[normalizedType] ||
          Object.values(taxonomy).find(
            (n) => n.key.toLowerCase() === lowerNormalizedType
          ) || { key: normalizedType, label: normalizedType };

        return {
          key: normalizedType,
          label: node.label || normalizedType,
          n: anns.length,
        };
      }
    );

    // Sort by count descending
    return result.sort((a, b) => b.n - a.n);
  }, [taxonomy, annotations]);

  const total = useMemo(() => {
    return items.reduce((acc, item) => acc + item.n, 0);
  }, [items]);

  const handleAllClick = () => {
    let newValue: string[] = [];
    if (value.length !== items.length) {
      newValue = items.map((item) => item.key);
    }

    onChange(newValue);
  };

  const handleItemClick = (key: string) => {
    let newValue = Array.isArray(value) ? value.slice() : [];
    // Case-insensitive check for the key in the value array
    const itemIndex = value.findIndex(
      (v) => v.toLowerCase() === key.toLowerCase()
    );

    if (itemIndex === -1) {
      newValue.push(key);
    } else {
      newValue.splice(itemIndex, 1);
    }
    onChange(newValue);
  };

  // Get all original types that map to the same group
  const getOriginalTypesForItem = (item: Item): string[] => {
    // Look through all annotations to find original types that map to this item's key - case insensitive
    const originalTypes = new Set<string>();
    const lowerItemKey = item.key.toLowerCase();

    annotations.forEach((ann) => {
      if (ann.type.toLowerCase() === lowerItemKey) {
        originalTypes.add(ann.type);
      }
    });

    return Array.from(originalTypes);
  };

  const isAllSelected = value.length === items.length;
  const isAllIndeterminate = value.length < items.length && value.length > 0;

  return (
    <Container>
      <FilterButton onClick={handleAllClick}>
        <Checkbox
          aria-label="select all"
          isSelected={isAllSelected}
          isIndeterminate={isAllIndeterminate}
        />
        All - {total}
      </FilterButton>
      {items.map((item) => (
        <FilterButton key={item.key} onClick={() => handleItemClick(item.key)}>
          <Checkbox
            aria-label="item"
            size="sm"
            isSelected={value.some(
              (v) => v.toLowerCase() === item.key.toLowerCase()
            )}
          />
          {item.label} - {item.n}
        </FilterButton>
      ))}
    </Container>
  );
};

export default AnnotationTypeFilter;
