// =========================================================================
// TIỆN ÍCH KIỂM ĐỊNH NGHIỆP VỤ CÔNG VIỆC KỸ THUẬT VIÊN (TECHNICIAN TASK VALIDATION)
// Phụ trách: Thành viên Oanh (Web Frontend - Technician Tasks Module)
// Nghiệp vụ: Chuyển đổi trạng thái, thẩm định danh mục vật tư, kiểm tra liên kết ảnh an toàn
// =========================================================================

export type TicketStatusType = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface TransitionValidationResult {
  allowed: boolean;
  reason?: string;
  errorCode?: 'INVALID_TARGET' | 'DISALLOWED_DIRECT_CLOSE' | 'NOT_ASSIGNED_STATE' | 'TERMINAL_STATE';
}

export interface MaterialsValidationResult {
  isValid: boolean;
  sanitized?: string;
  error?: string;
  errorCode?: 'EMPTY_INPUT' | 'EXCEEDS_MAX_LENGTH' | 'BASE64_PROHIBITED';
}

export interface TaskStatsSummary {
  total: number;
  assigned: number;
  inProgress: number;
  completed: number;
  closed: number;
}

/**
 * Thẩm định tính hợp lệ của bước chuyển trạng thái sự cố đối với Kỹ thuật viên (Client-side Preflight Guard)
 * Quy tắc State Machine:
 * - ASSIGNED -> IN_PROGRESS: Thợ nhận việc bắt đầu sửa chữa (Hợp lệ)
 * - IN_PROGRESS -> COMPLETED: Thợ sửa xong, báo hoàn thành chờ nghiệm thu (Hợp lệ)
 * - Thợ TUYỆT ĐỐI KHÔNG có quyền tự ý chuyển sang CLOSED (chỉ Cư dân nghiệm thu hoặc BQL mới được đóng)
 * - Không cho phép nhảy cóc ASSIGNED -> COMPLETED khi chưa qua IN_PROGRESS
 */
export function validateTechnicianTransition(
  currentStatus: TicketStatusType,
  targetStatus: TicketStatusType
): TransitionValidationResult {
  if (currentStatus === 'CLOSED') {
    return {
      allowed: false,
      reason: 'Phiếu đã đóng hoàn tất (CLOSED). Kỹ thuật viên không thể thay đổi trạng thái nữa.',
      errorCode: 'TERMINAL_STATE',
    };
  }

  if (targetStatus === 'CLOSED') {
    return {
      allowed: false,
      reason: 'Kỹ thuật viên không có quyền tự ý đóng phiếu (CLOSED). Chỉ Cư dân hoặc Ban quản lý mới được nghiệm thu đóng phiếu.',
      errorCode: 'DISALLOWED_DIRECT_CLOSE',
    };
  }

  if (currentStatus === 'ASSIGNED') {
    if (targetStatus === 'IN_PROGRESS') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Từ trạng thái Chờ nhận việc (ASSIGNED), thợ chỉ có thể chuyển sang Đang sửa (IN_PROGRESS). Không thể chuyển thẳng sang ${targetStatus}.`,
      errorCode: 'INVALID_TARGET',
    };
  }

  if (currentStatus === 'IN_PROGRESS') {
    if (targetStatus === 'COMPLETED') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Từ trạng thái Đang sửa chữa (IN_PROGRESS), thợ chỉ có thể báo Hoàn thành (COMPLETED).`,
      errorCode: 'INVALID_TARGET',
    };
  }

  if (currentStatus === 'COMPLETED') {
    return {
      allowed: false,
      reason: 'Phiếu đang chờ nghiệm thu từ cư dân. Kỹ thuật viên không thể tự chuyển trạng thái tiếp theo.',
      errorCode: 'INVALID_TARGET',
    };
  }

  return {
    allowed: false,
    reason: `Trạng thái hiện tại [${currentStatus}] không hỗ trợ thao tác của thợ.`,
    errorCode: 'NOT_ASSIGNED_STATE',
  };
}

/**
 * Thẩm định và chuẩn hóa danh mục vật tư thay thế
 * - Bắt buộc có nội dung không chỉ chứa khoảng trắng
 * - Giới hạn tối đa 2000 ký tự
 * - Nghiêm cấm chuỗi ảnh Base64
 */
export function validateMaterialsInput(rawInput: unknown): MaterialsValidationResult {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    return {
      isValid: false,
      error: 'Danh mục vật tư thay thế không được để trống.',
      errorCode: 'EMPTY_INPUT',
    };
  }

  const trimmed = rawInput.trim();

  // Kiểm tra chống nhồi ảnh Base64 vào trường văn bản
  if (/data:image\/[a-zA-Z]+;base64,/i.test(trimmed)) {
    return {
      isValid: false,
      error: 'Không được đính kèm mã Base64 vào danh mục vật tư. Vui lòng tải ảnh lên Cloud chuyên dụng.',
      errorCode: 'BASE64_PROHIBITED',
    };
  }

  if (trimmed.length > 2000) {
    return {
      isValid: false,
      error: `Danh mục vật tư vượt quá giới hạn 2000 ký tự (Hiện tại: ${trimmed.length} ký tự).`,
      errorCode: 'EXCEEDS_MAX_LENGTH',
    };
  }

  return {
    isValid: true,
    sanitized: trimmed,
  };
}

/**
 * Kiểm tra đường dẫn URL ảnh an toàn (Safe URL Guard)
 * - Chỉ chấp nhận giao thức http:// hoặc https://
 * - Từ chối chuỗi Base64 (data:) và JavaScript protocol (javascript:) để phòng chống XSS
 */
export function isSafeMediaUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim().toLowerCase();

  // Chặn XSS và Base64
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return false;
  }

  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Tính toán thống kê tổng quan danh mục công việc kỹ thuật
 */
export function calculateTaskStats(
  tickets: Array<{ status: TicketStatusType }>
): TaskStatsSummary {
  const stats: TaskStatsSummary = {
    total: tickets.length,
    assigned: 0,
    inProgress: 0,
    completed: 0,
    closed: 0,
  };

  for (const t of tickets) {
    switch (t.status) {
      case 'ASSIGNED':
        stats.assigned++;
        break;
      case 'IN_PROGRESS':
        stats.inProgress++;
        break;
      case 'COMPLETED':
        stats.completed++;
        break;
      case 'CLOSED':
        stats.closed++;
        break;
    }
  }

  return stats;
}
