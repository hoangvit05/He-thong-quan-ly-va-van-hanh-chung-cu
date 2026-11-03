import React, { useState, useEffect } from 'react';
import { Button } from './Button';

export interface FilterOption {
  label: string;
  value: string;
}

export interface SearchFilterBarProps {
  searchPlaceholder?: string;
  onSearchChange: (keyword: string) => void;
  filters?: {
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (val: string) => void;
  }[];
  onReset?: () => void;
  debounceMs?: number;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchPlaceholder = 'Tìm kiếm dữ liệu...',
  onSearchChange,
  filters,
  onReset,
  debounceMs = 400,
}) => {
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchInput.trim());
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [searchInput, debounceMs, onSearchChange]);

  const handleClear = () => {
    setSearchInput('');
    onSearchChange('');
    if (onReset) {
      onReset();
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-3">
      {/* Ô tìm kiếm */}
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-11 pr-10 py-2.5 h-11 text-sm bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              onSearchChange('');
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Các bộ lọc phụ */}
      {filters && filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <select
              key={filter.id}
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              className="px-3 py-2 h-11 text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700"
            >
              <option value="">-- {filter.label} --</option>
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}

      {/* Nút đặt lại */}
      {onReset && (
        <Button variant="ghost" size="md" onClick={handleClear} className="shrink-0">
          Đặt lại
        </Button>
      )}
    </div>
  );
};
