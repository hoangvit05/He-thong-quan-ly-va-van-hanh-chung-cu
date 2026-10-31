// ===================================================
// FRONTEND ROUTE GUARDS (RBAC & AUTHENTICATION)
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredToken, getStoredUser } from '../utils/auth';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { AppRole } from '../constants/menu';

/**
 * 1. RequireAuth: Bảo vệ các tuyến đường yêu cầu người dùng phải đăng nhập
 */
export const RequireAuth: React.FC = () => {
  const token = getStoredToken();
  const user = getStoredUser();
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Cư dân tuyệt đối không có quyền vào Cổng quản trị Web
  if (user.role === 'RESIDENT') {
    return <UnauthorizedPage />;
  }

  return <Outlet />;
};

interface RequireRoleProps {
  allowedRoles: AppRole[];
}

/**
 * 2. RequireRole: Kiểm soát phân quyền dựa trên vai trò thực tế từ Backend
 */
export const RequireRole: React.FC<RequireRoleProps> = ({ allowedRoles }) => {
  const user = getStoredUser();
  const userRole = (user?.role || '') as AppRole;

  if (!user || !userRole) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(userRole)) {
    return <UnauthorizedPage requiredRoles={allowedRoles} />;
  }

  return <Outlet />;
};

/**
 * 3. RootRedirect: Tự động điều hướng từ trang gốc '/' tới màn hình làm việc mặc định theo từng vai trò
 */
export const RootRedirect: React.FC = () => {
  const user = getStoredUser();
  const userRole = user?.role;

  switch (userRole) {
    case 'ADMIN':
      return <Navigate to="/admin/accounts" replace />;
    case 'BQL':
      return <Navigate to="/residents" replace />;
    case 'TECHNICIAN':
      return <Navigate to="/technician/tasks" replace />;
    case 'RESIDENT':
    default:
      return <Navigate to="/login" replace />;
  }
};
