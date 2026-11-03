// ===================================================
// FRONTEND ROUTE GUARDS (RBAC & AUTHENTICATION)
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredUser, evaluateRouteAccess, getRootRedirectPath } from '../utils/auth';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { AppRole } from '../constants/menu';

/**
 * 1. RequireAuth: Bảo vệ các tuyến đường yêu cầu người dùng phải đăng nhập
 */
export const RequireAuth: React.FC = () => {
  const user = getStoredUser();
  const location = useLocation();
  const decision = evaluateRouteAccess(user);

  if (decision.status === 302) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (decision.status === 403) {
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
  const decision = evaluateRouteAccess(user, allowedRoles);

  if (decision.status === 302) {
    return <Navigate to="/login" replace />;
  }

  if (decision.status === 403) {
    return <UnauthorizedPage requiredRoles={allowedRoles} />;
  }

  return <Outlet />;
};

/**
 * 3. RootRedirect: Tự động điều hướng từ trang gốc '/' tới màn hình làm việc mặc định theo từng vai trò
 */
export const RootRedirect: React.FC = () => {
  const user = getStoredUser();
  const targetPath = getRootRedirectPath(user?.role);
  return <Navigate to={targetPath} replace />;
};
