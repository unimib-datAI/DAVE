import React, { CSSProperties } from 'react';

type TextProps = {
  children?: React.ReactNode;
  h1?: boolean;
  h2?: boolean;
  h3?: boolean;
  b?: boolean;
  small?: boolean;
  color?: string;
  size?: string;
  style?: CSSProperties;
  className?: string;
} & React.HTMLAttributes<HTMLElement>;

const HtmlText = ({
  children,
  h1,
  h2,
  h3,
  b,
  small,
  color,
  size,
  style,
  className,
  ...rest
}: TextProps) => {
  const Tag = h1 ? 'h1' : h2 ? 'h2' : h3 ? 'h3' : small ? 'small' : 'span';
  const computedStyle: CSSProperties = {
    color: color || undefined,
    fontWeight: b ? 600 : undefined,
    fontSize: size === '$sm' || size === 'sm' ? '0.875rem' : undefined,
    ...(style || {}),
  };

  return (
    // eslint-disable-next-line react/jsx-pascal-case
    React.createElement(
      Tag as any,
      { style: computedStyle, className, ...rest },
      children
    )
  );
};

export default HtmlText;
