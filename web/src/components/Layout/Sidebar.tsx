import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MENU_ITEMS } from '../../constants/menu';

export const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <aside style={{ width: '260px', backgroundColor: '#1e293b', color: '#fff', padding: '20px' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '24px', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
        🏢 Quản Lý Chung Cư
      </h2>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {MENU_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                color: isActive ? '#38bdf8' : '#94a3b8',
                backgroundColor: isActive ? '#0f172a' : 'transparent',
                padding: '10px 14px',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: isActive ? 'bold' : 'normal',
              }}
            >
              {item.title}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
