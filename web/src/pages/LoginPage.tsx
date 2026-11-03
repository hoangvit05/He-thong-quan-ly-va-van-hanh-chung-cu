import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { setAuthSession, clearAuthSession, getRootRedirectPath, ApiEnvelope, LoginResponseData } from '../utils/auth';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg('Vui lòng nhập tên đăng nhập, email hoặc số điện thoại.');
      return;
    }

    if (!password) {
      setErrorMsg('Vui lòng nhập mật khẩu.');
      return;
    }

    if (cleanUsername.length > 100) {
      setErrorMsg('Tên đăng nhập không được vượt quá 100 ký tự.');
      return;
    }

    if (password.length > 100) {
      setErrorMsg('Mật khẩu không được vượt quá 100 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const res = (await axiosClient.post(API_ENDPOINTS.AUTH.LOGIN, {
        username: cleanUsername,
        password,
      })) as unknown as ApiEnvelope<LoginResponseData> | { token?: string; user?: LoginResponseData['user'] };

      // 1. Trích xuất đúng token và user theo Backend response envelope: { success: true, data: { token, user }, message }
      const envelopeData = (res as ApiEnvelope<LoginResponseData>)?.data;
      const token = envelopeData?.token || (res as { token?: string })?.token;
      const user = envelopeData?.user || (res as { user?: LoginResponseData['user'] })?.user;

      // 4. Nếu response thiếu token hoặc user, phải báo lỗi và không điều hướng
      if (!token || typeof token !== 'string' || !user || typeof user !== 'object' || !user.role) {
        clearAuthSession();
        setErrorMsg('Phản hồi từ máy chủ không hợp lệ: Thiếu token xác thực hoặc dữ liệu người dùng.');
        return;
      }

      // 9. Cư dân không được chuyển vào trang quản trị BQL
      if (user.role === 'RESIDENT') {
        clearAuthSession();
        setErrorMsg(
          'Tài khoản Cư dân (RESIDENT) không có quyền truy cập Cổng quản trị Web. Vui lòng đăng nhập trên Ứng dụng di động dành cho Cư dân.'
        );
        return;
      }

      // 2 & 3. Lưu phiên đăng nhập an toàn, tuyệt đối không bao giờ lưu 'undefined'
      const sessionSaved = setAuthSession(token, user);
      if (!sessionSaved) {
        clearAuthSession();
        setErrorMsg('Không thể khởi tạo phiên đăng nhập an toàn. Vui lòng thử lại.');
        return;
      }

      // 5, 6, 7, 8. Kiểm tra role và điều hướng đúng phân hệ qua helper getRootRedirectPath
      const targetPath = getRootRedirectPath(user.role);
      if (targetPath === '/login') {
        clearAuthSession();
        setErrorMsg(`Vai trò người dùng [${user.role}] không được hỗ trợ trên cổng quản trị.`);
        return;
      }
      navigate(targetPath);
    } catch (err: unknown) {
      // 10. Xử lý đúng các mã lỗi 400 (validation), 401 (sai pass), 403 (chưa duyệt), 429 (rate-limit), 500 (máy chủ)
      const errObj = err as { message?: string; data?: { message?: string }; raw?: { message?: string } };
      const message =
        errObj?.message ||
        errObj?.data?.message ||
        errObj?.raw?.message ||
        (typeof err === 'string' ? err : 'Tài khoản hoặc mật khẩu không chính xác.');
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border">
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">
          Đăng Nhập Cổng Quản Trị
        </h2>
        {errorMsg && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            {errorMsg}
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tài khoản / Email / Số điện thoại
            </label>
            <input
              type="text"
              required
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập, email hoặc SĐT"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition disabled:bg-indigo-400"
          >
            {loading ? 'Đang xác thực...' : 'Đăng Nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};
