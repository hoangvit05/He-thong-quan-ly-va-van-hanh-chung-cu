import React, { Suspense } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { getStoredToken } from '../../utils/auth';

export const RouteLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[300px] text-slate-500 font-medium">
    <div className="flex items-center space-x-3 bg-white px-5 py-3 rounded-lg border shadow-sm">
      <svg
        className="animate-spin h-5 w-5 text-indigo-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        />
      </svg>
      <span>Đang tải nội dung...</span>
    </div>
  </div>
);

export const AppLayout: React.FC = () => {
  const token = getStoredToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};
