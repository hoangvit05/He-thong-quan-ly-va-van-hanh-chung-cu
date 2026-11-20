import axios from 'axios';

export interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}
export interface Resident {
  id: number; username: string; fullName: string; email: string | null; phone: string | null;
  role: string; isApproved: boolean; roomId: number | null;
  room?: { id: number; roomNumber: string; floor: number; area: string | number; status: string } | null;
}
export interface Invoice {
  id: number; month: string; managementFee: string | number; parkingFee: string | number;
  waterFee: string | number; otherFee: string | number; totalAmount: string | number;
  paidAmount: string | number; status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'; dueDate: string | null;
  payments: { id: number; amount: string | number; paidAt: string; paymentMethod: string }[];
}
export interface VietQr {
  invoiceId: number; paidAmount: string | number; remainingAmount: string | number; isFullyPaid: boolean; vietQrUrl: string | null;
}
export interface Notice {
  id: number; title: string; content: string; targetRoom: string | null; createdAt: string;
  author?: { fullName: string } | null;
}
export function unwrap<T>(body: Envelope<T>): T {
  if (!body || body.success !== true) throw new Error(body?.message || 'Máy chủ trả về dữ liệu không hợp lệ.');
  return body.data;
}
export function assertResident(user: Resident) {
  if (!user || user.role !== 'RESIDENT') throw new Error('Ứng dụng này dành cho tài khoản cư dân.');
  if (!user.isApproved) throw new Error('Tài khoản đang chờ Ban quản lý phê duyệt.');
}
export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message) return message;
    if (error.code === 'ECONNABORTED') return 'Kết nối quá thời gian chờ. Vui lòng thử lại.';
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    return 'Không thực hiện được yêu cầu. Vui lòng thử lại.';
  }
  return error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.';
}
export function validatePassword(current: string, next: string, confirm: string): string | null {
  if (!current) return 'Nhập mật khẩu hiện tại.';
  if (next.length < 6 || next.length > 100) return 'Mật khẩu mới phải có từ 6 đến 100 ký tự.';
  if (next === current) return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
  if (next !== confirm) return 'Xác nhận mật khẩu không khớp.';
  return null;
}
export function validMonth(value: string) { return value === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ₫' : '—';
}
export function dateLabel(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('vi-VN');
}
export function safeQrUrl(value: string | null) {
  // Only render the HTTPS image URL; never execute/open a server-supplied scheme.
  return typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value) ? value : null;
}
export const invoiceStatus = { UNPAID: 'Chưa thanh toán', PARTIALLY_PAID: 'Thanh toán một phần', PAID: 'Đã thanh toán' };
