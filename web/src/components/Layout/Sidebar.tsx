import React from 'react';
import { NavLink } from 'react-router-dom';
import { MENU_ITEMS } from '../../constants/menu';

export const Sidebar: React.FC = () => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role || '';

  const accessibleMenu = MENU_ITEMS.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 min-h-screen flex flex-col p-4 shrink-0">
      <div className="text-xl font-black mb-8 px-2 text-indigo-400 tracking-wider">
        BQL CHUNG CƯ
      </div>
      <nav className="flex-1 space-y-1">
        {accessibleMenu.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {item.title}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};