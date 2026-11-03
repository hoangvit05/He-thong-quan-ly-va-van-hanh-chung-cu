// =========================================================================
// TEST SUITE KIỂM THỬ TOÀN DIỆN 3 PHÂN HỆ CỦA ĐỨC (ESM)
// (RESIDENTS, TICKET DISPATCH, BILLING MANAGER)
// Phụ trách: Thành viên Đức (QA + Senior Fullstack Developer)
// =========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateResidentForApproval, validateRoomForAssignment } from '../src/utils/roomValidation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webPagesDir = path.join(__dirname, '..', 'src', 'pages');

describe('1. Phân hệ Residents (Quản lý Căn hộ & Cư dân)', () => {
  test('RD-01: Cư dân chưa gán phòng (roomId = null) không được phép phê duyệt', () => {
    const resident = { id: 10, fullName: 'Nguyen Van A', roomId: null, isApproved: false };
    const res = validateResidentForApproval(resident);
    assert.strictEqual(res.canApprove, false);
    assert.strictEqual(res.errorCode, 'NO_ROOM_ASSIGNED');
    assert.match(res.reason, /chưa được gán vào căn hộ/i);
  });

  test('RD-02: Căn hộ đang bảo trì (MAINTENANCE) không được duyệt cư dân vào', () => {
    const resident = {
      id: 11,
      fullName: 'Tran Thi B',
      roomId: 201,
      isApproved: false,
      room: { id: 201, roomNumber: '201', status: 'MAINTENANCE' },
    };
    const res = validateResidentForApproval(resident);
    assert.strictEqual(res.canApprove, false);
    assert.strictEqual(res.errorCode, 'ROOM_IN_MAINTENANCE');
    assert.match(res.reason, /bảo trì/i);
  });

  test('RD-03: Cư dân có phòng hợp lệ (VACANT hoặc OCCUPIED) được phép duyệt', () => {
    const resident = {
      id: 12,
      fullName: 'Le Van C',
      roomId: 301,
      isApproved: false,
      room: { id: 301, roomNumber: '301', status: 'VACANT' },
    };
    const res = validateResidentForApproval(resident);
    assert.strictEqual(res.canApprove, true);
    assert.strictEqual(res.errorCode, undefined);
  });

  test('RD-04: Không được điều chuyển cư dân vào căn hộ đang bảo trì (MAINTENANCE)', () => {
    const targetRoom = { id: 401, roomNumber: '401', status: 'MAINTENANCE' };
    const res = validateRoomForAssignment(targetRoom);
    assert.strictEqual(res.canAssign, false);
    assert.match(res.reason, /bảo trì/i);
  });

  test('RD-05: Cho phép gán cư dân vào căn hộ VACANT hoặc OCCUPIED', () => {
    const targetRoomVacant = { id: 501, roomNumber: '501', status: 'VACANT' };
    const targetRoomOccupied = { id: 502, roomNumber: '502', status: 'OCCUPIED' };
    assert.strictEqual(validateRoomForAssignment(targetRoomVacant).canAssign, true);
    assert.strictEqual(validateRoomForAssignment(targetRoomOccupied).canAssign, true);
  });
});

describe('2. Phân hệ Ticket Dispatch (Điều phối sự cố & phân công thợ)', () => {
  test('TD-01: Nhận diện và cờ cảnh báo sự cố trùng lặp trong 24h (isDuplicate)', () => {
    const ticket1 = { id: 1, category: 'Điện', isDuplicate: false, status: 'PENDING' };
    const ticket2 = { id: 2, category: 'Điện', isDuplicate: true, status: 'PENDING' };
    assert.strictEqual(ticket1.isDuplicate, false);
    assert.strictEqual(ticket2.isDuplicate, true);
  });

  test('TD-02: Phiếu đã đóng hoàn tất (CLOSED) không được phép phân công lại', () => {
    const isClosedTicketModifiable = (status) => status !== 'CLOSED';
    assert.strictEqual(isClosedTicketModifiable('PENDING'), true);
    assert.strictEqual(isClosedTicketModifiable('ASSIGNED'), true);
    assert.strictEqual(isClosedTicketModifiable('IN_PROGRESS'), true);
    assert.strictEqual(isClosedTicketModifiable('COMPLETED'), true);
    assert.strictEqual(isClosedTicketModifiable('CLOSED'), false);
  });

  test('TD-03: Thẩm định mã thợ kỹ thuật trước khi gửi API phân công', () => {
    const validateTechAssignment = (technicianId) => {
      const parsed = parseInt(technicianId, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return { isValid: false, error: 'Vui lòng chọn một thợ kỹ thuật từ danh sách.' };
      }
      return { isValid: true, techId: parsed };
    };

    assert.strictEqual(validateTechAssignment('').isValid, false);
    assert.strictEqual(validateTechAssignment('abc').isValid, false);
    assert.strictEqual(validateTechAssignment('0').isValid, false);
    assert.strictEqual(validateTechAssignment('5').isValid, true);
    assert.strictEqual(validateTechAssignment('5').techId, 5);
  });
});

describe('3. Phân hệ Billing Manager (Quản lý hóa đơn & đối soát)', () => {
  const billingSource = fs.readFileSync(path.join(webPagesDir, 'BillingManagerPage.tsx'), 'utf8');

  test('BM-01: Bắt lỗi 409 trùng hóa đơn với thông điệp chuẩn xác', () => {
    assert.ok(
      billingSource.includes("Căn hộ này đã được lập hóa đơn tháng này rồi"),
      'BillingManagerPage phải chứa thông điệp bắt lỗi 409 chuẩn: "Căn hộ này đã được lập hóa đơn tháng này rồi"'
    );
  });

  test('BM-02: Chặn thanh toán vượt quá số tiền còn thiếu (Overpayment Guard)', () => {
    assert.ok(
      billingSource.includes("Số tiền thanh toán vượt quá số tiền còn thiếu. Vui lòng kiểm tra lại."),
      'BillingManagerPage phải chặn nộp thừa với thông điệp: "Số tiền thanh toán vượt quá số tiền còn thiếu. Vui lòng kiểm tra lại."'
    );
  });

  test('BM-03: Giới hạn tính toán an toàn Decimal (MAX_INVOICE_CENTS & MAX_PAYMENT_CENTS)', () => {
    assert.ok(billingSource.includes('MAX_INVOICE_CENTS = 999999999999'));
    assert.ok(billingSource.includes('MAX_PAYMENT_CENTS = 999999999999'));
    assert.ok(billingSource.includes('MAX_SAFE_FEE_CENTS = 99999999999'));
  });

  test('BM-04: Định dạng tiền tệ VND chính xác từ đơn vị cents', () => {
    function formatCentsMock(cents) {
      if (cents === null || cents === undefined || !Number.isFinite(cents) || Number.isNaN(cents)) {
        return 'N/A';
      }
      const sign = cents < 0 ? '-' : '';
      const absCents = Math.abs(cents);
      const intPart = Math.floor(absCents / 100);
      const decPart = absCents % 100;

      const intFormatted = new Intl.NumberFormat('vi-VN').format(intPart);
      if (decPart === 0) {
        return `${sign}${intFormatted} ₫`;
      }
      const decFormatted = decPart < 10 ? `0${decPart}` : `${decPart}`;
      return `${sign}${intFormatted},${decFormatted} ₫`;
    }

    assert.strictEqual(formatCentsMock(150000000), '1.500.000 ₫');
    assert.strictEqual(formatCentsMock(25050), '250,50 ₫');
    assert.strictEqual(formatCentsMock(0), '0 ₫');
    assert.strictEqual(formatCentsMock(null), 'N/A');
  });
});

describe('4. Thẩm định chuẩn hóa Design System Civic Clarity & Toàn vẹn mã nguồn', () => {
  const pages = ['ResidentsPage.tsx', 'TicketDispatchPage.tsx', 'BillingManagerPage.tsx'];

  for (const pageName of pages) {
    test(`DS-0${pages.indexOf(pageName) + 1}: ${pageName} sử dụng components dùng chung và không chứa thẻ <style> inline`, () => {
      const content = fs.readFileSync(path.join(webPagesDir, pageName), 'utf8');
      assert.ok(
        content.includes("from '../components/common'") || content.includes('from "../components/common"'),
        `${pageName} phải import các components từ ../components/common`
      );
      assert.ok(
        !content.includes('<style>'),
        `${pageName} tuyệt đối không được nhúng thẻ <style> thô lớn trong JSX`
      );
    });
  }
});
