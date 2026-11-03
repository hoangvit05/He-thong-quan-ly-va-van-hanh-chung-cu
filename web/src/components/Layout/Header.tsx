import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser, clearAuthSession } from '../../utils/auth';
import { Badge } from '../common/Badge';

export interface HeaderProps {
  onToggleMobile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobile }) => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const displayName = user?.fullName || user?.username || 'Người dùng';
  const displayRole = user?.role || 'GUEST';

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'danger';
      case 'BQL':
        return 'primary';
      case 'TECHNICIAN':
        return 'success';
      default:
        return 'neutral';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'Quản trị viên';
      case 'BQL':
        return 'Ban quản lý';
      case 'TECHNICIAN':
        return 'Kỹ thuật viên';
      default:
        return role;
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shadow-sm shrink-0 sticky top-0 z-30">
      {/* Khối bên trái: Nút Hamburger trên mobile + Tiêu đề */}
      <div className="flex items-center gap-3">
        {onToggleMobile && (
          <button
            type="button"
            onClick={onToggleMobile}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Mở danh mục điều hướng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-sm md:text-base font-bold text-slate-800 tracking-tight leading-snug">
            HỆ THỐNG QUẢN LÝ VẬN HÀNH CHUNG CƯ
          </h1>
          <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
            Trung tâm điều hành và xử lý tác vụ nội bộ
          </p>
        </div>
      </div>

      {/* Khối bên phải: Tài khoản và Nút Đăng xuất */}
      <div className="flex items-center gap-3 md:gap-4">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-sm font-bold text-slate-800 truncate max-w-[160px] md:max-w-[220px]">
            {displayName}
          </span>
          <Badge variant={getRoleBadgeVariant(displayRole)} dot className="mt-0.5">
            {getRoleLabel(displayRole)}
          </Badge>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 text-xs md:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3.5 py-2 rounded-lg transition min-h-[40px] shadow-sm active:bg-rose-200"
          aria-label="Đăng xuất khỏi hệ thống"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span>Đăng xuất</span>
        </button>
      </div>
    </header>
  );
};
