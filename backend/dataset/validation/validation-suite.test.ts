// =========================================================================
// KIỂM THỬ HỆ THỐNG KIỂM ĐỊNH DATASET (M10 VALIDATION SUITE TESTS)
// Phân hệ: backend/dataset/validation/validation-suite.test.ts
// Đặc tả: Milestone 10 — Dataset Validation & Final Acceptance Tests
// =========================================================================

import * as assert from 'assert';
import { Role, TicketStatus, InvoiceStatus, RoomStatus, PaymentMethod, Prisma } from '@prisma/client';
import {
  validateDataset,
  validateInMemory,
  validateDatabase,
  runValidationCLI,
  assertSafeDatabaseValidation,
  parseValidationDatabaseTarget,
  parseValidationAllowlist,
  isValidationProductionTarget,
  DatasetValidationReport,
  DatabaseTarget,
} from './validate';
import { validateCounts, checkCounts } from './checks/counts.check';
import { validateRelationalIntegrity } from './checks/relational.check';
import { validateFinancialIntegrity } from './checks/financial.check';
import { validateTicketIntegrity } from './checks/ticket.check';
import { validateFeedbackIntegrity } from './checks/feedback.check';
import { validateNotificationIntegrity } from './checks/notification.check';
import { validateMediaIntegrity } from './checks/media.check';
import { validatePrivacyIntegrity } from './checks/privacy.check';
import { DatasetSnapshot } from './checks/types';
import { generateEntireDataset } from '../seed/index';

let passedTests = 0;
let totalTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

/**
 * Tạo một bản sao snapshot hoàn toàn hợp lệ từ in-memory generator
 */
function createBaseValidSnapshot(): DatasetSnapshot {
  const dataset = generateEntireDataset({ seed: 20261111 });
  // Deep clone thông qua JSON để không làm ảnh hưởng lẫn nhau giữa các test
  const snapshot: DatasetSnapshot = {
    rooms: dataset.rooms.map((r) => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })),
    users: dataset.users.map((u) => ({ ...u, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) })),
    invoices: dataset.invoices.map((i) => ({
      ...i,
      managementFee: new Prisma.Decimal(i.managementFee.toString()),
      parkingFee: new Prisma.Decimal(i.parkingFee.toString()),
      waterFee: new Prisma.Decimal(i.waterFee.toString()),
      otherFee: new Prisma.Decimal(i.otherFee.toString()),
      totalAmount: new Prisma.Decimal(i.totalAmount.toString()),
      paidAmount: new Prisma.Decimal(i.paidAmount.toString()),
      dueDate: i.dueDate ? new Date(i.dueDate) : null,
      createdAt: new Date(i.createdAt),
      updatedAt: new Date(i.updatedAt),
    })),
    payments: dataset.payments.map((p) => ({
      ...p,
      amount: new Prisma.Decimal(p.amount.toString()),
      paidAt: new Date(p.paidAt),
    })),
    tickets: dataset.tickets.map((t) => ({ ...t, createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt) })),
    feedbacks: dataset.feedbacks.map((f) => ({ ...f, createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt) })),
    notifications: dataset.notifications.map((n) => ({ ...n, createdAt: new Date(n.createdAt) })),
    mediaAssets: dataset.mediaAssets.map((m) => ({ ...m })),
  };
  return snapshot;
}

const originalEnv = { ...process.env };
function restoreEnv() {
  process.env = { ...originalEnv };
}

async function runAllTests() {
  console.log('======================================================');
  console.log('🧪 BẮT ĐẦU CHUỖI KIỂM THỬ DATASET VALIDATION (M10)');
  console.log('======================================================');

  // -------------------------------------------------------------------
  // NHÓM 1: VALID BASELINE & SUITE AGGREGATION (Test 1 - 5)
  // -------------------------------------------------------------------
  console.log('\n--- 1. TỔNG HỢP RUNNER & BASELINE KIỂM ĐỊNH ---');

  await runTest('1.1 Snapshot hợp lệ đầy đủ từ generator phải PASS 100% cả 8 checks', () => {
    const snapshot = createBaseValidSnapshot();
    const report = validateDataset(snapshot, 'IN_MEMORY');

    assert.strictEqual(report.overallStatus, 'PASS', 'Overall status phải là PASS');
    assert.strictEqual(report.totalChecks, 8, 'Phải có đúng 8 nhóm checks');
    assert.strictEqual(report.passedChecks, 8, '8 checks đều phải PASS');
    assert.strictEqual(report.failedChecks, 0, '0 checks FAIL');
  });

  await runTest('1.2 Runner tổng hợp đúng số lượng checks PASS/FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Cố tình làm sai 1 check: vi phạm quy mô counts
    snapshot.rooms.pop();

    const report = validateDataset(snapshot, 'IN_MEMORY');
    assert.strictEqual(report.totalChecks, 8);
    assert.strictEqual(report.failedChecks >= 1, true, 'Ít nhất 1 check bị fail');
    assert.strictEqual(report.passedChecks + report.failedChecks, 8);
  });

  await runTest('1.3 Runner trả overallStatus = FAIL khi có dù chỉ 1 check lỗi', () => {
    const snapshot = createBaseValidSnapshot();
    // Tạo 1 lỗi feedback
    snapshot.feedbacks[0].roomId = 99999;

    const report = validateDataset(snapshot, 'IN_MEMORY');
    assert.strictEqual(report.overallStatus, 'FAIL');
  });

  await runTest('1.4 Nhiều lỗi đồng thời từ các check độc lập không bị nuốt lỗi', () => {
    const snapshot = createBaseValidSnapshot();
    // Lỗi 1: Counts
    snapshot.rooms = snapshot.rooms.slice(0, 50);
    // Lỗi 2: Financial
    snapshot.invoices[0].totalAmount = new Prisma.Decimal('99999999');
    // Lỗi 3: Media
    snapshot.mediaAssets.push({ id: 1, publicId: 'fake_asset' });

    const report = validateDataset(snapshot, 'IN_MEMORY');
    assert.strictEqual(report.overallStatus, 'FAIL');
    assert.strictEqual(report.failedChecks >= 3, true, 'Phải ghi nhận ít nhất 3 nhóm check fail');

    const countsCheck = report.results.find((r) => r.name.includes('Counts'));
    const financialCheck = report.results.find((r) => r.name.includes('Financial'));
    const mediaCheck = report.results.find((r) => r.name.includes('Media'));

    assert.strictEqual(countsCheck?.passed, false, 'Counts check phải fail');
    assert.strictEqual(financialCheck?.passed, false, 'Financial check phải fail');
    assert.strictEqual(mediaCheck?.passed, false, 'Media check phải fail');
  });

  await runTest('1.5 In-memory runner tạo ra báo cáo hợp lệ', () => {
    const report = validateInMemory({ seed: 20261111 });
    assert.strictEqual(report.mode, 'IN_MEMORY');
    assert.strictEqual(report.overallStatus, 'PASS');
    assert.strictEqual(report.modelCounts.rooms, 100);
  });

  await runTest('1.6 CLI runner trả về exit code 0 khi toàn bộ checks PASS', async () => {
    const originalArgv = [...process.argv];
    try {
      process.argv = ['node', 'validate.ts'];
      const exitCode = await runValidationCLI();
      assert.strictEqual(exitCode, 0, 'CLI phải trả về exit code 0 khi toàn bộ checks PASS');
    } finally {
      process.argv = originalArgv;
    }
  });

  await runTest('1.7 CLI runner trả về exit code 1 khi có lỗi an toàn hoặc vi phạm', async () => {
    const originalArgv = [...process.argv];
    try {
      // Chạy ở mode database mà không có cấu hình an toàn
      process.argv = ['node', 'validate.ts', '--mode=database'];
      delete process.env.ALLOW_DATASET_VALIDATION;
      const exitCode = await runValidationCLI();
      assert.strictEqual(exitCode, 1, 'CLI phải trả về exit code 1 khi có lỗi kiểm định');
    } finally {
      process.argv = originalArgv;
    }
  });

  // -------------------------------------------------------------------
  // NHÓM 2: COUNTS INTEGRITY (Test 6 - 8)
  // -------------------------------------------------------------------
  console.log('\n--- 2. KIỂM ĐỊNH QUY MÔ SỐ LƯỢNG (COUNTS INTEGRITY) ---');

  await runTest('2.1 Counts sai số lượng mục tiêu phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.rooms.push({
      id: 9999,
      roomNumber: '9999',
      floor: 99,
      area: 80,
      status: RoomStatus.VACANT,
      createdAt: new Date(),
    });

    const result = validateCounts(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('Room'));
  });

  await runTest('2.2 MediaAsset khác 0 bản ghi phải FAIL checkCounts', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.mediaAssets.push({ id: 101, publicId: 'test_asset' });

    const result = validateCounts(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('MediaAsset'));
  });

  await runTest('2.3 Số lượng âm hoặc NaN phải FAIL ngay lập tức', () => {
    const invalidCounts: any = {
      rooms: -5,
      users: { total: 100, admin: 1, bql: 2, technician: 5, resident: 92 },
      tickets: 175,
      invoices: NaN,
      payments: 400,
      feedbacks: 40,
      notifications: 25,
      mediaAssets: 0,
    };

    const result = checkCounts(invalidCounts);
    assert.strictEqual(result.passed, false);
    assert.ok(result.errors && result.errors.length >= 2);
  });

  // -------------------------------------------------------------------
  // NHÓM 3: RELATIONAL INTEGRITY (Test 9 - 13)
  // -------------------------------------------------------------------
  console.log('\n--- 3. KIỂM ĐỊNH TOÀN VẸN QUAN HỆ & KHÓA NGOẠI ---');

  await runTest('3.1 Missing FK và Payment mồ côi phải bị phát hiện', () => {
    const snapshot = createBaseValidSnapshot();
    // Tạo 1 payment mồ côi trỏ vào invoiceId không tồn tại
    snapshot.payments[0].invoiceId = 999999;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('Payment mồ côi') || result.message.includes('tham chiếu invoiceId 999999'));
  });

  await runTest('3.2 Nhân sự ADMIN/BQL/TECHNICIAN bị gán roomId phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const admin = snapshot.users.find((u) => u.role === Role.ADMIN)!;
    admin.roomId = 1;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không được phép có roomId'));
  });

  await runTest('3.3 Sai roomId của Feedback (không khớp resident.roomId) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const fb = snapshot.feedbacks[0];
    const resident = snapshot.users.find((u) => u.id === fb.residentId)!;
    // Đổi roomId của feedback khác với căn hộ của cư dân
    fb.roomId = (resident.roomId ?? 1) + 1;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không khớp với resident.roomId'));
  });

  await runTest('3.4 Sai targetRoom Notification (không khớp roomNumber thực tế) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.notifications[0].targetRoom = 'ROOM_KHONG_TON_TAI_9999';

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không tồn tại trong danh sách'));
  });

  await runTest('3.5 Trùng lặp cặp [roomId, month] trong Invoice phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Tạo bản ghi thứ 2 trùng roomId và month của bản ghi thứ 1
    snapshot.invoices[1].roomId = snapshot.invoices[0].roomId;
    snapshot.invoices[1].month = snapshot.invoices[0].month;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('trùng lặp cặp [roomId'));
  });

  // -------------------------------------------------------------------
  // NHÓM 4: FINANCIAL INTEGRITY (Test 14 - 18)
  // -------------------------------------------------------------------
  console.log('\n--- 4. KIỂM ĐỊNH TOÀN VẸN TÀI CHÍNH & TIỀN TỆ ---');

  await runTest('4.1 Invoice totalAmount sai lệch so với tổng 4 khoản phí phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].totalAmount = new Prisma.Decimal('1000000.00');
    snapshot.invoices[0].managementFee = new Prisma.Decimal('200000.00');
    snapshot.invoices[0].parkingFee = new Prisma.Decimal('100000.00');
    snapshot.invoices[0].waterFee = new Prisma.Decimal('50000.00');
    snapshot.invoices[0].otherFee = new Prisma.Decimal('0.00');
    // Tổng thực = 350,000 nhưng totalAmount = 1,000,000

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không khớp tổng 4 khoản phí'));
  });

  await runTest('4.2 paidAmount sai lệch so với tổng Payment phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Tìm hóa đơn đã có thanh toán
    const inv = snapshot.invoices.find((i) => i.status === InvoiceStatus.PAID)!;
    inv.paidAmount = new Prisma.Decimal('500.00');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không khớp tổng Payment thực tế'));
  });

  await runTest('4.3 Overpayment (paidAmount > totalAmount) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const inv = snapshot.invoices[0];
    inv.paidAmount = toDecimal(inv.totalAmount).plus(new Prisma.Decimal('50000.00'));

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('overpayment'));
  });

  await runTest('4.4 Sai lệch trạng thái InvoiceStatus phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Hóa đơn chưa thanh toán nhưng đặt PAID
    const unpaidInv = snapshot.invoices.find((i) => i.status === InvoiceStatus.UNPAID)!;
    unpaidInv.status = InvoiceStatus.PAID;

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('InvoiceStatus') || result.message.includes('status = PAID'));
  });

  await runTest('4.5 Khoản phí âm hoặc Payment.amount <= 0 phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].waterFee = new Prisma.Decimal('-50000.00');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('waterFee âm'));
  });

  // -------------------------------------------------------------------
  // NHÓM 5: TICKET INTEGRITY (Test 19 - 21)
  // -------------------------------------------------------------------
  console.log('\n--- 5. KIỂM ĐỊNH SỰ CỐ & VÒNG ĐỜI TICKET ---');

  await runTest('5.1 Ticket gán technicianId sai vai trò phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const assignedTicket = snapshot.tickets.find((t) => t.status === TicketStatus.ASSIGNED)!;
    const resident = snapshot.users.find((u) => u.role === Role.RESIDENT)!;
    assignedTicket.technicianId = resident.id;

    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không phải TECHNICIAN'));
  });

  await runTest('5.2 Rating ngoài khoảng 1-5 hoặc ticket chưa CLOSED nhưng đã có rating phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Ticket đang sửa nhưng cư dân chấm điểm sớm
    const inProgressTicket = snapshot.tickets.find((t) => t.status === TicketStatus.IN_PROGRESS)!;
    inProgressTicket.rating = 5;

    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('chỉ được phép chấm điểm khi đã CLOSED'));
  });

  await runTest('5.3 Duplicate flag không hợp lệ (không có phiếu gốc trong 24h) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    // Đánh dấu 1 ticket bất kỳ là duplicate nhưng danh mục và thời gian không có phiếu gốc
    const ticket = snapshot.tickets[0];
    ticket.isDuplicate = true;
    ticket.category = 'DANH_MUC_KHONG_TRUNG_LAP_999999';

    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không tìm thấy phiếu gốc hợp lệ trong vòng 24 giờ'));
  });

  // -------------------------------------------------------------------
  // NHÓM 6: FEEDBACK & NOTIFICATION (Test 22 - 23)
  // -------------------------------------------------------------------
  console.log('\n--- 6. KIỂM ĐỊNH FEEDBACK & NOTIFICATION ---');

  await runTest('6.1 Feedback có title/content vi phạm giới hạn độ dài hoặc Base64 phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.feedbacks[0].title = 'ab'; // quá ngắn < 3 ký tự

    const result = validateFeedbackIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('yêu cầu trong khoảng 3 đến 200 ký tự'));
  });

  await runTest('6.2 Notification có author không phải ADMIN/BQL phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const resident = snapshot.users.find((u) => u.role === Role.RESIDENT)!;
    snapshot.notifications[0].authorId = resident.id;

    const result = validateNotificationIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không phải ADMIN hoặc BQL'));
  });

  // -------------------------------------------------------------------
  // NHÓM 7: MEDIA ASSET & PRIVACY/PII (Test 24 - 27)
  // -------------------------------------------------------------------
  console.log('\n--- 7. KIỂM ĐỊNH MEDIA ASSET & BẢO MẬT PII ---');

  await runTest('7.1 MediaAsset có isConfirmed = true hoặc giả mạo Cloudinary URL phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.mediaAssets.push({
      id: 1,
      publicId: 'tickets/fake_public_id',
      url: 'https://res.cloudinary.com/demo/image/upload/v1234/fake.jpg',
      isConfirmed: true,
    });

    const result = validateMediaIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('Zero-Asset') || result.message.includes('isConfirmed = true'));
  });

  await runTest('7.2 URL media chứa Base64 data URI phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.tickets[0].mediaUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const result = validateMediaIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('mediaUrl không hợp lệ'));
  });

  await runTest('7.3 Phone non-null, email cá nhân (@gmail.com) hoặc CCCD 12 số phải FAIL privacy check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.users[0].email = 'admin_canhan@gmail.com';
    snapshot.tickets[0].description = 'Sự cố phát sinh liên quan đến CCCD 001200001234 của chủ hộ';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('email công cộng bị cấm') || result.message.includes('CCCD'));
  });

  await runTest('7.4 Mật khẩu plaintext hoặc không phải định dạng Bcrypt hash phải FAIL privacy check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.users[0].password = 'MatKhauPlaintext123@';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('chuỗi băm Bcrypt hợp lệ'));

    // Kiểm tra chứng minh không log password ra thông điệp lỗi
    assert.strictEqual(
      result.errors?.some((e) => e.includes('MatKhauPlaintext123@')),
      false,
      'Tuyệt đối không được in plaintext password ra thông điệp lỗi'
    );
  });

  // -------------------------------------------------------------------
  // NHÓM 8: DATABASE VALIDATION SAFETY GUARD & READ-ONLY ENFORCEMENT (Test 28 - 32)
  // -------------------------------------------------------------------
  console.log('\n--- 8. DATABASE SAFETY GUARD & READ-ONLY ENFORCEMENT ---');

  await runTest('8.1 Safety Guard từ chối môi trường PRODUCTION', () => {
    restoreEnv();
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_dev';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_dev';

    assert.throws(
      () => {
        assertSafeDatabaseValidation();
      },
      /Tuyệt đối từ chối chạy kiểm định cơ sở dữ liệu trên môi trường PRODUCTION/
    );
  });

  await runTest('8.2 Safety Guard từ chối khi thiếu biến xác nhận ALLOW_DATASET_VALIDATION', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DATASET_VALIDATION;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_dev';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_dev';

    assert.throws(
      () => {
        assertSafeDatabaseValidation();
      },
      /Yêu cầu bắt buộc phải bật cờ xác nhận ALLOW_DATASET_VALIDATION=true/
    );
  });

  await runTest('8.3 Safety Guard từ chối khi target không nằm trong allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_target_la';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_sandbox_duoc_phep';

    assert.throws(
      () => {
        assertSafeDatabaseValidation();
      },
      /không nằm trong allowlist được phép kiểm định/
    );
  });

  await runTest('8.4 Safety Guard từ chối hostname/database chứa keyword production kể cả khi có trong allowlist', () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/production-db';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/production-db';

    assert.throws(
      () => {
        assertSafeDatabaseValidation();
      },
      /Phát hiện dấu hiệu PRODUCTION trong target/
    );
  });

  await runTest('8.5 Database validation CHỈ gọi read methods (findMany), KHÔNG BAO GIỜ gọi write methods', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_sandbox';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_sandbox';

    const baseSnapshot = createBaseValidSnapshot();
    let writeMethodCalled = false;
    let findManyCallCount = 0;
    let disconnectCalled = false;

    // Stateful Mock Prisma Client để kiểm chứng hành vi của validateDatabase
    const mockPrisma = {
      $transaction: async (txCallback: any) => {
        const txMock = {
          room: {
            findMany: async () => {
              findManyCallCount++;
              return baseSnapshot.rooms;
            },
            create: () => { writeMethodCalled = true; throw new Error('WRITE FORBIDDEN'); },
            update: () => { writeMethodCalled = true; throw new Error('WRITE FORBIDDEN'); },
            delete: () => { writeMethodCalled = true; throw new Error('WRITE FORBIDDEN'); },
            deleteMany: () => { writeMethodCalled = true; throw new Error('WRITE FORBIDDEN'); },
          },
          user: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.users; },
            create: () => { writeMethodCalled = true; },
          },
          invoice: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.invoices; },
          },
          payment: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.payments; },
          },
          ticket: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.tickets; },
          },
          feedback: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.feedbacks; },
          },
          notification: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.notifications; },
          },
          mediaAsset: {
            findMany: async () => { findManyCallCount++; return baseSnapshot.mediaAssets; },
          },
        };
        return txCallback(txMock);
      },
      $disconnect: async () => {
        disconnectCalled = true;
      },
    };

    const report = await validateDatabase({
      prismaClient: mockPrisma,
      databaseUrl: process.env.DATABASE_URL,
      allowlist: process.env.DATASET_DB_ALLOWLIST,
    });

    assert.strictEqual(writeMethodCalled, false, 'Tuyệt đối không được gọi bất kỳ write method nào');
    assert.strictEqual(findManyCallCount, 8, 'Phải gọi đủ 8 lệnh findMany cho 8 models');
    assert.strictEqual(disconnectCalled, true, '$disconnect bắt buộc phải được gọi');
    assert.strictEqual(report.mode, 'DATABASE');
    assert.strictEqual(report.overallStatus, 'PASS');
  });

  await runTest('8.6 Database validation trên database rỗng trả về FAIL và không tự động seed', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_empty_db';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_empty_db';

    let disconnectCalled = false;
    const mockEmptyPrisma = {
      $transaction: async (txCallback: any) => {
        const emptyTx = {
          room: { findMany: async () => [] },
          user: { findMany: async () => [] },
          invoice: { findMany: async () => [] },
          payment: { findMany: async () => [] },
          ticket: { findMany: async () => [] },
          feedback: { findMany: async () => [] },
          notification: { findMany: async () => [] },
          mediaAsset: { findMany: async () => [] },
        };
        return txCallback(emptyTx);
      },
      $disconnect: async () => {
        disconnectCalled = true;
      },
    };

    const report = await validateDatabase({
      prismaClient: mockEmptyPrisma,
      databaseUrl: process.env.DATABASE_URL,
      allowlist: process.env.DATASET_DB_ALLOWLIST,
    });

    assert.strictEqual(report.overallStatus, 'FAIL');
    assert.ok(report.results[0].message.includes('Cơ sở dữ liệu hoàn toàn rỗng'));
    assert.strictEqual(disconnectCalled, true, '$disconnect phải được gọi');
  });

  restoreEnv();

  console.log('\n======================================================');
  console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M10 ĐẠT CHUẨN!`);
  console.log('======================================================');
}

function toDecimal(val: Prisma.Decimal | number | string): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val.toString());
}

if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}
