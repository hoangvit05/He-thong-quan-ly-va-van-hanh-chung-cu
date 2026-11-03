import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  className = '',
  dot = false,
}) => {
  const variantStyles: Record<BadgeVariant, { bg: string; text: string; dotColor: string }> = {
    success: {
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-800',
      dotColor: 'bg-emerald-500',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      dotColor: 'bg-amber-500',
    },
    danger: {
      bg: 'bg-rose-50 border-rose-200',
      text: 'text-rose-800',
      dotColor: 'bg-rose-500',
    },
    info: {
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      dotColor: 'bg-blue-500',
    },
    primary: {
      bg: 'bg-indigo-50 border-indigo-200',
      text: 'text-indigo-800',
      dotColor: 'bg-indigo-500',
    },
    neutral: {
      bg: 'bg-slate-100 border-slate-200',
      text: 'text-slate-800',
      dotColor: 'bg-slate-400',
    },
  };

  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dotColor}`} />}
      <span>{children}</span>
    </span>
  );
};
