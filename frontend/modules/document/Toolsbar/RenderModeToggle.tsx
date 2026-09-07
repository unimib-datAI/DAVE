import styled from '@emotion/styled';
import {
  selectViewRenderMode,
  useDocumentDispatch,
  useSelector,
} from '../DocumentProvider/selectors';
import { RenderMode } from '../DocumentProvider/types';
import { useViewIndex } from '../ViewProvider/ViewProvider';

const Group = styled.div({
  display: 'inline-flex',
  border: '1px solid #E4E4E7',
  borderRadius: '6px',
  overflow: 'hidden',
});

const ModeButton = styled.button<{ active: boolean }>(({ active }) => ({
  border: 'none',
  outline: 'none',
  cursor: 'pointer',
  padding: '4px 10px',
  fontSize: '12px',
  fontWeight: 500,
  background: active ? '#18181B' : '#FFF',
  color: active ? '#FFF' : 'rgba(0,0,0,0.6)',
  transition: 'background 150ms ease-out',
}));

const options: { value: RenderMode; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'classic', label: 'Classic' },
];

const RenderModeToggle = () => {
  const viewIndex = useViewIndex();
  const mode = useSelector((state) => selectViewRenderMode(state, viewIndex));
  const dispatch = useDocumentDispatch();

  return (
    <Group role="group" aria-label="document render mode">
      {options.map((option) => (
        <ModeButton
          key={option.value}
          type="button"
          active={mode === option.value}
          aria-pressed={mode === option.value}
          onClick={() =>
            dispatch({
              type: 'setView',
              payload: { viewIndex, view: { renderMode: option.value } },
            })
          }
        >
          {option.label}
        </ModeButton>
      ))}
    </Group>
  );
};

export default RenderModeToggle;
