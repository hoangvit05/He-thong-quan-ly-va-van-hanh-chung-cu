import React, { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import { API_ENDPOINTS } from '../api/endpoints';
import { getStoredUser, ApiEnvelope } from '../utils/auth';
import { AppRole } from '../constants/menu';

export interface StaffAccount {
  id: number;
  username: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  role: AppRole;
  roomId?: number | null;
  isApproved: boolean;
  createdAt?: string;
}

export const AdminAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'BQL' | 'TECHNICIAN'>('BQL');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [createMsg, setCreateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentUser = getStoredUser();
  const isAdmin = currentUser?.role === 'ADMIN';

  const fetchAccounts = async () => {
    setFetchError('');
    try {
      const res = (await axiosClient.get(API_ENDPOINTS.AUTH.ADMIN_USERS)) as unknown as ApiEnvelope<StaffAccount[]> | StaffAccount[];
      // Backend envelope: { success: true, data: [...], pagination: {...} }
      const envelopeData = (res as ApiEnvelope<StaffAccount[]>)?.data;
      const list: StaffAccount[] = Array.isArray(envelopeData)
        ? envelopeData
        : Array.isArray(res)
        ? (res as StaffAccount[])
        : [];
      setAccounts(list);
    } catch (e: unknown) {
      const errObj = e as { message?: string };
      console.error('Không tải được danh sách tài khoản:', e);
      setFetchError(errObj?.message || 'Không thể tải danh sách tài khoản từ máy chủ.');
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMsg(null);

    if (!isAdmin) {
      setCreateMsg({
        type: 'error',
        text: 'Chỉ Quản trị viên (ADMIN) mới có quyền tạo tài khoản nhân viên BQL và Thợ kỹ thuật.',
      });
      return;
    }

    if (username.trim().length < 3) {
      setCreateMsg({ type: 'error', text: 'Tên đăng nhập phải có ít nhất 3 ký tự.' });
      return;
    }

    if (password.length < 6) {
      setCreateMsg({ type: 'error', text: 'Mật khẩu phải có độ dài tối thiểu 6 ký tự.' });
      return;
    }

    if (fullName.trim().length < 2) {
      setCreateMsg({ type: 'error', text: 'Họ và tên phải có ít nhất 2 ký tự.' });
      return;
    }

    setLoading(true);
    try {
      // Backend POST /api/admin/users payload: { username, password, fullName, role }
      await axiosClient.post(API_ENDPOINTS.AUTH.ADMIN_USERS, {
        username: username.trim(),
        password,
        fullName: fullName.trim(),
        role,
      });

      setCreateMsg({ type: 'success', text: `Tạo tài khoản ${role} thành công!` });
      setUsername('');
      setPassword('');
      setFullName('');
      setRole('BQL');
      fetchAccounts();
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setCreateMsg({
        type: 'error',
        text: errObj?.message || 'Lỗi khi tạo tài khoản nhân viên.',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderRoleBadge = (accountRole: AppRole | string) => {
    switch (accountRole) {
      case 'ADMIN':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-purple-100 text-purple-800">
            Quản trị viên (ADMIN)
          </span>
        );
      case 'BQL':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-indigo-100 text-indigo-800">
            Ban Quản Lý (BQL)
          </span>
        );
      case 'TECHNICIAN':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-emerald-100 text-emerald-800">
            Thợ Kỹ Thuật (TECHNICIAN)
          </span>
        );
      case 'RESIDENT':
        return (
          <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-slate-100 text-slate-800">
            Cư Dân (RESIDENT)
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-gray-100 text-gray-800">
            {accountRole}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">
          Quản Lý Tài Khoản Ban Quản Lý & Thợ Kỹ Thuật
        </h1>
        <button
          onClick={fetchAccounts}
          className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded transition"
        >
          Làm mới
        </button>
      </div>

      {fetchError && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
          {fetchError}
        </div>
      )}

      {/* Form tạo tài khoản: Chỉ hiển thị và cho phép ADMIN sử dụng */}
      {isAdmin ? (
        <form
          onSubmit={handleCreate}
          className="bg-white p-6 rounded-lg border shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="md:col-span-2">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
              Tạo tài khoản nhân viên mới
            </h2>
            {createMsg && (
              <div
                className={`mt-2 text-sm p-3 rounded border ${
                  createMsg.type === 'success'
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}
              >
                {createMsg.text}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Họ và tên
            </label>
            <input
              type="text"
              required
              className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="VD: Nguyễn Văn A"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Tên đăng nhập
            </label>
            <input
              type="text"
              required
              className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Chữ cái, số và dấu gạch dưới"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Mật khẩu (tối thiểu 6 ký tự)
            </label>
            <input
              type="password"
              required
              className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Vai trò (Role)
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-indigo-500"
              value={role}
              onChange={(e) => setRole(e.target.value as 'BQL' | 'TECHNICIAN')}
            >
              <option value="BQL">Ban Quản Lý (BQL)</option>
              <option value="TECHNICIAN">Thợ Kỹ Thuật (TECHNICIAN)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 text-white px-5 py-2 rounded text-sm font-semibold hover:bg-indigo-700 transition disabled:bg-indigo-400"
            >
              {loading ? 'Đang tạo...' : '+ Tạo tài khoản nhân viên'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-lg">
          Tài khoản hiện tại không có quyền quản trị viên cao nhất (ADMIN). Chỉ ADMIN mới có thể tạo thêm tài khoản BQL hoặc Thợ kỹ thuật.
        </div>
      )}

      {/* Danh sách tài khoản nhân sự */}
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
                  <td className="p-3">{renderRoleBadge(acc.role)}</td>
                  <td className="p-3">
                    <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded">
                      {acc.isApproved !== false ? 'Hoạt động' : 'Chờ duyệt'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-400">
                  Chưa có tài khoản nào được tạo hoặc không có quyền truy vấn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
