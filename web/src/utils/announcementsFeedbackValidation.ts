// =========================================================================
// TIỆN ÍCH KIỂM ĐỊNH THÔNG BÁO VÀ PHẢN HỒI GÓP Ý (ANNOUNCEMENTS & FEEDBACK)
// Phụ trách: Thành viên Oanh (Web Frontend - Announcements & Feedback Modules)
// Nghiệp vụ: Thẩm định thông báo, thẩm định phản hồi, chống Base64 và tính toán KPI
// =========================================================================

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  targetRoom?: string | null;
}

export interface ValidationOutcome<T = unknown> {
  isValid: boolean;
  data?: T;
  error?: string;
  errorCode?: 'EMPTY_FIELD' | 'TOO_SHORT' | 'EXCEEDS_MAX_LENGTH' | 'BASE64_PROHIBITED' | 'INVALID_TYPE';
}

export interface AnnouncementStatsSummary {
  total: number;
  allBuilding: number;
  targetedRoom: number;
}

export interface FeedbackStatsSummary {
  total: number;
  pending: number;
  resolved: number;
}

/**
 * Kiểm tra xem chuỗi có chứa dữ liệu mã hóa Base64 hay không
 * Chống việc nhồi nhét ảnh Base64 vào trường văn bản gây phình to database
 */
export function containsBase64(text: string): boolean {
  if (typeof text !== 'string') return false;
  return /data:(?:image|application)\/[a-zA-Z0-9.+-]+;base64,/i.test(text);
}

/**
 * Thẩm định dữ liệu soạn thông báo tòa nhà mới (Client-side Preflight Guard)
 * Quy tắc:
 * - Tiêu đề: từ 3 đến 200 ký tự, không chứa Base64
 * - Nội dung: từ 5 đến 5000 ký tự, không chứa Base64
 * - targetRoom: null (toàn tòa nhà) hoặc chuỗi số phòng tối đa 50 ký tự
 */
export function validateAnnouncementPayload(payload: unknown): ValidationOutcome<CreateAnnouncementInput> {
  if (!payload || typeof payload !== 'object') {
    return {
      isValid: false,
      error: 'Dữ liệu thông báo không hợp lệ.',
      errorCode: 'INVALID_TYPE',
    };
  }

  const { title, content, targetRoom } = payload as Record<string, unknown>;

  // 1. Kiểm tra Tiêu đề
  if (typeof title !== 'string' || !title.trim()) {
    return {
      isValid: false,
      error: 'Tiêu đề thông báo không được để trống.',
      errorCode: 'EMPTY_FIELD',
    };
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length < 3) {
    return {
      isValid: false,
      error: 'Tiêu đề thông báo phải có độ dài tối thiểu 3 ký tự.',
      errorCode: 'TOO_SHORT',
    };
  }

  if (trimmedTitle.length > 200) {
    return {
      isValid: false,
      error: `Tiêu đề thông báo không được vượt quá 200 ký tự (Hiện tại: ${trimmedTitle.length} ký tự).`,
      errorCode: 'EXCEEDS_MAX_LENGTH',
    };
  }

  if (containsBase64(trimmedTitle)) {
    return {
      isValid: false,
      error: 'Tiêu đề thông báo không được chứa mã hóa Base64.',
      errorCode: 'BASE64_PROHIBITED',
    };
  }

  // 2. Kiểm tra Nội dung
  if (typeof content !== 'string' || !content.trim()) {
    return {
      isValid: false,
      error: 'Nội dung thông báo không được để trống.',
      errorCode: 'EMPTY_FIELD',
    };
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 5) {
    return {
      isValid: false,
      error: 'Nội dung thông báo phải có độ dài tối thiểu 5 ký tự.',
      errorCode: 'TOO_SHORT',
    };
  }

  if (trimmedContent.length > 5000) {
    return {
      isValid: false,
      error: `Nội dung thông báo không được vượt quá 5000 ký tự (Hiện tại: ${trimmedContent.length} ký tự).`,
      errorCode: 'EXCEEDS_MAX_LENGTH',
    };
  }

  if (containsBase64(trimmedContent)) {
    return {
      isValid: false,
      error: 'Nội dung thông báo không được chứa mã Base64. Vui lòng sử dụng đường dẫn ảnh Cloud.',
      errorCode: 'BASE64_PROHIBITED',
    };
  }

  // 3. Kiểm tra Căn hộ đích (tùy chọn)
  let normalizedRoom: string | null = null;
  if (targetRoom !== undefined && targetRoom !== null) {
    if (typeof targetRoom !== 'string') {
      return {
        isValid: false,
        error: 'Tên căn hộ nhận thông báo phải là chuỗi ký tự hoặc để trống (toàn tòa nhà).',
        errorCode: 'INVALID_TYPE',
      };
    }
    const trimmedRoom = targetRoom.trim();
    if (trimmedRoom.length > 0) {
      if (trimmedRoom.length > 50) {
        return {
          isValid: false,
          error: 'Tên căn hộ đích không được vượt quá 50 ký tự.',
          errorCode: 'EXCEEDS_MAX_LENGTH',
        };
      }
      normalizedRoom = trimmedRoom;
    }
  }

  return {
    isValid: true,
    data: {
      title: trimmedTitle,
      content: trimmedContent,
      targetRoom: normalizedRoom,
    },
  };
}

/**
 * Thẩm định nội dung câu trả lời phản hồi ý kiến cư dân của Ban Quản Lý
 * Quy tắc:
 * - Nội dung phản hồi: từ 2 đến 2000 ký tự, không chứa Base64
 */
export function validateFeedbackReplyPayload(rawReply: unknown): ValidationOutcome<{ reply: string }> {
  if (typeof rawReply !== 'string' || !rawReply.trim()) {
    return {
      isValid: false,
      error: 'Nội dung câu trả lời phản hồi không được để trống.',
      errorCode: 'EMPTY_FIELD',
    };
  }

  const trimmed = rawReply.trim();
  if (trimmed.length < 2) {
    return {
      isValid: false,
      error: 'Nội dung phản hồi tối thiểu phải có 2 ký tự.',
      errorCode: 'TOO_SHORT',
    };
  }

  if (trimmed.length > 2000) {
    return {
      isValid: false,
      error: `Nội dung phản hồi không được vượt quá 2000 ký tự (Hiện tại: ${trimmed.length} ký tự).`,
      errorCode: 'EXCEEDS_MAX_LENGTH',
    };
  }

  if (containsBase64(trimmed)) {
    return {
      isValid: false,
      error: 'Nội dung phản hồi không được chứa chuỗi ảnh Base64.',
      errorCode: 'BASE64_PROHIBITED',
    };
  }

  return {
    isValid: true,
    data: { reply: trimmed },
  };
}

/**
 * Tính toán thống kê tổng quan danh sách thông báo
 */
export function calculateAnnouncementStats(
  announcements: Array<{ targetRoom?: string | null }>
): AnnouncementStatsSummary {
  const stats: AnnouncementStatsSummary = {
    total: announcements.length,
    allBuilding: 0,
    targetedRoom: 0,
  };

  for (const a of announcements) {
    if (a.targetRoom && a.targetRoom.trim()) {
      stats.targetedRoom++;
    } else {
      stats.allBuilding++;
    }
  }

  return stats;
}

/**
 * Tính toán thống kê tổng quan danh sách phản ánh
 */
export function calculateFeedbackStats(
  feedbacks: Array<{ isResolved?: boolean }>
): FeedbackStatsSummary {
  const stats: FeedbackStatsSummary = {
    total: feedbacks.length,
    pending: 0,
    resolved: 0,
  };

  for (const f of feedbacks) {
    if (f.isResolved) {
      stats.resolved++;
    } else {
      stats.pending++;
    }
  }

  return stats;
}
