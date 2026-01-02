import {
  ButtonProps as NextUIButtonProps,
  Button as NextUIButton,
  Spinner,
} from '@heroui/react';

type ButtonProps = NextUIButtonProps & {
  loading?: boolean;
};

const Button = ({ loading, children, isDisabled, ...props }: ButtonProps) => {
  const disabled = loading ? true : isDisabled;
  return (
    <NextUIButton isDisabled={disabled} {...props}>
      {loading ? <Spinner color="current" size="sm" /> : children}
    </NextUIButton>
  );
};
export default Button;
