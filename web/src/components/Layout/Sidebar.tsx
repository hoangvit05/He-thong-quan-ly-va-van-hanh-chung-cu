import React from 'react';
import { NavLink } from 'react-router-dom';
import { MENU_ITEMS, AppRole } from '../../constants/menu';
import { getStoredUser } from '../../utils/auth';

export interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen = false, onCloseMobile }) => {
  const user = getStoredUser();
  const userRole = (user?.role || '') as AppRole;

  // Lọc danh sách menu chuẩn xác theo role thực tế nhận từ Backend
  const accessibleMenu = MENU_ITEMS.filter((item) => item.roles.includes(userRole));

  return (
    <>
      {/* 1. Backdrop làm mờ khi mở Drawer trên màn hình di động/tablet (< lg) */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* 2. Container Sidebar (Cố định trên Desktop, Drawer trượt trên Mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 lg:static lg:w-64 bg-slate-900 text-slate-100 min-h-screen flex flex-col p-4 shrink-0 transition-transform duration-300 ease-in-out shadow-xl lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header thương hiệu */}
        <div className="flex items-center justify-between mb-6 px-2 pt-2 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-base shadow">
              🏢
            </div>
            <div>
              <div className="text-base font-black text-white tracking-wider">BQL CHUNG CƯ</div>
              <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-widest">
                Cổng vận hành
              </div>
            </div>
          </div>

          {/* Nút đóng trên mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Đóng thanh điều hướng"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Danh sách mục điều hướng */}
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
          Danh mục chức năng
        </div>
        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          {accessibleMenu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-all min-h-[44px] select-none ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="truncate">{item.title}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer Sidebar: Thông tin phiên làm việc */}
        <div className="mt-auto pt-4 border-t border-slate-800 px-2 text-xs text-slate-400">
          <div className="font-semibold text-slate-300 truncate">{user?.fullName || user?.username}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Vai trò: {userRole}</div>
        </div>
      </aside>
    </>
  );
};
