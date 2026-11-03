import React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalRecords,
  onPageChange,
  isLoading = false,
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= safeTotalPages;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm text-sm">
      <div className="text-slate-600 font-medium text-xs sm:text-sm">
        Trang <b className="text-slate-900">{currentPage}</b> / <b className="text-slate-900">{safeTotalPages}</b>
        {typeof totalRecords === 'number' && (
          <span className="text-slate-500 ml-1.5">
            (Tổng cộng <b className="text-slate-900">{totalRecords}</b> bản ghi)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isFirstPage || isLoading}
          onClick={() => onPageChange(currentPage - 1)}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          }
        >
          Trang trước
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={isLastPage || isLoading}
          onClick={() => onPageChange(currentPage + 1)}
          className="flex-row-reverse"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          }
        >
          Trang sau
        </Button>
      </div>
    </div>
  );
};
