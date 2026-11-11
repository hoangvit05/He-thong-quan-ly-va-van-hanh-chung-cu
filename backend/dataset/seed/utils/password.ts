// =========================================================================
// TIỆN ÍCH BĂM MẬT KHẨU DATASET (PASSWORD HASH UTILITY)
// Sử dụng bcryptjs đồng bộ với cơ chế xác thực của Backend Auth Module
// =========================================================================

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

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

