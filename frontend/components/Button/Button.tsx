import React from 'react';
import styled from '@emotion/styled';
import { Spinner } from '@heroui/react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  onPress?: () => void;
  // legacy HeroUI props — accepted but ignored to avoid React warnings
  auto?: boolean;
  color?: string;
  css?: object;
  iconRight?: React.ReactNode;
  endContent?: React.ReactNode;
};

const StyledButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, transform 0.06s ease;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.12);
  &:hover {
    background: #1e40af;
  }
  &:active {
    transform: translateY(1px);
  }
  &:disabled,
  &[aria-disabled='true'] {
    background: #93c5fd;
    cursor: not-allowed;
    opacity: 0.95;
    box-shadow: none;
  }
`;

const Button = ({
  loading,
  children,
  disabled,
  style,
  onPress,
  onClick,
  auto,
  color,
  css: _css,
  iconRight,
  endContent,
  ...props
}: ButtonProps) => {
  const isDisabled = Boolean(loading || disabled || props['aria-disabled']);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onPress) onPress();
    if (onClick) onClick(e);
  };
  return (
    <StyledButton
      disabled={isDisabled}
      aria-disabled={isDisabled}
      style={style}
      onClick={handleClick}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {loading ? <Spinner color="current" size="sm" /> : children}
      {endContent && !loading && (
        <span style={{ display: 'inline-flex' }}>{endContent}</span>
      )}
      {iconRight && !loading && (
        <span style={{ display: 'inline-flex' }}>{iconRight}</span>
      )}
    </StyledButton>
  );
};

export default Button;
