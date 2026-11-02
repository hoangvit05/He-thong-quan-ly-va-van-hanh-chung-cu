// ===================================================
// ADMIN PAGINATION & ENVELOPE VALIDATION UTILITY
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

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
  room?: {
    id: number;
    roomNumber: string;
    floor: number;
  } | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const VALID_STAFF_ROLES: AppRole[] = ['ADMIN', 'BQL', 'TECHNICIAN'];

/**
 * Trích xuất an toàn dữ liệu response envelope của Backend (hỗ trợ dual-layer unwrapping:
 * vừa chấp nhận raw JSON body { success, data, pagination }, vừa chấp nhận AxiosResponse { data: envelope }).
 */
export function extractAdminApiEnvelope<T = unknown>(response: unknown): {
  success: boolean;
  data: T | null;
  pagination?: PaginationMeta;
  message?: string;
} | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const obj = response as Record<string, unknown>;

  // Kiểm tra trường hợp đối tượng đã là envelope chuẩn
  if ('success' in obj && 'data' in obj) {
    return {
      success: Boolean(obj.success),
      data: obj.data as T,
      pagination: obj.pagination as PaginationMeta | undefined,
      message: typeof obj.message === 'string' ? obj.message : undefined,
    };
  }

  // Kiểm tra trường hợp đối tượng là AxiosResponse ({ data: envelope })
  if ('data' in obj && obj.data && typeof obj.data === 'object') {
    const inner = obj.data as Record<string, unknown>;
    if ('success' in inner && 'data' in inner) {
      return {
        success: Boolean(inner.success),
        data: inner.data as T,
        pagination: inner.pagination as PaginationMeta | undefined,
        message: typeof inner.message === 'string' ? inner.message : undefined,
      };
    }
  }

  return null;
}

/**
 * Kiểm tra nghiêm ngặt tính hợp lệ của từng bản ghi StaffAccount
 */
export function validateStaffAccountItem(raw: unknown): StaffAccount | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;

  if (typeof item.id !== 'number' || isNaN(item.id) || item.id <= 0) {
    return null;
  }

  if (typeof item.username !== 'string' || item.username.trim() === '') {
    return null;
  }

  if (typeof item.fullName !== 'string' || item.fullName.trim() === '') {
    return null;
  }

  if (typeof item.role !== 'string' || !VALID_STAFF_ROLES.includes(item.role as AppRole)) {
    return null;
  }

  return {
    id: item.id,
    username: item.username.trim(),
    fullName: item.fullName.trim(),
    phone: typeof item.phone === 'string' ? item.phone : null,
    email: typeof item.email === 'string' ? item.email : null,
    role: item.role as AppRole,
    roomId: typeof item.roomId === 'number' ? item.roomId : null,
    isApproved: Boolean(item.isApproved),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
    room: item.room && typeof item.room === 'object' ? (item.room as StaffAccount['room']) : null,
  };
}

export type AdminUsersValidationResult =
  | {
      isValid: true;
      users: StaffAccount[];
      pagination: PaginationMeta;
    }
  | {
      isValid: false;
      error: string;
      users: StaffAccount[];
      pagination: PaginationMeta;
    };

/**
 * Xác thực response danh sách tài khoản GET /api/admin/users
 */
export function validateAdminUsersResponse(
  rawRes: unknown,
  requestedPage = 1,
  requestedLimit = 10
): AdminUsersValidationResult {
  const defaultPagination: PaginationMeta = {
    page: requestedPage,
    limit: requestedLimit,
    total: 0,
    totalPages: 1,
  };

  const envelope = extractAdminApiEnvelope<unknown[]>(rawRes);

  if (!envelope) {
    return {
      isValid: false,
      error: 'Phản hồi từ máy chủ không đúng định dạng phong bì tiêu chuẩn (ApiEnvelope).',
      users: [],
      pagination: defaultPagination,
    };
  }

  if (!envelope.success) {
    return {
      isValid: false,
      error: envelope.message || 'Máy chủ trả về phản hồi không thành công (success = false).',
      users: [],
      pagination: defaultPagination,
    };
  }

  if (!Array.isArray(envelope.data)) {
    return {
      isValid: false,
      error: 'Trường data trong phản hồi danh sách tài khoản không phải là mảng.',
      users: [],
      pagination: defaultPagination,
    };
  }

  const validUsers: StaffAccount[] = [];
  for (const rawItem of envelope.data) {
    const validated = validateStaffAccountItem(rawItem);
    if (validated) {
      validUsers.push(validated);
    }
  }

  let pagination: PaginationMeta = defaultPagination;
  if (envelope.pagination && typeof envelope.pagination === 'object') {
    const p = envelope.pagination;
    const page = typeof p.page === 'number' && p.page > 0 ? p.page : requestedPage;
    const limit = typeof p.limit === 'number' && p.limit > 0 ? p.limit : requestedLimit;
    const total = typeof p.total === 'number' && p.total >= 0 ? p.total : validUsers.length;
    const totalPages =
      typeof p.totalPages === 'number' && p.totalPages > 0
        ? p.totalPages
        : Math.ceil(total / limit) || 1;

    pagination = { page, limit, total, totalPages };
  } else {
    pagination = {
      page: requestedPage,
      limit: requestedLimit,
      total: validUsers.length,
      totalPages: Math.ceil(validUsers.length / requestedLimit) || 1,
    };
  }

  return {
    isValid: true,
    users: validUsers,
    pagination,
  };
}

/**
 * Tính toán khả năng hồi phục số trang khi người dùng ở trang vượt quá tổng số trang
 * (ví dụ: đang ở trang 3 thì dữ liệu bị xóa hết chỉ còn 2 trang).
 */
export function calculatePageRecovery(
  currentPage: number,
  totalPages: number,
  totalRecords: number,
  isRecovery = false
): {
  shouldRecover: boolean;
  targetPage: number;
  reason?: string;
} {
  if (totalRecords === 0) {
    return { shouldRecover: false, targetPage: 1 };
  }

  if (currentPage > totalPages && totalPages > 0) {
    if (isRecovery) {
      return {
        shouldRecover: false,
        targetPage: totalPages,
        reason: 'Overshoot persists after recovery attempt. Halting loop.',
      };
    }
    return {
      shouldRecover: true,
      targetPage: totalPages,
      reason: `Current page ${currentPage} exceeds totalPages ${totalPages}. Recovering to page ${totalPages}.`,
    };
  }

  return { shouldRecover: false, targetPage: currentPage };
}
