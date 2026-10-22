import { Role } from '@prisma/client';

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  parsed?: T;
}

export interface AdminUsersQuery {
  role?: Role;
  page: number;
  limit: number;
  search?: string;
}

export interface CreateStaffInput {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  phone?: string | null;
  email?: string | null;
}

export interface ResidentsQuery {
  roomId?: number;
  isApproved?: boolean;
  page: number;
  limit: number;
  search?: string;
}

const ALLOWED_STAFF_ROLES: Role[] = [Role.BQL, Role.TECHNICIAN];

/**
 * Validate query params cho API GET /api/admin/users
 */
export function validateAdminUsersQuery(query: any): ValidationResult<AdminUsersQuery> {
  const errors: string[] = [];
  const q = query || {};

  let role: Role | undefined;
  if (q.role !== undefined && q.role !== '') {
    const roleStr = String(q.role).toUpperCase();
    if (Object.values(Role).includes(roleStr as Role)) {
      role = roleStr as Role;
    } else {
      errors.push(`Tham số 'role' không hợp lệ. Các giá trị hợp lệ: ${Object.values(Role).join(', ')}.`);
    }
  }

  let page = 1;
  if (q.page !== undefined && q.page !== '') {
    const parsedPage = Number(q.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      errors.push("Tham số 'page' phải là số nguyên dương lớn hơn hoặc bằng 1.");
    } else {
      page = parsedPage;
    }
  }

  let limit = 20;
  if (q.limit !== undefined && q.limit !== '') {
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push("Tham số 'limit' phải là số nguyên từ 1 đến 100.");
    } else {
      limit = parsedLimit;
    }
  }

  const search = typeof q.search === 'string' && q.search.trim() ? q.search.trim() : undefined;

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: { role, page, limit, search },
  };
}

/**
 * Validate dữ liệu đầu vào cho API POST /api/admin/users
 */
export function validateCreateStaffInput(body: any): ValidationResult<CreateStaffInput> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: ['Dữ liệu gửi lên không hợp lệ (yêu cầu JSON object).'],
    };
  }

  // 1. Username
  if (!body.username || typeof body.username !== 'string' || !body.username.trim()) {
    errors.push('Tên đăng nhập (username) là bắt buộc.');
  } else {
    const trimmedUsername = body.username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
      errors.push('Tên đăng nhập phải có độ dài từ 3 đến 50 ký tự.');
    } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      errors.push('Tên đăng nhập chỉ được chứa các ký tự chữ cái, số và dấu gạch dưới (_).');
    }
  }

  // 2. Password
  if (!body.password || typeof body.password !== 'string') {
    errors.push('Mật khẩu là bắt buộc.');
  } else if (body.password.length < 6) {
    errors.push('Mật khẩu phải có độ dài tối thiểu 6 ký tự.');
  }

  // 3. FullName
  if (!body.fullName || typeof body.fullName !== 'string' || !body.fullName.trim()) {
    errors.push('Họ và tên (fullName) là bắt buộc.');
  } else {
    const trimmedFullName = body.fullName.trim();
    if (trimmedFullName.length < 2 || trimmedFullName.length > 100) {
      errors.push('Họ và tên phải có độ dài từ 2 đến 100 ký tự.');
    }
  }

  // 4. Role - Chỉ cho phép BQL hoặc TECHNICIAN
  if (!body.role) {
    errors.push(`Vai trò (role) là bắt buộc. Chỉ cho phép: ${ALLOWED_STAFF_ROLES.join(', ')}.`);
  } else {
    const roleStr = String(body.role).toUpperCase();
    if (!ALLOWED_STAFF_ROLES.includes(roleStr as Role)) {
      errors.push(`Vai trò '${body.role}' không được phép tạo qua API này. Chỉ cho phép tạo: ${ALLOWED_STAFF_ROLES.join(', ')}.`);
    }
  }

  // 5. Phone (optional)
  let phone: string | null = null;
  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    if (typeof body.phone !== 'string') {
      errors.push('Số điện thoại phải là chuỗi ký tự.');
    } else {
      const trimmedPhone = body.phone.trim();
      if (!/^[0-9+\s\-]{8,20}$/.test(trimmedPhone)) {
        errors.push('Số điện thoại không hợp lệ (yêu cầu từ 8 đến 20 ký tự số).');
      } else {
        phone = trimmedPhone;
      }
    }
  }

  // 6. Email (optional)
  let email: string | null = null;
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    if (typeof body.email !== 'string') {
      errors.push('Email phải là chuỗi ký tự.');
    } else {
      const trimmedEmail = body.email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        errors.push('Định dạng email không hợp lệ.');
      } else {
        email = trimmedEmail;
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      username: body.username.trim(),
      password: body.password,
      fullName: body.fullName.trim(),
      role: String(body.role).toUpperCase() as Role,
      phone,
      email,
    },
  };
}

/**
 * Validate query params cho API GET /api/apartments/residents
 */
export function validateResidentsQuery(query: any): ValidationResult<ResidentsQuery> {
  const errors: string[] = [];
  const q = query || {};

  let roomId: number | undefined;
  if (q.roomId !== undefined && q.roomId !== '') {
    const parsedRoomId = Number(q.roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
      errors.push("Tham số 'roomId' phải là số nguyên dương.");
    } else {
      roomId = parsedRoomId;
    }
  }

  let isApproved: boolean | undefined;
  if (q.isApproved !== undefined && q.isApproved !== '') {
    const val = String(q.isApproved).toLowerCase().trim();
    if (val === 'true') {
      isApproved = true;
    } else if (val === 'false') {
      isApproved = false;
    } else {
      errors.push("Tham số 'isApproved' phải là giá trị boolean ('true' hoặc 'false').");
    }
  }

  let page = 1;
  if (q.page !== undefined && q.page !== '') {
    const parsedPage = Number(q.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      errors.push("Tham số 'page' phải là số nguyên dương lớn hơn hoặc bằng 1.");
    } else {
      page = parsedPage;
    }
  }

  let limit = 20;
  if (q.limit !== undefined && q.limit !== '') {
    const parsedLimit = Number(q.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      errors.push("Tham số 'limit' phải là số nguyên từ 1 đến 100.");
    } else {
      limit = parsedLimit;
    }
  }

  const search = typeof q.search === 'string' && q.search.trim() ? q.search.trim() : undefined;

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: { roomId, isApproved, page, limit, search },
  };
}

/**
 * Validate param id cho API duyệt cư dân
 */
export function validateUserIdParam(paramId: any): { isValid: boolean; userId?: number; error?: string } {
  if (paramId === undefined || paramId === null || paramId === '') {
    return { isValid: false, error: 'Mã định danh người dùng (id) là bắt buộc.' };
  }

  const id = Number(paramId);
  if (!Number.isInteger(id) || id <= 0) {
    return { isValid: false, error: 'Mã định danh người dùng (id) phải là số nguyên dương.' };
  }

  return { isValid: true, userId: id };
}

/**
 * Validate input cho API gán phòng cư dân (PUT /api/apartments/residents/:id/room)
 */
export function validateAssignRoomInput(body: any): {
  isValid: boolean;
  roomId?: number;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Dữ liệu gán căn hộ không hợp lệ (body rỗng).' };
  }

  const { roomId } = body;
  if (roomId === undefined || roomId === null || roomId === '') {
    return { isValid: false, error: 'Mã căn hộ (roomId) là bắt buộc.' };
  }

  const parsedRoomId = Number(roomId);
  if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
    return { isValid: false, error: 'Mã căn hộ (roomId) phải là số nguyên dương hợp lệ.' };
  }

  return {
    isValid: true,
    roomId: parsedRoomId,
  };
}
