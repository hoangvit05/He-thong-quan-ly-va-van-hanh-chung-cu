// =========================================================================
// KIỂM THỬ ĐIỀU KIỆN CĂN HỘ VÀ PHÊ DUYỆT CƯ DÂN (BUG-05 ROOM VALIDATION TEST)
// Phụ trách: Thành viên Đức (Web Frontend - Residents Management)
// =========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateResidentForApproval, validateRoomForAssignment } from '../src/utils/roomValidation.ts';

describe('BUG-05: Resident Room Validation Preflight Guard', () => {
  test('TC-RV-01: Từ chối phê duyệt cư dân khi chưa gán phòng (roomId = null)', () => {
    const resident = {
      id: 101,
      fullName: 'Nguyễn Văn A',
      role: 'RESIDENT',
      isApproved: false,
      roomId: null,
      room: null,
    };

    const result = validateResidentForApproval(resident);
    assert.strictEqual(result.canApprove, false);
    assert.strictEqual(result.errorCode, 'NO_ROOM_ASSIGNED');
    assert.match(result.reason, /chưa được gán vào căn hộ/);
  });

  test('TC-RV-02: Từ chối phê duyệt cư dân khi phòng đang bảo trì (MAINTENANCE)', () => {
    const resident = {
      id: 102,
      fullName: 'Trần Thị B',
      role: 'RESIDENT',
      isApproved: false,
      roomId: 15,
      room: {
        id: 15,
        roomNumber: 'B-302',
        status: 'MAINTENANCE',
      },
    };

    const result = validateResidentForApproval(resident);
    assert.strictEqual(result.canApprove, false);
    assert.strictEqual(result.errorCode, 'ROOM_IN_MAINTENANCE');
    assert.match(result.reason, /đang trong trạng thái bảo trì/);
  });

  test('TC-RV-03: Từ chối phê duyệt nếu cư dân đã được duyệt trước đó (Idempotent)', () => {
    const resident = {
      id: 103,
      fullName: 'Lê Văn C',
      role: 'RESIDENT',
      isApproved: true,
      roomId: 20,
      room: {
        id: 20,
        roomNumber: 'C-501',
        status: 'OCCUPIED',
      },
    };

    const result = validateResidentForApproval(resident);
    assert.strictEqual(result.canApprove, false);
    assert.strictEqual(result.errorCode, 'ALREADY_APPROVED');
  });

  test('TC-RV-04: Từ chối phê duyệt tài khoản không phải vai trò RESIDENT', () => {
    const staff = {
      id: 104,
      fullName: 'Phạm Kỹ Thuật',
      role: 'TECHNICIAN',
      isApproved: false,
      roomId: 25,
      room: {
        id: 25,
        roomNumber: 'T-101',
        status: 'VACANT',
      },
    };

    const result = validateResidentForApproval(staff);
    assert.strictEqual(result.canApprove, false);
    assert.strictEqual(result.errorCode, 'INVALID_ROLE');
  });

  test('TC-RV-05: Chấp thuận phê duyệt cư dân khi có phòng hợp lệ (VACANT)', () => {
    const resident = {
      id: 105,
      fullName: 'Hoàng Văn D',
      role: 'RESIDENT',
      isApproved: false,
      roomId: 30,
      room: {
        id: 30,
        roomNumber: 'A-201',
        status: 'VACANT',
      },
    };

    const result = validateResidentForApproval(resident);
    assert.strictEqual(result.canApprove, true);
    assert.strictEqual(result.reason, undefined);
  });

  test('TC-RV-06: Chấp thuận phê duyệt cư dân khi phòng đã có người ở (OCCUPIED - ở chung hộ)', () => {
    const resident = {
      id: 106,
      fullName: 'Đỗ Thị E',
      role: 'RESIDENT',
      isApproved: false,
      roomId: 30,
      room: {
        id: 30,
        roomNumber: 'A-201',
        status: 'OCCUPIED',
      },
    };

    const result = validateResidentForApproval(resident);
    assert.strictEqual(result.canApprove, true);
  });

  test('TC-RV-07: validateRoomForAssignment từ chối gán phòng MAINTENANCE', () => {
    const maintRoom = {
      id: 40,
      roomNumber: 'M-404',
      status: 'MAINTENANCE',
    };

    const result = validateRoomForAssignment(maintRoom);
    assert.strictEqual(result.canAssign, false);
    assert.match(result.reason, /bảo trì/);
  });

  test('TC-RV-08: validateRoomForAssignment cho phép gán phòng VACANT', () => {
    const vacantRoom = {
      id: 50,
      roomNumber: 'V-505',
      status: 'VACANT',
    };

    const result = validateRoomForAssignment(vacantRoom);
    assert.strictEqual(result.canAssign, true);
  });
});
