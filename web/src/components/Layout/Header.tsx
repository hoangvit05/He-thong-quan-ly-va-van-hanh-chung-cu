import React from 'react';
import { useNavigate } from 'react-router-dom';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <header className="h-16 bg-white border-b px-6 flex items-center justify-between shadow-sm">
      <h2 className="text-base md:text-lg font-bold text-gray-800">
        HỆ THỐNG QUẢN LÝ VẬN HÀNH CHUNG CƯ
      </h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          Xin chào, <b>{user.fullName || user.username || 'Người dùng'}</b> ({user.role || 'GUEST'})
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