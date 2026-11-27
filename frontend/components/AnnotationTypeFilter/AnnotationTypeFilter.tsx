import {
  FlattenedTaxonomy,
  Taxonomy,
} from '@/modules/document/DocumentProvider/types';
import { getAnnotationTypes } from '@/modules/document/DocumentProvider/utils';
import { EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { Checkbox } from '@heroui/react';
import { useMemo, useState } from 'react';
import { useText } from '@/components/TranslationProvider';

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
  types: string[];
};

const AnnotationTypeFilter = ({
  taxonomy,
  annotations,
  value,
  onChange,
}: AnnotationTypeListProps) => {
  const t = useText('document');
  // One chip per displayed type; a chip covers every raw type shown as that
  // type (PERSON from the NER and persona added by hand are both "Person").
  const items = useMemo(
    () => getAnnotationTypes(taxonomy, annotations),
    [taxonomy, annotations]
  );

  const total = useMemo(() => {
    return items.reduce((acc, item) => acc + item.n, 0);
  }, [items]);

  // `value` holds RAW types (that is what annotations are filtered by); a chip
  // is selected when all of its raw types are.
  const active = useMemo(
    () => new Set((value ?? []).map((v) => v.toLowerCase())),
    [value]
  );
  const isItemSelected = (item: Item) =>
    item.types.every((t) => active.has(t.toLowerCase()));
  const selectedCount = items.filter(isItemSelected).length;

  const handleAllClick = () => {
    onChange(selectedCount === items.length ? [] : items.flatMap((item) => item.types));
  };

  const handleItemClick = (item: Item) => {
    const own = new Set(item.types.map((t) => t.toLowerCase()));
    const others = (value ?? []).filter((v) => !own.has(v.toLowerCase()));
    onChange(isItemSelected(item) ? others : [...others, ...item.types]);
  };

  const isAllSelected = items.length > 0 && selectedCount === items.length;
  const isAllIndeterminate = selectedCount > 0 && selectedCount < items.length;

  return (
    <Container>
      <FilterButton onClick={handleAllClick}>
        <Checkbox
          className="pointer-events-none"
          aria-label="select all"
          isSelected={isAllSelected}
          isIndeterminate={isAllIndeterminate}
        />
        {t('typeFilterAll')} - {total}
      </FilterButton>
      {items.map((item) => (
        <FilterButton key={item.key} onClick={() => handleItemClick(item)}>
          <Checkbox
            className="pointer-events-none"
            aria-label="item"
            size="sm"
            isSelected={isItemSelected(item)}
          />
          {item.label} - {item.n}
        </FilterButton>
      ))}
    </Container>
  );
};

export default AnnotationTypeFilter;
