// =========================================================================
// TIỆN ÍCH KIỂM TRA HỢP LỆ VÀ XÁC THỰC DỮ LIỆU PHÂN HỆ PHẢN ÁNH / GÓP Ý
// Phụ trách: Hiếu (Bảo vệ tính toàn vẹn dữ liệu và an toàn thông tin)
// =========================================================================
import { containsBase64Payload } from '../../common/utils/validation';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu khi cư dân gửi phản ánh / góp ý mới
 */
export function validateFeedbackInput(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: ['Dữ liệu gửi lên không đúng định dạng JSON.'],
    };
  }

  // 1. Tiêu đề phản ánh (title)
  if (data.title === undefined || data.title === null || typeof data.title !== 'string') {
    errors.push('Tiêu đề phản ánh (title) là bắt buộc và phải là chuỗi văn bản.');
  } else {
    const trimmedTitle = data.title.trim();
    if (trimmedTitle.length < 3) {
      errors.push('Tiêu đề phản ánh quá ngắn (tối thiểu 3 ký tự).');
    } else if (trimmedTitle.length > 200) {
      errors.push('Tiêu đề phản ánh quá dài (tối đa 200 ký tự).');
    }
    if (containsBase64Payload(data.title)) {
      errors.push('Tiêu đề không được chứa dữ liệu mã hóa Base64.');
    }
  }

  // 2. Nội dung chi tiết phản ánh (content)
  if (data.content === undefined || data.content === null || typeof data.content !== 'string') {
    errors.push('Nội dung phản ánh (content) là bắt buộc và phải là chuỗi văn bản.');
  } else {
    const trimmedContent = data.content.trim();
    if (trimmedContent.length < 5) {
      errors.push('Nội dung phản ánh quá ngắn (tối thiểu 5 ký tự).');
    } else if (trimmedContent.length > 2000) {
      errors.push('Nội dung phản ánh quá dài (tối đa 2000 ký tự).');
    }
    if (containsBase64Payload(data.content)) {
      errors.push('Nội dung không được chứa dữ liệu mã hóa Base64. Vui lòng nhập văn bản thuần túy.');
    }
  }

  // 3. Căn hộ / Phòng (roomId) - Tùy chọn (null nếu là phản ánh khu vực chung tòa nhà)
  if (data.roomId !== undefined && data.roomId !== null && data.roomId !== '') {
    const parsedRoomId = Number(data.roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
      errors.push('Mã căn hộ (roomId) nếu có phải là số nguyên dương hợp lệ.');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Kiểm tra tính hợp lệ của câu trả lời từ Ban quản lý (reply)
 */
export function validateReplyInput(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: ['Dữ liệu phản hồi không đúng định dạng JSON.'],
    };
  }

  if (data.reply === undefined || data.reply === null || typeof data.reply !== 'string') {
    errors.push('Nội dung phản hồi (reply) là bắt buộc và phải là chuỗi văn bản.');
  } else {
    const trimmedReply = data.reply.trim();
    if (trimmedReply.length < 2) {
      errors.push('Nội dung phản hồi quá ngắn (tối thiểu 2 ký tự).');
    } else if (trimmedReply.length > 2000) {
      errors.push('Nội dung phản hồi không được vượt quá 2000 ký tự.');
    }
    if (containsBase64Payload(data.reply)) {
      errors.push('Nội dung phản hồi không được chứa dữ liệu Base64.');
    }
  }

  if (data.isResolved !== undefined && typeof data.isResolved !== 'boolean') {
    errors.push('Trạng thái giải quyết (isResolved) nếu cung cấp phải là kiểu Boolean (true hoặc false).');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Kiểm tra dữ liệu khi cập nhật độc lập trạng thái đã giải quyết (isResolved)
 */
export function validateStatusInput(data: any): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      errors: ['Dữ liệu không đúng định dạng JSON.'],
    };
  }

  if (data.isResolved === undefined || typeof data.isResolved !== 'boolean') {
    errors.push('Trạng thái giải quyết (isResolved) là bắt buộc và phải là kiểu Boolean (true/false).');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
