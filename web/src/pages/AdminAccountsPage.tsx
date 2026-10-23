import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';

export const AdminAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'MANAGER' | 'TECHNICIAN'>('MANAGER');
  const [loading, setLoading] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res: any = await axiosClient.get(API_ENDPOINTS.AUTH.ADMIN_USERS);
      setAccounts(res.data || res || []);
    } catch (e) {
      console.error('Không tải được danh sách tài khoản:', e);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axiosClient.post(API_ENDPOINTS.AUTH.ADMIN_USERS, {
        username,
        password,
        fullName,
        role,
      });
      alert('Tạo tài khoản thành công!');
      setUsername('');
      setPassword('');
      setFullName('');
      fetchAccounts();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tạo tài khoản');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">
        Quản Lý Tài Khoản Ban Quản Lý & Kỹ Thuật Viên
      </h1>

      <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg border shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Họ và tên</label>
          <input
            type="text"
            required
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Tên đăng nhập</label>
          <input
            type="text"
            required
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Mật khẩu</label>
          <input
            type="password"
            required
            className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">Vai trò</label>
          <select
            className="w-full border rounded px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-500"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="MANAGER">Ban Quản Lý (MANAGER)</option>
            <option value="TECHNICIAN">Thợ Kỹ Thuật (TECHNICIAN)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-indigo-700 transition"
          >
            {loading ? 'Đang tạo...' : '+ Tạo tài khoản'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-100 text-xs uppercase font-bold text-gray-700">
            <tr>
              <th className="p-3">Họ và tên</th>
              <th className="p-3">Username</th>
              <th className="p-3">Vai trò</th>
              <th className="p-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length > 0 ? (
              accounts.map((acc, index) => (
                <tr key={acc.id || index} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-900">{acc.fullName}</td>
                  <td className="p-3">{acc.username}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 text-xs rounded font-semibold bg-blue-100 text-blue-800">
                      {acc.role}
                    </span>
                  </td>
                  <td className="p-3 text-green-600 font-semibold">Hoạt động</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">
                  Chưa có tài khoản nào được tạo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};