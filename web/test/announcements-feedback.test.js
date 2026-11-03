// =========================================================================
// BỘ KIỂM THỬ TỰ ĐỘNG PHÂN HỆ THÔNG BÁO VÀ HÒM THƯ GÓP Ý
// Phụ trách: Thành viên Oanh (Web Frontend - Announcements & Feedback)
// Phạm vi: Thẩm định payload thông báo, câu trả lời phản hồi, chống Base64 & tính toán KPI
// =========================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAnnouncementPayload,
  validateFeedbackReplyPayload,
  calculateAnnouncementStats,
  calculateFeedbackStats,
  containsBase64,
} from '../src/utils/announcementsFeedbackValidation.ts';

describe('PHÂN HỆ THÔNG BÁO TÒA NHÀ: THẨM ĐỊNH NỘI DUNG PHÁT HÀNH', () => {
  test('TC-AF-01: Chấp thuận payload thông báo chung hợp lệ cho toàn tòa nhà (targetRoom: null)', () => {
    const payload = {
      title: 'Bảo trì hệ thống PCCC định kỳ',
      content: 'Ban Quản Lý sẽ tiến hành kiểm tra còi báo cháy từ 9h đến 11h sáng thứ Bảy.',
      targetRoom: null,
    };
    const res = validateAnnouncementPayload(payload);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.data?.targetRoom, null);
    assert.strictEqual(res.data?.title, 'Bảo trì hệ thống PCCC định kỳ');
  });

  test('TC-AF-02: Chấp thuận payload thông báo gửi riêng tới một căn hộ cụ thể', () => {
    const payload = {
      title: 'Nhắc nhở đóng tiền phí dịch vụ tháng 11',
      content: 'Kính gửi chủ hộ P.1204, hóa đơn dịch vụ căn hộ đã đến hạn thanh toán.',
      targetRoom: '1204',
    };
    const res = validateAnnouncementPayload(payload);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.data?.targetRoom, '1204');
  });

  test('TC-AF-03: Từ chối tiêu đề để trống hoặc chỉ chứa khoảng trắng', () => {
    const emptyRes = validateAnnouncementPayload({
      title: '   ',
      content: 'Nội dung thông báo hợp lệ nhưng tiêu đề rỗng.',
    });
    assert.strictEqual(emptyRes.isValid, false);
    assert.strictEqual(emptyRes.errorCode, 'EMPTY_FIELD');
  });

  test('TC-AF-04: Từ chối tiêu đề quá ngắn (< 3 ký tự)', () => {
    const shortRes = validateAnnouncementPayload({
      title: 'TB',
      content: 'Nội dung thông báo hợp lệ.',
    });
    assert.strictEqual(shortRes.isValid, false);
    assert.strictEqual(shortRes.errorCode, 'TOO_SHORT');
  });

  test('TC-AF-05: Từ chối tiêu đề vượt quá giới hạn 200 ký tự', () => {
    const longTitle = 'T'.repeat(201);
    const res = validateAnnouncementPayload({
      title: longTitle,
      content: 'Nội dung thông báo hợp lệ.',
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'EXCEEDS_MAX_LENGTH');
  });

  test('TC-AF-06: Nghiêm cấm mã hóa Base64 trong tiêu đề thông báo', () => {
    const res = validateAnnouncementPayload({
      title: 'Thông báo data:image/png;base64,iVBORw0KGgo...',
      content: 'Nội dung thông báo hợp lệ.',
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'BASE64_PROHIBITED');
  });

  test('TC-AF-07: Từ chối nội dung thông báo quá ngắn (< 5 ký tự)', () => {
    const res = validateAnnouncementPayload({
      title: 'Tiêu đề thông báo',
      content: 'Alo',
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'TOO_SHORT');
  });

  test('TC-AF-08: Từ chối nội dung thông báo vượt quá 5000 ký tự', () => {
    const longContent = 'C'.repeat(5001);
    const res = validateAnnouncementPayload({
      title: 'Tiêu đề thông báo',
      content: longContent,
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'EXCEEDS_MAX_LENGTH');
  });

  test('TC-AF-09: Nghiêm cấm mã hóa Base64 trong nội dung thông báo', () => {
    const res = validateAnnouncementPayload({
      title: 'Thông báo cắt nước',
      content: 'Kính gửi cư dân, chi tiết tại data:image/jpeg;base64,/9j/4AAQSkZJRg...',
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'BASE64_PROHIBITED');
  });

  test('TC-AF-10: Từ chối tên căn hộ đích vượt quá 50 ký tự', () => {
    const longRoom = 'R'.repeat(51);
    const res = validateAnnouncementPayload({
      title: 'Tiêu đề thông báo',
      content: 'Nội dung thông báo hợp lệ.',
      targetRoom: longRoom,
    });
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'EXCEEDS_MAX_LENGTH');
  });
});

describe('PHÂN HỆ HÒM THƯ GÓP Ý: THẨM ĐỊNH CÂU TRẢ LỜI PHẢN HỒI CỦA BQL', () => {
  test('TC-AF-11: Chấp thuận câu trả lời phản hồi hợp lệ và loại bỏ khoảng trắng thừa', () => {
    const raw = '   Ban Quản Lý đã tiếp nhận và cử nhân viên an ninh kiểm tra ngay. Cảm ơn cư dân.   ';
    const res = validateFeedbackReplyPayload(raw);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.data?.reply, 'Ban Quản Lý đã tiếp nhận và cử nhân viên an ninh kiểm tra ngay. Cảm ơn cư dân.');
  });

  test('TC-AF-12: Từ chối câu trả lời rỗng hoặc quá ngắn (< 2 ký tự)', () => {
    const emptyRes = validateFeedbackReplyPayload('   ');
    assert.strictEqual(emptyRes.isValid, false);
    assert.strictEqual(emptyRes.errorCode, 'EMPTY_FIELD');

    const shortRes = validateFeedbackReplyPayload('K');
    assert.strictEqual(shortRes.isValid, false);
    assert.strictEqual(shortRes.errorCode, 'TOO_SHORT');
  });

  test('TC-AF-13: Từ chối câu trả lời phản hồi vượt quá 2000 ký tự', () => {
    const longReply = 'R'.repeat(2001);
    const res = validateFeedbackReplyPayload(longReply);
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'EXCEEDS_MAX_LENGTH');
  });

  test('TC-AF-14: Từ chối câu trả lời phản hồi chứa chuỗi ảnh Base64', () => {
    const res = validateFeedbackReplyPayload('Đã xử lý xong data:image/png;base64,ABCDEF...');
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.errorCode, 'BASE64_PROHIBITED');
  });
});

describe('TÍNH TOÁN THỐNG KÊ TỔNG QUAN (KPI COUNTERS)', () => {
  test('TC-AF-15: Tính toán chính xác phân loại thông báo toàn tòa nhà và riêng phòng', () => {
    const sampleAnnouncements = [
      { targetRoom: null },
      { targetRoom: '101' },
      { targetRoom: '' },
      { targetRoom: 'A-204' },
      { targetRoom: null },
    ];
    const stats = calculateAnnouncementStats(sampleAnnouncements);
    assert.strictEqual(stats.total, 5);
    assert.strictEqual(stats.allBuilding, 3);
    assert.strictEqual(stats.targetedRoom, 2);
  });

  test('TC-AF-16: Tính toán chính xác phản ánh chờ xử lý và đã giải quyết', () => {
    const sampleFeedbacks = [
      { isResolved: false },
      { isResolved: true },
      { isResolved: true },
      { isResolved: false },
      { isResolved: true },
    ];
    const stats = calculateFeedbackStats(sampleFeedbacks);
    assert.strictEqual(stats.total, 5);
    assert.strictEqual(stats.pending, 2);
    assert.strictEqual(stats.resolved, 3);
  });
});
