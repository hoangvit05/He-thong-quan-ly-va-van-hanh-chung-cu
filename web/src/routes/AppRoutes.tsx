import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { AdminAccountsPage } from '../pages/AdminAccountsPage';

// Import các trang khác với dự phòng lỗi nếu file chưa code xong
const SafeLazy = (factory: () => Promise<any>, fallbackName: string) => {
  const Component = React.lazy(factory);
  return (
    <Suspense fallback={<div className="p-4">Đang tải...</div>}>
      <Component />
    </Suspense>
  );
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppLayout />}>
        <Route path="/admin/accounts" element={<AdminAccountsPage />} />

        {/* Định tuyến an toàn sang các trang của đồng đội */}
        <Route path="/residents" element={SafeLazy(() => import('../pages/ResidentsPage').then(m => ({ default: m.ResidentsPage || m.default })), 'Residents')} />
        <Route path="/tickets/dispatch" element={SafeLazy(() => import('../pages/TicketDispatchPage').then(m => ({ default: m.TicketDispatchPage || m.default })), 'TicketDispatch')} />
        <Route path="/technician/tasks" element={SafeLazy(() => import('../pages/TechnicianTasksPage').then(m => ({ default: m.TechnicianTasksPage || m.default })), 'TechnicianTasks')} />
        <Route path="/billing" element={SafeLazy(() => import('../pages/BillingManagerPage').then(m => ({ default: m.BillingManagerPage || m.default })), 'BillingManager')} />
        <Route path="/feedback" element={SafeLazy(() => import('../pages/FeedbackManagementPage').then(m => ({ default: m.FeedbackManagementPage || m.default })), 'Feedback')} />
        <Route path="/announcements" element={SafeLazy(() => import('../pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage || m.default })), 'Announcements')} />

        <Route path="/" element={<Navigate to="/admin/accounts" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};