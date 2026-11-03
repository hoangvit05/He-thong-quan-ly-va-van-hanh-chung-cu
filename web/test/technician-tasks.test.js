// =========================================================================
// BỘ KIỂM THỬ TỰ ĐỘNG PHÂN HỆ CÔNG VIỆC KỸ THUẬT VIÊN (TECHNICIAN TASKS)
// Phụ trách: Thành viên Oanh (Web Frontend - Technician Tasks Module)
// Phạm vi: State Machine, Thẩm định vật tư, An toàn Media URL & Tổng hợp KPI
// =========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateTechnicianTransition,
  validateMaterialsInput,
  isSafeMediaUrl,
  calculateTaskStats,
} from '../src/utils/technicianTaskValidation.ts';

describe('PHÂN HỆ KỸ THUẬT VIÊN: KIỂM SOÁT BƯỚC CHUYỂN TRẠNG THÁI (STATE MACHINE)', () => {
  test('TC-TT-01: Cho phép chuyển từ ASSIGNED -> IN_PROGRESS (Thợ nhận việc bắt đầu sửa)', () => {
    const res = validateTechnicianTransition('ASSIGNED', 'IN_PROGRESS');
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, undefined);
  });

  test('TC-TT-02: Cho phép chuyển từ IN_PROGRESS -> COMPLETED (Thợ sửa xong báo hoàn thành)', () => {
    const res = validateTechnicianTransition('IN_PROGRESS', 'COMPLETED');
    assert.strictEqual(res.allowed, true);
    assert.strictEqual(res.reason, undefined);
  });

  test('TC-TT-03: Từ chối chuyển thẳng ASSIGNED -> COMPLETED (Không được nhảy cóc qua IN_PROGRESS)', () => {
    const res = validateTechnicianTransition('ASSIGNED', 'COMPLETED');
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.errorCode, 'INVALID_TARGET');
    assert.match(res.reason, /không thể chuyển thẳng sang COMPLETED/i);
  });

  test('TC-TT-04: Từ chối thợ tự ý đóng phiếu sang CLOSED từ mọi trạng thái (Chỉ Cư dân/BQL mới được đóng)', () => {
    const fromAssigned = validateTechnicianTransition('ASSIGNED', 'CLOSED');
    assert.strictEqual(fromAssigned.allowed, false);
    assert.strictEqual(fromAssigned.errorCode, 'DISALLOWED_DIRECT_CLOSE');

    const fromInProgress = validateTechnicianTransition('IN_PROGRESS', 'CLOSED');
    assert.strictEqual(fromInProgress.allowed, false);
    assert.strictEqual(fromInProgress.errorCode, 'DISALLOWED_DIRECT_CLOSE');

    const fromCompleted = validateTechnicianTransition('COMPLETED', 'CLOSED');
    assert.strictEqual(fromCompleted.allowed, false);
    assert.strictEqual(fromCompleted.errorCode, 'DISALLOWED_DIRECT_CLOSE');
  });

  test('TC-TT-05: Từ chối mọi thao tác thay đổi khi phiếu đã ở trạng thái CLOSED (Terminal State)', () => {
    const res = validateTechnicianTransition('CLOSED', 'IN_PROGRESS');
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.errorCode, 'TERMINAL_STATE');
    assert.match(res.reason, /Phiếu đã đóng hoàn tất/);
  });

  test('TC-TT-06: Từ chối thợ tự chuyển tiếp từ COMPLETED khi chưa được nghiệm thu', () => {
    const res = validateTechnicianTransition('COMPLETED', 'IN_PROGRESS');
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.errorCode, 'INVALID_TARGET');
  });
});

describe('PHÂN HỆ KỸ THUẬT VIÊN: THẨM ĐỊNH DANH MỤC VẬT TƯ THAY THẾ', () => {
  test('TC-TT-07: Từ chối khi vật tư rỗng hoặc chỉ có khoảng trắng', () => {
    const empty1 = validateMaterialsInput('');
    assert.strictEqual(empty1.isValid, false);
    assert.strictEqual(empty1.errorCode, 'EMPTY_INPUT');

    const empty2 = validateMaterialsInput('    \n\t  ');
    assert.strictEqual(empty2.isValid, false);
    assert.strictEqual(empty2.errorCode, 'EMPTY_INPUT');
  });

  test('TC-TT-08: Nghiêm cấm chuỗi ảnh Base64 trong trường vật tư (Chống tràn dung lượng DB)', () => {
    const base64Input = '- 01 bóng đèn\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = validateMaterialsInput(base64Input);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'BASE64_PROHIBITED');
    assert.match(res.error, /Không được đính kèm mã Base64/);
  });

  test('TC-TT-09: Từ chối khi danh mục vật tư vượt quá 2000 ký tự', () => {
    const longText = 'A'.repeat(2001);
    const res = validateMaterialsInput(longText);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'EXCEEDS_MAX_LENGTH');
    assert.match(res.error, /vượt quá giới hạn 2000 ký tự/);
  });

  test('TC-TT-10: Chấp thuận vật tư hợp lệ và chuẩn hóa loại bỏ khoảng trắng đầu/cuối', () => {
    const validRaw = '   - 01 bóng đèn LED Philips 18W\n- 02 măng sông ống PVC phi 21   ';
    const res = validateMaterialsInput(validRaw);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.sanitized, '- 01 bóng đèn LED Philips 18W\n- 02 măng sông ống PVC phi 21');
  });
});

describe('PHÂN HỆ KỸ THUẬT VIÊN: BẢO VỆ VÀ KIỂM ĐỊNH MEDIA URL AN TOÀN', () => {
  test('TC-TT-11: Chấp thuận các URL hợp lệ sử dụng giao thức HTTPS hoặc HTTP', () => {
    assert.strictEqual(isSafeMediaUrl('https://res.cloudinary.com/demo/image/upload/sample.jpg'), true);
    assert.strictEqual(isSafeMediaUrl('http://chungcu.vn/uploads/photo123.png'), true);
  });

  test('TC-TT-12: Từ chối chuỗi Base64 data:image (Yêu cầu tải lên Cloud)', () => {
    assert.strictEqual(isSafeMediaUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...'), false);
  });

  test('TC-TT-13: Từ chối liên kết độc hại dạng javascript: (Phòng chống XSS)', () => {
    assert.strictEqual(isSafeMediaUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeMediaUrl('JAVASCRIPT:void(0)'), false);
  });

  test('TC-TT-14: Xử lý an toàn các giá trị null, undefined, số hoặc chuỗi rỗng', () => {
    assert.strictEqual(isSafeMediaUrl(null), false);
    assert.strictEqual(isSafeMediaUrl(undefined), false);
    assert.strictEqual(isSafeMediaUrl(''), false);
    assert.strictEqual(isSafeMediaUrl('   '), false);
    assert.strictEqual(isSafeMediaUrl(12345), false);
  });
});

describe('PHÂN HỆ KỸ THUẬT VIÊN: TỔNG HỢP VÀ TÍNH TOÁN KPI CÔNG VIỆC', () => {
  test('TC-TT-15: Tính toán chính xác phân bổ số lượng từng trạng thái', () => {
    const sampleTickets = [
      { status: 'ASSIGNED' },
      { status: 'ASSIGNED' },
      { status: 'IN_PROGRESS' },
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'COMPLETED' },
      { status: 'CLOSED' },
    ];

    const stats = calculateTaskStats(sampleTickets);
    assert.strictEqual(stats.total, 7);
    assert.strictEqual(stats.assigned, 2);
    assert.strictEqual(stats.inProgress, 1);
    assert.strictEqual(stats.completed, 3);
    assert.strictEqual(stats.closed, 1);
  });

  test('TC-TT-16: Xử lý danh sách rỗng trả về toàn bộ chỉ số bằng 0 an toàn', () => {
    const stats = calculateTaskStats([]);
    assert.strictEqual(stats.total, 0);
    assert.strictEqual(stats.assigned, 0);
    assert.strictEqual(stats.inProgress, 0);
    assert.strictEqual(stats.completed, 0);
    assert.strictEqual(stats.closed, 0);
  });
});
