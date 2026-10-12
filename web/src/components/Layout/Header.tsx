import React from 'react';

export const Header: React.FC = () => {
  return (
    <header style={{ height: '60px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
      <span style={{ fontWeight: 'bold', color: '#334155' }}>Hệ Thống Điều Hành & Vận Hành Tòa Nhà</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '14px', color: '#64748b' }}>Xin chào, Quản trị viên</span>
      </div>
    </header>
  );
};
