import React from 'react';

export interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  fullHeight?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  text = 'Đang tải dữ liệu...',
  size = 'md',
  fullHeight = false,
}) => {
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-10 w-10',
  };

  return (
    <div
      className={`flex flex-col items-center justify-center p-6 text-slate-500 font-medium ${
        fullHeight ? 'min-h-[400px]' : 'py-8'
      }`}
    >
      <div className="flex items-center space-x-3 bg-white/80 px-5 py-3 rounded-xl border border-slate-200 shadow-sm">
        <svg
          className={`animate-spin ${sizeMap[size]} text-indigo-600`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm font-semibold text-slate-700">{text}</span>
      </div>
    </div>
  );
};
