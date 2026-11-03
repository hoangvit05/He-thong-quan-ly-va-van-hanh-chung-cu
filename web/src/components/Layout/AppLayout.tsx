import React, { Suspense, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { getStoredToken } from '../../utils/auth';

export const RouteLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[400px] text-slate-500 font-medium">
    <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm">
      <svg
        className="animate-spin h-5 w-5 text-indigo-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span className="text-sm font-semibold text-slate-700">Đang tải phân hệ...</span>
    </div>
  </div>
);

export const AppLayout: React.FC = () => {
  const token = getStoredToken();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* 1. Sidebar điều hướng đa màn hình */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Khung nội dung chính */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobile={() => setIsMobileMenuOpen((prev) => !prev)} />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};
