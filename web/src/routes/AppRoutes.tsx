// ===================================================================
// FILE LINK TOÀN BỘ CÁC TRANG WEB VÀO HỆ THỐNG ĐIỀU HƯỚNG
// Phụ trách: Đặng Hoàng (Leader)
// Thành viên KHÔNG sửa file này! Chỉ code vào đúng file trang của mình!
// ===================================================================

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/Layout/AppLayout';

// 1. Pages của Đặng Hoàng
import { LoginPage } from '../pages/LoginPage';
import { AdminAccountsPage } from '../pages/AdminAccountsPage';

// 2. Pages của Đức
import { ResidentsPage } from '../pages/ResidentsPage';
import { TicketDispatchPage } from '../pages/TicketDispatchPage';
import { BillingManagerPage } from '../pages/BillingManagerPage';

// 3. Pages của Oanh
import { TechnicianTasksPage } from '../pages/TechnicianTasksPage';
import { AnnouncementsPage } from '../pages/AnnouncementsPage';
import { FeedbackManagementPage } from '../pages/FeedbackManagementPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Các trang thuộc giao diện quản lý */}
      <Route path="/" element={<Navigate to="/ticket-dispatch" replace />} />
      <Route path="/admin/accounts" element={<AppLayout><AdminAccountsPage /></AppLayout>} />
      <Route path="/residents" element={<AppLayout><ResidentsPage /></AppLayout>} />
      <Route path="/ticket-dispatch" element={<AppLayout><TicketDispatchPage /></AppLayout>} />
      <Route path="/billing" element={<AppLayout><BillingManagerPage /></AppLayout>} />
      <Route path="/technician-tasks" element={<AppLayout><TechnicianTasksPage /></AppLayout>} />
      <Route path="/announcements" element={<AppLayout><AnnouncementsPage /></AppLayout>} />
      <Route path="/feedback" element={<AppLayout><FeedbackManagementPage /></AppLayout>} />
    </Routes>
  );
};
