// ===================================================
// ADMIN PAGINATION & ENVELOPE VALIDATION UTILITY
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

import type { AppRole } from '../constants/menu.ts';

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

export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 2;

export interface PageRecoveryResult {
  shouldRecover: boolean;
  targetPage: number;
  reason?: string;
  attemptsExceeded: boolean;
}

export interface PaginatedFlowResult {
  success: boolean;
  users: StaffAccount[];
  pagination: PaginationMeta;
  error?: string;
  requestsCount: number;
}

/**
 * Tính toán khả năng hồi phục số trang khi người dùng ở trang vượt quá tổng số trang
 * (ví dụ: đang ở trang 3 thì dữ liệu bị xóa bớt chỉ còn 2 trang hoặc bị xóa sạch).
 *
 * Hỗ trợ kiểm soát số lần thử phục hồi tối đa (maxAttempts) để ngăn chặn vòng lặp vô hạn
 * ngay cả khi dữ liệu liên tục thay đổi hoặc khi totalRecords === 0.
 */
export function calculatePageRecovery(
  currentPage: number,
  totalPages: number,
  totalRecords: number,
  isRecovery: boolean | number = false,
  maxAttempts: number = DEFAULT_MAX_RECOVERY_ATTEMPTS
): PageRecoveryResult {
  // Chuẩn hóa trạng thái kiểm tra giới hạn:
  // - boolean true: coi như đã có lần recovery trước đó và chạm giới hạn (tương thích ngược).
  // - boolean false: lần đầu tiên (attempt = 0).
  // - number: số lần recovery đã thực hiện, so sánh với maxAttempts.
  const isLimitReached =
    typeof isRecovery === 'boolean'
      ? isRecovery
      : typeof isRecovery === 'number' && isRecovery >= maxAttempts;

  // 1. Trường hợp không có dữ liệu nào (totalRecords = 0)
  if (totalRecords === 0) {
    if (currentPage > 1) {
      if (isLimitReached) {
        return {
          shouldRecover: false,
          targetPage: 1,
          reason: 'Zero records persists after recovery attempt. Halting loop.',
          attemptsExceeded: true,
        };
      }
      return {
        shouldRecover: true,
        targetPage: 1,
        reason: `Total records is 0 while on page ${currentPage}. Recovering to page 1.`,
        attemptsExceeded: false,
      };
    }
    return { shouldRecover: false, targetPage: 1, attemptsExceeded: false };
  }

  // Đảm bảo tổng số trang hiệu lực tối thiểu là 1
  const effectiveTotalPages = Math.max(1, totalPages);

  // 2. Trường hợp trang hiện tại vượt quá tổng số trang (currentPage > totalPages)
  if (currentPage > effectiveTotalPages) {
    if (isLimitReached) {
      return {
        shouldRecover: false,
        targetPage: effectiveTotalPages,
        reason: 'Overshoot persists after recovery attempt. Halting loop.',
        attemptsExceeded: true,
      };
    }
    return {
      shouldRecover: true,
      targetPage: effectiveTotalPages,
      reason: `Current page ${currentPage} exceeds totalPages ${effectiveTotalPages}. Recovering to page ${effectiveTotalPages}.`,
      attemptsExceeded: false,
    };
  }

  return { shouldRecover: false, targetPage: currentPage, attemptsExceeded: false };
}

/**
 * Điều phối luồng request phân trang và phục hồi an toàn (State Machine / Runner)
 * Dùng chung cho UI Hook/Component và Unit/Integration Regression Tests.
 *
 * Đảm bảo:
 * 1. Không phát sinh request vô hạn (giới hạn cứng maxAttempts + 1).
 * 2. Bảo đảm dữ liệu và pagination metadata luôn đồng nhất (tuyệt đối không ghép data trang 2 với metadata trang 1).
 * 3. Xử lý lỗi rõ ràng khi recovery vượt quá số lần thử cho phép.
 */
export async function executePaginatedRequestFlow(
  initialPage: number,
  fetchFn: (page: number) => Promise<unknown>,
  maxAttempts: number = DEFAULT_MAX_RECOVERY_ATTEMPTS
): Promise<PaginatedFlowResult> {
  let targetPage = initialPage;
  let attempt = 0;
  let requestsCount = 0;

  // Giới hạn vòng lặp tối đa = maxAttempts + 1 requests
  while (requestsCount <= maxAttempts + 1) {
    requestsCount++;
    const rawRes = await fetchFn(targetPage);

    const validation = validateAdminUsersResponse(rawRes, targetPage, 10);
    if (!validation.isValid) {
      return {
        success: false,
        users: [],
        pagination: validation.pagination,
        error: validation.error,
        requestsCount,
      };
    }

    const recovery = calculatePageRecovery(
      validation.pagination.page,
      validation.pagination.totalPages,
      validation.pagination.total,
      attempt,
      maxAttempts
    );

    if (recovery.shouldRecover) {
      targetPage = recovery.targetPage;
      attempt++;
      continue;
    }

    if (recovery.attemptsExceeded) {
      return {
        success: false,
        users: [],
        pagination: {
          page: 1,
          limit: validation.pagination.limit,
          total: validation.pagination.total,
          totalPages: Math.max(1, validation.pagination.totalPages),
        },
        error: 'Không thể đồng bộ trang dữ liệu sau các lần thử phục hồi. Vui lòng làm mới danh sách.',
        requestsCount,
      };
    }

    // Trạng thái dữ liệu hợp lệ và nhất quán tuyệt đối giữa users và pagination
    return {
      success: true,
      users: validation.users,
      pagination: validation.pagination,
      requestsCount,
    };
  }

  // Chốt an toàn phòng ngừa vòng lặp ngoài dự kiến
  return {
    success: false,
    users: [],
    pagination: {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
    },
    error: 'Đã vượt quá số lần thử tải trang cho phép.',
    requestsCount,
  };
}
