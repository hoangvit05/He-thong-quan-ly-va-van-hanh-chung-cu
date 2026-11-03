import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStoredUser, clearAuthSession } from '../utils/auth';

interface UnauthorizedPageProps {
  requiredRoles?: string[];
}

export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({ requiredRoles }) => {
  const navigate = useNavigate();
  const user = getStoredUser();
  const userRole = user?.role || 'GUEST';

  const handleGoHome = () => {
    switch (userRole) {
      case 'ADMIN':
        navigate('/admin/accounts');
        break;
      case 'BQL':
        navigate('/residents');
        break;
      case 'TECHNICIAN':
        navigate('/technician/tasks');
        break;
      default:
        clearAuthSession();
        navigate('/login');
        break;
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate('/login');
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-xl shadow-sm p-6 text-center space-y-4">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
          403
        </div>
        <h2 className="text-xl font-bold text-gray-800">
          Từ Chối Truy Cập (Forbidden)
        </h2>

        {userRole === 'RESIDENT' ? (
          <p className="text-sm text-gray-600">
            Tài khoản của bạn có vai trò <b>Cư dân (RESIDENT)</b>. Cổng thông tin Web chỉ dành cho Quản trị viên, Ban quản lý và Thợ kỹ thuật. Vui lòng sử dụng <b>Ứng dụng di động</b> dành cho Cư dân.
          </p>
        ) : (
          <p className="text-sm text-gray-600">
            Vai trò hiện tại của bạn là <b>[{userRole}]</b>. Bạn không có quyền truy cập vào phân hệ này.
            {requiredRoles && requiredRoles.length > 0 && (
              <span className="block mt-1 text-xs text-gray-500">
                Quyền hạn yêu cầu: <b>{requiredRoles.join(', ')}</b>
              </span>
            )}
          </p>
        )}

        <div className="pt-2 flex justify-center gap-3">
          {userRole !== 'RESIDENT' && (
            <button
              onClick={handleGoHome}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition"
            >
              Về trang làm việc
            </button>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
};
