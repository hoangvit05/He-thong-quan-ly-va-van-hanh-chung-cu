// =========================================================================
// TIỆN ÍCH KIỂM TRA HỢP LỆ VÀ XÁC THỰC DỮ LIỆU ĐẦU VÀO PHÂN HỆ AUTH
// Phụ trách: Đặng Hoàng (Leader) & Hiếu
// Chức năng: Kiểm tra dữ liệu đăng nhập, đổi mật khẩu, chính sách mật khẩu an toàn
// =========================================================================

export interface ValidationResult<T = any> {
  isValid: boolean;
  errors: string[];
  parsed?: T;
}

export interface LoginParsedInput {
  identifier: string;
  password: string;
}

export interface ChangePasswordParsedInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}

/**
 * Kiểm tra định dạng dữ liệu đầu vào cho yêu cầu đăng nhập (POST /api/auth/login)
 */
export function validateLoginInput(data: any): ValidationResult<LoginParsedInput> {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Dữ liệu yêu cầu đăng nhập không đúng định dạng JSON.'] };
  }

  // Chấp nhận định danh theo identifier, username, email hoặc phone
  const rawIdentifier = data.identifier || data.username || data.email || data.phone;
  if (!rawIdentifier || typeof rawIdentifier !== 'string' || !rawIdentifier.trim()) {
    errors.push('Vui lòng cung cấp tên đăng nhập, email hoặc số điện thoại.');
  } else if (rawIdentifier.trim().length > 100) {
    errors.push('Tên đăng nhập / định danh không được vượt quá 100 ký tự.');
  }

  const rawPassword = data.password;
  if (!rawPassword || typeof rawPassword !== 'string') {
    errors.push('Vui lòng cung cấp mật khẩu.');
  } else if (rawPassword.length > 100) {
    errors.push('Mật khẩu không được vượt quá 100 ký tự.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      identifier: String(rawIdentifier).trim(),
      password: String(rawPassword),
    },
  };
}

/**
 * Kiểm tra dữ liệu đầu vào và chính sách mật khẩu cho yêu cầu đổi mật khẩu (POST /api/auth/change-password)
 */
export function validateChangePasswordInput(data: any): ValidationResult<ChangePasswordParsedInput> {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Dữ liệu yêu cầu đổi mật khẩu không đúng định dạng JSON.'] };
  }

  const currentPassword = data.currentPassword;
  if (!currentPassword || typeof currentPassword !== 'string') {
    errors.push('Vui lòng cung cấp mật khẩu hiện tại.');
  }

  const newPassword = data.newPassword;
  if (!newPassword || typeof newPassword !== 'string') {
    errors.push('Vui lòng cung cấp mật khẩu mới.');
  } else {
    if (newPassword.length < 6) {
      errors.push('Mật khẩu mới phải có độ dài tối thiểu 6 ký tự.');
    }
    if (newPassword.length > 100) {
      errors.push('Mật khẩu mới không được vượt quá 100 ký tự.');
    }
  }

  // Kiểm tra xác nhận mật khẩu nếu client truyền lên
  if (data.confirmPassword !== undefined && data.confirmPassword !== null) {
    if (data.confirmPassword !== newPassword) {
      errors.push('Xác nhận mật khẩu mới không khớp.');
    }
  }

  // Không cho phép mật khẩu mới trùng mật khẩu hiện tại
  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.push('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      currentPassword: String(currentPassword),
      newPassword: String(newPassword),
      confirmPassword: data.confirmPassword ? String(data.confirmPassword) : undefined,
    },
  };
}
