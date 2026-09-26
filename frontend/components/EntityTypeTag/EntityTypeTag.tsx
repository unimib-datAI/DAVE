import styled from '@emotion/styled';
import { darken } from 'polished';

type EntityTypeTagProps = {
  color: string;
  label: string;
  fontSize: string;
};

function EntityTypeTag({ color, label, fontSize }: EntityTypeTagProps) {
  return (
    <Tag color={color} fontSize={fontSize}>
      <span>{label}</span>
    </Tag>
  );
}
export default EntityTypeTag;

const Tag = styled.div<{ color: string; fontSize: string }>`
  background-color: ${(props) => props.color};
  width: fit-content;
  padding: 0px 4px;
  border-radius: 6px;
  border: 1px solid ${(props) => darken(0.05, props.color ?? '#FFFFFF')};
  margin-right: auto;

  span {
    color: ${(props) => darken(0.7, props.color ?? '#FFFFFF')} !important;
    font-size: ${(props) => props.fontSize};
  }
`;
