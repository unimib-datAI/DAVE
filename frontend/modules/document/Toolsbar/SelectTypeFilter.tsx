import { BaseSelect, Option } from '@/components/BaseSelect';
import {
  useSelector,
  useDocumentDispatch,
  selectActiveEntityAnnotations,
  selectDocumentTagTypeFilter,
  selectDocumentTaxonomy,
} from '../DocumentProvider/selectors';
import { MouseEvent, useMemo } from 'react';
import { Checkbox } from '@heroui/react';
import { getAnnotationTypes } from '../DocumentProvider/utils';
import { useViewIndex } from '../ViewProvider/ViewProvider';
import { useText } from '@/components';

const SelectTypeFilter = () => {
  const t = useText('document');
  const viewIndex = useViewIndex();
  const annotations = useSelector((state) =>
    selectActiveEntityAnnotations(state, viewIndex)
  );
  const taxonomy = useSelector(selectDocumentTaxonomy);
  const typeFilters = useSelector((state) =>
    selectDocumentTagTypeFilter(state, viewIndex)
  );
  const dispatch = useDocumentDispatch();

  // One item per displayed type; each covers one or more raw types
  // (PERSON and persona are both "Person"), see getAnnotationTypes.
  const items = useMemo(() => {
    return getAnnotationTypes(taxonomy, annotations);
  }, [taxonomy, annotations]);

  // The view's filter holds RAW types (that is what annotations are filtered
  // by); an item is selected when all of its raw types are.
  const selectedKeys = useMemo(() => {
    const active = new Set(typeFilters.map((t) => t.toLowerCase()));
    return items
      .filter((item) => item.types.every((t) => active.has(t.toLowerCase())))
      .map((item) => item.key);
  }, [items, typeFilters]);

  const handleChange = (event: MouseEvent, value: string | string[]) => {
    if (!Array.isArray(value)) {
      return;
    }
    const chosen = new Set(value);
    dispatch({
      type: 'setView',
      payload: {
        viewIndex,
        view: {
          typeFilter: items.filter((item) => chosen.has(item.key)).flatMap((item) => item.types),
        },
      },
    });
  };

  return (
    <BaseSelect
      onChange={handleChange}
      value={selectedKeys}
      multiple
      inputProps={{
        labelLeft: t('subToolbar.types.label'),
        'aria-label': 'Select type filter',
      }}
    >
      {items.map((item) => (
        <Option key={item.key} value={item.key} label={item.label}>
          <Checkbox
            className="pointer-events-none"
            aria-label="Select item"
            isSelected={selectedKeys.includes(item.key)}
          />
          {item.label}
        </Option>
      ))}
    </BaseSelect>
  );
};

export default SelectTypeFilter;
