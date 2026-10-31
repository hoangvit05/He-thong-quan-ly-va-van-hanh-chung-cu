import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';
import { LoginPage } from '../pages/LoginPage';
import { AdminAccountsPage } from '../pages/AdminAccountsPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { RequireAuth, RequireRole, RootRedirect } from './RouteGuard';

type PageModule = { default?: React.ComponentType };

// Khai báo cố định React.lazy ngoài phạm vi component để tránh tái khởi tạo mỗi lần render
const ResidentsPage = React.lazy(() =>
  import('../pages/ResidentsPage').then((m) => ({ default: m.ResidentsPage || (m as PageModule).default || (() => null) }))
);
const TicketDispatchPage = React.lazy(() =>
  import('../pages/TicketDispatchPage').then((m) => ({ default: m.TicketDispatchPage || (m as PageModule).default || (() => null) }))
);
const TechnicianTasksPage = React.lazy(() =>
  import('../pages/TechnicianTasksPage').then((m) => ({ default: m.TechnicianTasksPage || (m as PageModule).default || (() => null) }))
);
const BillingManagerPage = React.lazy(() =>
  import('../pages/BillingManagerPage').then((m) => ({ default: m.BillingManagerPage || (m as PageModule).default || (() => null) }))
);
const FeedbackManagementPage = React.lazy(() =>
  import('../pages/FeedbackManagementPage').then((m) => ({ default: m.FeedbackManagementPage || (m as PageModule).default || (() => null) }))
);
const AnnouncementsPage = React.lazy(() =>
  import('../pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage || (m as PageModule).default || (() => null) }))
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

          {/* Tuyến đường chỉ dành cho Quản trị viên (ADMIN) */}
          <Route element={<RequireRole allowedRoles={['ADMIN']} />}>
            <Route path="/admin/accounts" element={<AdminAccountsPage />} />
          </Route>

          {/* Tuyến đường dành cho Ban Quản Lý (BQL) & Quản trị viên (ADMIN) */}
          <Route element={<RequireRole allowedRoles={['ADMIN', 'BQL']} />}>
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
