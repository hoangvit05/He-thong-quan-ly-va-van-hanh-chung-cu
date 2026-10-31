// ===================================================
// AUTH SESSION & USER UTILITY
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

import { AppRole } from '../constants/menu';

export interface StoredUser {
  id?: number;
  username?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: AppRole;
  roomId?: number | null;
  roomNumber?: string | null;
  isApproved?: boolean;
}

export interface LoginResponseData {
  token: string;
  user: StoredUser;
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  message: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const VALID_ROLES: AppRole[] = ['ADMIN', 'BQL', 'TECHNICIAN', 'RESIDENT'];

/**
 * Đọc token an toàn từ localStorage (chống lưu chuỗi 'undefined' / 'null')
 */
export function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null' || token.trim() === '') {
      return null;
    }
    return token.trim();
  } catch {
    return null;
  }
}

/**
 * Đọc user an toàn từ localStorage (chống cú pháp JSON hỏng gây crash giao diện)
 */
export function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw || raw === 'undefined' || raw === 'null' || raw.trim() === '') {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as StoredUser;
  } catch {
    return null;
  }
}

/**
 * Thiết lập phiên đăng nhập vào localStorage một cách an toàn
 */
export function setAuthSession(token: string, user: StoredUser): boolean {
  if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null' || !token.trim()) {
    return false;
  }
  if (!user || typeof user !== 'object' || !user.role || !VALID_ROLES.includes(user.role)) {
    return false;
  }
  try {
    localStorage.setItem('token', token.trim());
    localStorage.setItem('user', JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

/**
 * Xóa sạch dữ liệu phiên đăng nhập
 */
export function clearAuthSession(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  } catch {
    // Không ném lỗi nếu localStorage bị chặn
  }
}

/**
 * Kiểm tra trạng thái đã đăng nhập và có vai trò hợp lệ
 */
export function isAuthenticated(): boolean {
  const token = getStoredToken();
  const user = getStoredUser();
  return Boolean(token && user && user.role && VALID_ROLES.includes(user.role));
}
