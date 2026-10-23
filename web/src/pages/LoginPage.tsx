import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res: any = await axiosClient.post(API_ENDPOINTS.AUTH.LOGIN, {
        username,
        password,
      });

      localStorage.setItem('token', res.token || res.accessToken);
      localStorage.setItem('user', JSON.stringify(res.user));

      if (res.user?.role === 'ADMIN') {
        navigate('/admin/accounts');
      } else if (res.user?.role === 'TECHNICIAN') {
        navigate('/technician/tasks');
      } else {
        navigate('/residents');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Tài khoản hoặc mật khẩu không chính xác');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border">
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">
          Đăng Nhập Quản Trị
        </h2>
        {errorMsg && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
            {errorMsg}
          </div>
        )}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tài khoản
            </label>
            <input
              type="text"
              required
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition"
          >
            {loading ? 'Đang xác thực...' : 'Đăng Nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};