// =========================================================================
// TIỆN ÍCH KIỂM ĐỊNH ĐIỀU KIỆN CĂN HỘ VÀ CƯ DÂN (ROOM & RESIDENT VALIDATION)
// Phụ trách: Thành viên Đức (Web Frontend - Residents Management)
// Tuân thủ: BUG-05 (Resident Room Validation & Preflight Guard)
// =========================================================================

export interface ResidentApprovalTarget {
  id?: number;
  fullName?: string;
  role?: string;
  isApproved: boolean;
  roomId?: number | null;
  room?: {
    id?: number;
    roomNumber?: string;
    floor?: number;
    area?: number;
    status?: string;
  } | null;
}

export interface ResidentApprovalValidationResult {
  canApprove: boolean;
  reason?: string;
  errorCode?: 'ALREADY_APPROVED' | 'NO_ROOM_ASSIGNED' | 'ROOM_IN_MAINTENANCE' | 'INVALID_ROLE';
}

/**
 * Kiểm định điều kiện trước khi phê duyệt cư dân (BUG-05 Preflight Validation)
 * Đảm bảo:
 * 1. Cư dân chưa được duyệt trước đó.
 * 2. Cư dân phải có role là RESIDENT.
 * 3. Cư dân bắt buộc phải được gán vào một căn hộ (roomId != null && room != null).
 * 4. Căn hộ của cư dân KHÔNG được ở trạng thái bảo dưỡng (MAINTENANCE).
 *
 * Lưu ý: Backend validation vẫn được giữ nguyên làm lớp bảo vệ phòng thủ chiều sâu (defense-in-depth).
 */
export function validateResidentForApproval(
  resident: ResidentApprovalTarget
): ResidentApprovalValidationResult {
  // 1. Kiểm tra đã duyệt chưa (Idempotent check)
  if (resident.isApproved) {
    return {
      canApprove: false,
      reason: 'Tài khoản cư dân đã được phê duyệt trước đó.',
      errorCode: 'ALREADY_APPROVED',
    };
  }

  // 2. Kiểm tra vai trò
  if (resident.role && resident.role !== 'RESIDENT') {
    return {
      canApprove: false,
      reason: `Chỉ có thể phê duyệt tài khoản cư dân. Tài khoản này có vai trò [${resident.role}].`,
      errorCode: 'INVALID_ROLE',
    };
  }

  // 3. Kiểm tra điều kiện phòng: Bắt buộc đã gán phòng
  if (resident.roomId === null || resident.roomId === undefined || !resident.room) {
    return {
      canApprove: false,
      reason: 'Tài khoản cư dân chưa được gán vào căn hộ nào. Vui lòng gán căn hộ trước khi phê duyệt.',
      errorCode: 'NO_ROOM_ASSIGNED',
    };
  }

  // 4. Kiểm tra trạng thái phòng: Không thể duyệt vào phòng đang bảo dưỡng (MAINTENANCE)
  if (resident.room.status === 'MAINTENANCE') {
    return {
      canApprove: false,
      reason: 'Không thể phê duyệt cư dân vào căn hộ đang trong trạng thái bảo trì (MAINTENANCE).',
      errorCode: 'ROOM_IN_MAINTENANCE',
    };
  }

  return {
    canApprove: true,
  };
}

/**
 * Kiểm định phòng có đủ điều kiện để gán cho cư dân hay không
 */
export function validateRoomForAssignment(room: {
  id: number;
  roomNumber: string;
  status: string;
}): { canAssign: boolean; reason?: string } {
  if (room.status === 'MAINTENANCE') {
    return {
      canAssign: false,
      reason: `Căn hộ [${room.roomNumber}] đang trong trạng thái bảo trì (MAINTENANCE). Không thể gán cho cư dân.`,
    };
  }
  return { canAssign: true };
}
