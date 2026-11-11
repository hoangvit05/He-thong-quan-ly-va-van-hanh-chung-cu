// =========================================================================
// TIỆN ÍCH BĂM MẬT KHẨU DATASET (PASSWORD HASH UTILITY)
// Sử dụng bcryptjs đồng bộ với cơ chế xác thực của Backend Auth Module
// =========================================================================

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Mật khẩu giả lập mặc định cho môi trường demo / testing
 * TUYỆT ĐỐI KHÔNG SỬ DỤNG TRÊN MÔI TRƯỜNG PRODUCTION!
 */
export const DEFAULT_DEMO_PASSWORD = 'Password123!';

/**
 * Băm mật khẩu bằng thuật toán Bcrypt ($2a$ hoặc $2b$)
 */
export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plainText, salt);
}

/**
 * Băm mật khẩu đồng bộ (Synchronous hash - hữu ích khi chuẩn bị dataset lớn)
 */
export function hashPasswordSync(plainText: string): string {
  const salt = bcrypt.genSaltSync(SALT_ROUNDS);
  return bcrypt.hashSync(plainText, salt);
}

/**
 * Xác minh mật khẩu đồng bộ qua bcryptjs
 */
export function verifyPasswordSync(plainText: string, hash: string): boolean {
  return bcrypt.compareSync(plainText, hash);
}

/**
 * Xác minh mật khẩu bất đồng bộ qua bcryptjs
 */
export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

