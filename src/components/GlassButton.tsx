import React, { ButtonHTMLAttributes } from 'react';

export const GlassButton = (props: ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { className = '', children, ...rest } = props;
  return (
    <button className={`glass-button ${className}`} {...rest}>
      {children}
    </button>
  );
};
