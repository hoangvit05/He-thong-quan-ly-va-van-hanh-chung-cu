// =========================================================================
// VALIDATOR PHÂN HỆ QUẢN LÝ CĂN HỘ (ROOMS MODULE)
// Phụ trách: Việt Hoàng (Backend Lead)
// =========================================================================

import { RoomStatus } from '@prisma/client';

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  parsed?: T;
}

export interface RoomsQuery {
  page: number;
  limit: number;
  search?: string;
  floor?: number;
  status?: RoomStatus;
}

export interface CreateRoomInput {
  roomNumber: string;
  floor: number;
  area: number;
  status: RoomStatus;
}

export interface UpdateRoomInput {
  roomNumber?: string;
  floor?: number;
  area?: number;
  status?: RoomStatus;
}

const VALID_ROOM_STATUSES: RoomStatus[] = [
  RoomStatus.VACANT,
  RoomStatus.OCCUPIED,
  RoomStatus.MAINTENANCE,
];

/**
 * Validate query params cho API GET /api/rooms
 */
export function validateRoomsQuery(query: any): ValidationResult<RoomsQuery> {
  const errors: string[] = [];
  const q = query || {};

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

  let floor: number | undefined;
  if (q.floor !== undefined && q.floor !== '') {
    const parsedFloor = Number(q.floor);
    if (!Number.isInteger(parsedFloor)) {
      errors.push("Tham số 'floor' phải là số nguyên hợp lệ.");
    } else {
      floor = parsedFloor;
    }
  }

  let status: RoomStatus | undefined;
  if (q.status !== undefined && q.status !== '') {
    const statusStr = String(q.status).toUpperCase();
    if (VALID_ROOM_STATUSES.includes(statusStr as RoomStatus)) {
      status = statusStr as RoomStatus;
    } else {
      errors.push(
        `Tham số 'status' không hợp lệ. Các giá trị hợp lệ: ${VALID_ROOM_STATUSES.join(', ')}.`
      );
    }
  }

  const search = typeof q.search === 'string' && q.search.trim() ? q.search.trim() : undefined;

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: { page, limit, search, floor, status },
  };
}

/**
 * Validate payload cho API POST /api/rooms
 */
export function validateCreateRoomInput(body: any): ValidationResult<CreateRoomInput> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: ['Dữ liệu tạo căn hộ không hợp lệ (body rỗng).'],
    };
  }

  const { roomNumber, floor, area, status } = body;

  // 1. Validate roomNumber
  if (roomNumber === undefined || roomNumber === null || typeof roomNumber !== 'string') {
    errors.push('Số phòng (roomNumber) là bắt buộc và phải là chuỗi văn bản.');
  } else {
    const trimmed = roomNumber.trim();
    if (!trimmed) {
      errors.push('Số phòng (roomNumber) không được để trống.');
    } else if (trimmed.length > 50) {
      errors.push('Số phòng (roomNumber) không được vượt quá 50 ký tự.');
    }
  }

  // 2. Validate floor
  if (floor === undefined || floor === null || floor === '') {
    errors.push('Tầng (floor) là bắt buộc.');
  } else {
    const parsedFloor = Number(floor);
    if (!Number.isInteger(parsedFloor)) {
      errors.push('Tầng (floor) phải là số nguyên hợp lệ.');
    }
  }

  // 3. Validate area
  if (area === undefined || area === null || area === '') {
    errors.push('Diện tích (area) là bắt buộc.');
  } else {
    const parsedArea = Number(area);
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      errors.push('Diện tích (area) phải là số dương lớn hơn 0.');
    }
  }

  // 4. Validate status (khởi tạo: chỉ chấp nhận VACANT hoặc MAINTENANCE, cấm OCCUPIED khi tạo mới)
  let initialStatus: RoomStatus = RoomStatus.VACANT;
  if (status !== undefined && status !== null && status !== '') {
    const statusStr = String(status).toUpperCase();
    if (statusStr === RoomStatus.OCCUPIED) {
      errors.push(
        'Không thể khởi tạo căn hộ ở trạng thái Đang có người ở (OCCUPIED) khi chưa có cư dân được phê duyệt.'
      );
    } else if (statusStr === RoomStatus.VACANT || statusStr === RoomStatus.MAINTENANCE) {
      initialStatus = statusStr as RoomStatus;
    } else {
      errors.push(
        `Trạng thái căn hộ không hợp lệ. Chỉ chấp nhận: ${RoomStatus.VACANT}, ${RoomStatus.MAINTENANCE}.`
      );
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed: {
      roomNumber: String(roomNumber).trim(),
      floor: Number(floor),
      area: Number(area),
      status: initialStatus,
    },
  };
}

/**
 * Validate payload cho API PUT /api/rooms/:id
 */
export function validateUpdateRoomInput(body: any): ValidationResult<UpdateRoomInput> {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      errors: ['Dữ liệu cập nhật căn hộ không hợp lệ (body rỗng).'],
    };
  }

  const { roomNumber, floor, area, status } = body;
  const hasUpdateFields =
    roomNumber !== undefined ||
    floor !== undefined ||
    area !== undefined ||
    status !== undefined;

  if (!hasUpdateFields) {
    return {
      isValid: false,
      errors: ['Cần cung cấp ít nhất một trường để cập nhật (roomNumber, floor, area, status).'],
    };
  }

  const parsed: UpdateRoomInput = {};

  // 1. roomNumber nếu có
  if (roomNumber !== undefined) {
    if (typeof roomNumber !== 'string') {
      errors.push('Số phòng (roomNumber) phải là chuỗi văn bản.');
    } else {
      const trimmed = roomNumber.trim();
      if (!trimmed) {
        errors.push('Số phòng (roomNumber) không được để trống.');
      } else if (trimmed.length > 50) {
        errors.push('Số phòng (roomNumber) không được vượt quá 50 ký tự.');
      } else {
        parsed.roomNumber = trimmed;
      }
    }
  }

  // 2. floor nếu có
  if (floor !== undefined) {
    const parsedFloor = Number(floor);
    if (!Number.isInteger(parsedFloor)) {
      errors.push('Tầng (floor) phải là số nguyên hợp lệ.');
    } else {
      parsed.floor = parsedFloor;
    }
  }

  // 3. area nếu có
  if (area !== undefined) {
    const parsedArea = Number(area);
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      errors.push('Diện tích (area) phải là số dương lớn hơn 0.');
    } else {
      parsed.area = parsedArea;
    }
  }

  // 4. status nếu có
  if (status !== undefined) {
    const statusStr = String(status).toUpperCase();
    if (VALID_ROOM_STATUSES.includes(statusStr as RoomStatus)) {
      parsed.status = statusStr as RoomStatus;
    } else {
      errors.push(
        `Trạng thái căn hộ không hợp lệ. Các giá trị hợp lệ: ${VALID_ROOM_STATUSES.join(', ')}.`
      );
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    errors: [],
    parsed,
  };
}

/**
 * Validate param id cho API phòng
 */
export function validateRoomIdParam(paramId: any): { isValid: boolean; roomId?: number; error?: string } {
  if (paramId === undefined || paramId === null || paramId === '') {
    return { isValid: false, error: 'Mã định danh căn hộ (id) là bắt buộc.' };
  }

  const id = Number(paramId);
  if (!Number.isInteger(id) || id <= 0) {
    return { isValid: false, error: 'Mã định danh căn hộ (id) phải là số nguyên dương.' };
  }

  return { isValid: true, roomId: id };
}
