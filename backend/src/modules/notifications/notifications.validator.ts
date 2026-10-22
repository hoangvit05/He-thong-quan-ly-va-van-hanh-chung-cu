// =========================================================================
// VALIDATOR PHÂN HỆ THÔNG BÁO TÒA NHÀ (NOTIFICATIONS VALIDATOR)
// Phụ trách: Việt Hoàng (Backend Lead)
// =========================================================================

import { containsBase64Payload } from '../../common/utils/validation';

export interface CreateNotificationDto {
  title: string;
  content: string;
  targetRoom: string | null;
}

export interface NotificationQueryDto {
  page: number;
  limit: number;
  targetRoom?: string;
}

/**
 * Kiểm tra và chuẩn hóa payload tạo thông báo mới (POST /api/notifications)
 */
export function validateCreateNotificationInput(payload: unknown): {
  isValid: boolean;
  data?: CreateNotificationDto;
  error?: string;
} {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Payload không hợp lệ (yêu cầu một đối tượng JSON).' };
  }

  const { title, content, targetRoom } = payload as Record<string, unknown>;

  // 1. Kiểm tra Tiêu đề (title)
  if (typeof title !== 'string') {
    return { isValid: false, error: 'Tiêu đề thông báo là bắt buộc và phải là chuỗi ký tự.' };
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 3) {
    return { isValid: false, error: 'Tiêu đề thông báo phải có độ dài tối thiểu 3 ký tự.' };
  }

  if (trimmedTitle.length > 200) {
    return { isValid: false, error: 'Tiêu đề thông báo không được vượt quá 200 ký tự.' };
  }

  if (containsBase64Payload(trimmedTitle)) {
    return { isValid: false, error: 'Tiêu đề không được chứa dữ liệu mã hóa Base64.' };
  }

  // 2. Kiểm tra Nội dung (content)
  if (typeof content !== 'string') {
    return { isValid: false, error: 'Nội dung thông báo là bắt buộc và phải là chuỗi ký tự.' };
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 5) {
    return { isValid: false, error: 'Nội dung thông báo phải có độ dài tối thiểu 5 ký tự.' };
  }

  if (trimmedContent.length > 5000) {
    return { isValid: false, error: 'Nội dung thông báo không được vượt quá 5000 ký tự.' };
  }

  if (containsBase64Payload(trimmedContent)) {
    return { isValid: false, error: 'Nội dung thông báo không được chứa dữ liệu mã hóa Base64. Hãy tải ảnh lên Cloud trước.' };
  }

  // 3. Kiểm tra Căn hộ đích (targetRoom): tùy chọn (null = thông báo toàn tòa nhà)
  let normalizedTargetRoom: string | null = null;
  if (targetRoom !== undefined && targetRoom !== null) {
    if (typeof targetRoom !== 'string') {
      return { isValid: false, error: 'Căn hộ đích (targetRoom) phải là chuỗi ký tự tên phòng hoặc null.' };
    }
    const trimmedRoom = targetRoom.trim();
    if (trimmedRoom.length > 0) {
      if (trimmedRoom.length > 50) {
        return { isValid: false, error: 'Tên căn hộ đích không được vượt quá 50 ký tự.' };
      }
      normalizedTargetRoom = trimmedRoom;
    }
  }

  return {
    isValid: true,
    data: {
      title: trimmedTitle,
      content: trimmedContent,
      targetRoom: normalizedTargetRoom,
    },
  };
}

/**
 * Kiểm tra và chuẩn hóa query params (GET /api/notifications)
 */
export function validateNotificationQuery(query: Record<string, unknown>): NotificationQueryDto {
  let page = 1;
  let limit = 20;

  if (query.page !== undefined) {
    const parsedPage = parseInt(String(query.page), 10);
    if (!isNaN(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }
  }

  if (query.limit !== undefined) {
    const parsedLimit = parseInt(String(query.limit), 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 50); // Giới hạn tối đa 50 bản ghi / trang
    }
  }

  let targetRoom: string | undefined;
  if (typeof query.targetRoom === 'string' && query.targetRoom.trim()) {
    targetRoom = query.targetRoom.trim();
  }

  return { page, limit, targetRoom };
}
