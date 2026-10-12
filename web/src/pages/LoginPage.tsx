// ===================================================
// TRANG ĐĂNG NHẬP DÙNG CHUNG
// Phụ trách: Đặng Hoàng
// ===================================================
import React from 'react';

export const LoginPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f1f5f9' }}>
      <div style={{ background: '#fff', padding: '32px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '360px' }}>
        <h2>Đăng Nhập Quản Trị</h2>
        <p style={{ color: '#64748b', fontSize: '14px' }}>Dành cho Admin, BQL và Thợ kỹ thuật</p>
        {/* TODO (Hoàng): Viết Form đăng nhập và gọi API_ENDPOINTS.AUTH.LOGIN */}
      </div>
    </div>
  );
};
