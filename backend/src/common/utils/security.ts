// =========================================================================
// TIỆN ÍCH BẢO MẬT MẬT KHẨU (PASSWORD HASHING & SECURITY)
// Cung cấp cho Module Auth của Đặng Hoàng sử dụng để tránh bẫy Plain-text Password
// =========================================================================

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Băm mật khẩu dạng rõ thành chuỗi mã hóa an toàn trước khi lưu vào Database
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (!plainText || typeof plainText !== 'string') {
    throw new Error('Mật khẩu không hợp lệ.');
  }
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

/**
 * So sánh mật khẩu người dùng nhập vào với chuỗi hash trong Database
 */
export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  return bcrypt.compare(plainText, hash);
}
