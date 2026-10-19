import { TicketStatus, Role } from '@prisma/client';
import { isValidMediaUrl, sanitizeMaterials } from '../../common/utils/validation';

/**
 * Kiểm tra xem một giá trị có phải là TicketStatus hợp lệ hay không
 */
export function isValidTicketStatus(status: unknown): status is TicketStatus {
  return typeof status === 'string' && Object.values(TicketStatus).includes(status as TicketStatus);
}

/**
 * Ma trận chuyển đổi trạng thái (State Machine) và phân quyền vai trò
 */
export interface StateTransitionResult {
  allowed: boolean;
  reason?: string;
}

export function canTransitionTicketStatus(
  currentStatus: TicketStatus,
  targetStatus: TicketStatus,
  userRole?: Role,
  isAssignedTechnician = false,
  isCreator = false
): StateTransitionResult {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  // Quản trị viên và Ban quản lý có quyền điều phối rộng nhất
  const isManager = userRole === Role.ADMIN || userRole === Role.BQL;

  switch (currentStatus) {
    case TicketStatus.PENDING:
      // PENDING -> ASSIGNED: Ban quản lý gán việc
      if (targetStatus === TicketStatus.ASSIGNED) {
        if (!isManager) {
          return { allowed: false, reason: 'Chỉ Ban quản lý hoặc Quản trị viên mới có quyền gán việc.' };
        }
        return { allowed: true };
      }
      // PENDING -> CLOSED: Hủy phiếu khi chưa xử lý (Cư dân tự hủy hoặc BQL hủy)
      if (targetStatus === TicketStatus.CLOSED) {
        if (!isManager && !isCreator) {
          return { allowed: false, reason: 'Chỉ người tạo phiếu hoặc Ban quản lý mới có quyền hủy phiếu.' };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Không thể chuyển trực tiếp từ PENDING sang ${targetStatus}. Cần gán thợ trước.` };

    case TicketStatus.ASSIGNED:
      // ASSIGNED -> IN_PROGRESS: Thợ bắt đầu sửa hoặc BQL xác nhận
      if (targetStatus === TicketStatus.IN_PROGRESS) {
        if (!isManager && !isAssignedTechnician) {
          return { allowed: false, reason: 'Chỉ Thợ kỹ thuật được chỉ định hoặc Ban quản lý mới có thể chuyển trạng thái Đang sửa (IN_PROGRESS).' };
        }
        return { allowed: true };
      }
      // ASSIGNED -> PENDING: BQL thu hồi gán việc
      if (targetStatus === TicketStatus.PENDING) {
        if (!isManager) {
          return { allowed: false, reason: 'Chỉ Ban quản lý mới có quyền hủy gán việc về PENDING.' };
        }
        return { allowed: true };
      }
      // ASSIGNED -> CLOSED: BQL hủy phiếu
      if (targetStatus === TicketStatus.CLOSED) {
        if (!isManager) {
          return { allowed: false, reason: 'Chỉ Ban quản lý mới có quyền hủy phiếu đã gán.' };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Chuyển đổi trạng thái từ ASSIGNED sang ${targetStatus} không hợp lệ.` };

    case TicketStatus.IN_PROGRESS:
      // IN_PROGRESS -> COMPLETED: Thợ kỹ thuật đã sửa xong
      if (targetStatus === TicketStatus.COMPLETED) {
        if (!isManager && !isAssignedTechnician) {
          return { allowed: false, reason: 'Chỉ Thợ kỹ thuật phụ trách hoặc Ban quản lý mới có quyền báo Hoàn thành (COMPLETED).' };
        }
        return { allowed: true };
      }
      // IN_PROGRESS -> ASSIGNED: Tạm dừng / Điều phối lại thợ
      if (targetStatus === TicketStatus.ASSIGNED) {
        if (!isManager) {
          return { allowed: false, reason: 'Chỉ Ban quản lý mới có thể điều phối lại phiếu đang sửa.' };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Không thể chuyển từ IN_PROGRESS sang ${targetStatus}. Thợ cần chuyển sang COMPLETED trước khi đóng phiếu.` };

    case TicketStatus.COMPLETED:
      // COMPLETED -> CLOSED: Cư dân nghiệm thu chấm điểm hoặc BQL đóng phiếu
      if (targetStatus === TicketStatus.CLOSED) {
        if (!isManager && !isCreator) {
          return { allowed: false, reason: 'Chỉ Cư dân tạo phiếu (khi nghiệm thu) hoặc Ban quản lý mới có quyền đóng phiếu (CLOSED).' };
        }
        return { allowed: true };
      }
      // COMPLETED -> IN_PROGRESS: Cư dân hoặc BQL từ chối nghiệm thu, yêu cầu sửa lại
      if (targetStatus === TicketStatus.IN_PROGRESS) {
        if (!isManager && !isCreator) {
          return { allowed: false, reason: 'Chỉ Cư dân hoặc Ban quản lý mới có quyền yêu cầu sửa lại phiếu chưa đạt.' };
        }
        return { allowed: true };
      }
      return { allowed: false, reason: `Chuyển đổi trạng thái từ COMPLETED sang ${targetStatus} không hợp lệ.` };

    case TicketStatus.CLOSED:
      // CLOSED là trạng thái kết thúc (Terminal State)
      if (isManager && targetStatus === TicketStatus.IN_PROGRESS) {
        return { allowed: true }; // BQL mở lại sự cố phát sinh
      }
      return { allowed: false, reason: 'Phiếu đã đóng (CLOSED). Không thể thay đổi trạng thái trừ khi Ban quản lý mở lại.' };

    default:
      return { allowed: false, reason: 'Trạng thái hiện tại không xác định.' };
  }
}

/**
 * Kiểm tra dữ liệu khi tạo phiếu mới
 */
export function validateTicketInput(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.category || typeof data.category !== 'string' || data.category.trim().length === 0) {
    errors.push('Danh mục sự cố (category) không được để trống (ví dụ: Điện, Nước, Internet, Thang máy...).');
  } else if (data.category.trim().length > 50) {
    errors.push('Tên danh mục không được vượt quá 50 ký tự.');
  }

  if (!data.description || typeof data.description !== 'string' || data.description.trim().length < 5) {
    errors.push('Mô tả chi tiết sự cố (description) phải có ít nhất 5 ký tự.');
  } else if (data.description.trim().length > 2000) {
    errors.push('Mô tả chi tiết sự cố không được vượt quá 2000 ký tự.');
  }

  if (data.title && typeof data.title === 'string' && data.title.trim().length > 100) {
    errors.push('Tiêu đề phiếu không được vượt quá 100 ký tự.');
  }

  if (data.mediaUrl) {
    if (!isValidMediaUrl(data.mediaUrl)) {
      errors.push('Đường dẫn ảnh/video đính kèm không hợp lệ hoặc chứa mã Base64. Vui lòng tải ảnh lên Cloud trước.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Kiểm tra dữ liệu đánh giá chất lượng (Rating)
 */
export function validateRatingInput(rating: any, comment?: any): { isValid: boolean; error?: string } {
  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    return { isValid: false, error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5 sao.' };
  }

  if (comment !== undefined && comment !== null && typeof comment === 'string' && comment.length > 500) {
    return { isValid: false, error: 'Nhận xét đánh giá không được vượt quá 500 ký tự.' };
  }

  return { isValid: true };
}
