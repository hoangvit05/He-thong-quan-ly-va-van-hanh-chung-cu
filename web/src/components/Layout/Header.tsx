import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser, clearAuthSession } from '../../utils/auth';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  const displayName = user?.fullName || user?.username || 'Người dùng';
  const displayRole = user?.role || 'GUEST';

  return (
    <header className="h-16 bg-white border-b px-6 flex items-center justify-between shadow-sm">
      <h2 className="text-base md:text-lg font-bold text-gray-800">
        HỆ THỐNG QUẢN LÝ VẬN HÀNH CHUNG CƯ
      </h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          Xin chào, <b>{displayName}</b> ({displayRole})
        </span>
        <button
          onClick={handleLogout}
          className="text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded transition font-medium"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
};
