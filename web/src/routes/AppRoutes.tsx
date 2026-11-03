import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { AdminAccountsPage } from '../pages/AdminAccountsPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { RequireAuth, RequireRole, RootRedirect } from './RouteGuard';

// Khai báo cố định React.lazy ngoài phạm vi component để tránh tái khởi tạo mỗi lần render.
const DashboardPage = React.lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ResidentsPage = React.lazy(() =>
  import('../pages/ResidentsPage').then((m) => ({ default: m.ResidentsPage }))
);
const TicketDispatchPage = React.lazy(() =>
  import('../pages/TicketDispatchPage').then((m) => ({ default: m.TicketDispatchPage }))
);
const TechnicianTasksPage = React.lazy(() =>
  import('../pages/TechnicianTasksPage').then((m) => ({ default: m.TechnicianTasksPage }))
);
const BillingManagerPage = React.lazy(() =>
  import('../pages/BillingManagerPage').then((m) => ({ default: m.BillingManagerPage }))
);
const FeedbackManagementPage = React.lazy(() =>
  import('../pages/FeedbackManagementPage').then((m) => ({ default: m.FeedbackManagementPage }))
);
const AnnouncementsPage = React.lazy(() =>
  import('../pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage }))
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* 1. Tuyến đường công khai */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* 2. Tuyến đường yêu cầu đăng nhập */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {/* Tự động điều hướng trang chủ theo vai trò người dùng */}
          <Route path="/" element={<RootRedirect />} />

          {/* Chuyển hướng tương thích cho các đường dẫn cũ từ Ngày 1 */}
          <Route path="/ticket-dispatch" element={<Navigate to="/tickets/dispatch" replace />} />
          <Route path="/technician-tasks" element={<Navigate to="/technician/tasks" replace />} />

          {/* Tuyến đường Bàn làm việc tổng quan dành cho BQL và ADMIN */}
          <Route element={<RequireRole allowedRoles={['BQL', 'ADMIN']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* Tuyến đường chỉ dành cho Quản trị viên (ADMIN) */}
          <Route element={<RequireRole allowedRoles={['ADMIN']} />}>
            <Route path="/admin/accounts" element={<AdminAccountsPage />} />
          </Route>

          {/* Tuyến đường dành cho Ban Quản Lý (BQL) */}
          <Route element={<RequireRole allowedRoles={['BQL']} />}>
            <Route path="/residents" element={<ResidentsPage />} />
            <Route path="/tickets/dispatch" element={<TicketDispatchPage />} />
            <Route path="/billing" element={<BillingManagerPage />} />
            <Route path="/feedback" element={<FeedbackManagementPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
          </Route>

          {/* Tuyến đường dành riêng cho Thợ kỹ thuật (TECHNICIAN) */}
          <Route element={<RequireRole allowedRoles={['TECHNICIAN']} />}>
            <Route path="/technician/tasks" element={<TechnicianTasksPage />} />
          </Route>
        </Route>
      </Route>

      {/* 3. Bắt mọi URL không tồn tại và điều hướng về trang chủ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
