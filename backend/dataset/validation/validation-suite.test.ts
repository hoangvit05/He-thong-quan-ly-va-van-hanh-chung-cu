// =========================================================================
// KIỂM THỬ HỆ THỐNG KIỂM ĐỊNH DATASET (M10.1 RED TEAM FIX TESTS)
// Phân hệ: backend/dataset/validation/validation-suite.test.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: Kiểm toán toàn diện 8 blockers A-F & Determinism
// =========================================================================

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { Role, TicketStatus, InvoiceStatus, RoomStatus, PaymentMethod, Prisma } from '@prisma/client';
import {
  validateDataset,
  validateInMemory,
  validateDatabase,
  runValidationCLI,
  saveValidationReport,
  verifyDatasetDeterminism,
  assertSafeDatabaseValidation,
  parseValidationDatabaseTarget,
  parseValidationAllowlist,
  isValidationProductionTarget,
  DatasetValidationReport,
  DatabaseTarget,
  VALIDATION_CHECK_NAMES,
} from './validate';
import { validateCounts, checkCounts } from './checks/counts.check';
import { validateRelationalIntegrity } from './checks/relational.check';
import { validateFinancialIntegrity, MAX_DECIMAL_12_2 } from './checks/financial.check';
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

function toDecimal(val: Prisma.Decimal | number | string): Prisma.Decimal {
  if (val instanceof Prisma.Decimal) return val;
  return new Prisma.Decimal(val.toString());
}

async function runAllTests() {
  console.log('======================================================');
  console.log('🧪 BẮT ĐẦU CHUỖI KIỂM THỬ DATASET VALIDATION (M10.1)');
  console.log('======================================================');

  // -------------------------------------------------------------------
  // NHÓM 1: BLOCKER A — THUẬT TOÁN TICKET DUPLICATE KHỚP BACKEND
  // -------------------------------------------------------------------
  console.log('\n--- 1. BLOCKER A: THUẬT TOÁN TICKET DUPLICATE (2 CHIỀU & KHỚP BACKEND) ---');

  await runTest('1.1 Baseline generator: Toàn bộ tickets khớp 100% thuật toán lọc trùng hai chiều', () => {
    const snapshot = createBaseValidSnapshot();
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, true, 'Snapshot chuẩn từ generator phải PASS kiểm tra duplicate hai chiều');
  });

  await runTest('1.2 Không loại trừ ticket trước chỉ vì prev.isDuplicate = true (chuỗi duplicate liên tiếp)', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-01T10:00:00Z');

    // Tạo ticket gốc 1 (PENDING)
    const t1 = {
      ...snapshot.tickets[0],
      id: 8001,
      category: 'Điện',
      roomId: 101,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
      updatedAt: new Date(now.getTime()),
    };

    // Tạo ticket trùng 2 (PENDING, gửi sau 1 tiếng) -> isDuplicate = true
    const t2 = {
      ...snapshot.tickets[0],
      id: 8002,
      category: 'Điện',
      roomId: 101,
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 1 * 3600 * 1000),
      updatedAt: new Date(now.getTime() + 1 * 3600 * 1000),
    };

    // Tạo ticket trùng 3 (PENDING, gửi sau 2 tiếng, đối chiếu với t2 là duplicate) -> isDuplicate = true
    const t3 = {
      ...snapshot.tickets[0],
      id: 8003,
      category: 'Điện',
      roomId: 101,
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 2 * 3600 * 1000),
      updatedAt: new Date(now.getTime() + 2 * 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2, t3);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, true, 'Chuỗi trùng lặp t1 -> t2 -> t3 phải được chấp nhận vì backend không loại prev.isDuplicate');
  });

  await runTest('1.3 Sai category: Cùng phòng trong 24h nhưng khác danh mục thì KHÔNG được là duplicate', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-02T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8011,
      category: 'Điện',
      roomId: 102,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8012,
      category: 'Nước', // Khác category
      roomId: 102,
      status: TicketStatus.PENDING,
      isDuplicate: true, // Sai: cố tình gán true
      createdAt: new Date(now.getTime() + 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không tìm thấy phiếu gốc hợp lệ'));
  });

  await runTest('1.4 Sai roomId: Cùng category trong 24h nhưng khác phòng thì KHÔNG được là duplicate', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-03T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8021,
      category: 'Thang máy',
      roomId: 103,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8022,
      category: 'Thang máy',
      roomId: 104, // Khác roomId
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
  });

  await runTest('1.5 Khu vực chung (roomId = null): Phải cùng residentId mới tính là duplicate', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-04T10:00:00Z');
    const resident1 = snapshot.users.find((u) => u.role === Role.RESIDENT)!;
    const resident2 = snapshot.users.filter((u) => u.role === Role.RESIDENT)[1];

    const t1 = {
      ...snapshot.tickets[0],
      id: 8031,
      category: 'Đèn hành lang',
      roomId: null,
      residentId: resident1.id,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8032,
      category: 'Đèn hành lang',
      roomId: null,
      residentId: resident2.id, // Khác residentId khu chung
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
  });

  await runTest('1.6 Ngoài cửa sổ 24 giờ (> 24h): Không được là duplicate', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-05T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8041,
      category: 'Mạng Internet',
      roomId: 105,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8042,
      category: 'Mạng Internet',
      roomId: 105,
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 25 * 3600 * 1000), // Cách 25 giờ (> 24h)
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
  });

  await runTest('1.7 Phiếu trước đã COMPLETED hoặc CLOSED: Không được kích hoạt cờ duplicate', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-06T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8051,
      category: 'Khóa cửa',
      roomId: 106,
      status: TicketStatus.COMPLETED, // Đã xong
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8052,
      category: 'Khóa cửa',
      roomId: 106,
      status: TicketStatus.PENDING,
      isDuplicate: true,
      createdAt: new Date(now.getTime() + 2 * 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
  });

  await runTest('1.8 Kiểm tra hai chiều: Có phiếu trước hợp lệ nhưng isDuplicate = false phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-07T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8061,
      category: 'Rò rỉ nước',
      roomId: 107,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };
    const t2 = {
      ...snapshot.tickets[0],
      id: 8062,
      category: 'Rò rỉ nước',
      roomId: 107,
      status: TicketStatus.PENDING,
      isDuplicate: false, // LỖI: thực tế là trùng nhưng để false
      createdAt: new Date(now.getTime() + 2 * 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('lẽ ra phải là true'));
  });

  await runTest('1.9 Kiểm tra hai chiều: Không có phiếu trước hợp lệ nhưng isDuplicate = true phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-08T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8071,
      category: 'Điều hòa',
      roomId: 108,
      status: TicketStatus.PENDING,
      isDuplicate: true, // LỖI: phiếu đơn độc không có nguồn trùng nhưng để true
      createdAt: new Date(now.getTime()),
    };

    snapshot.tickets.push(t1);
    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không tìm thấy phiếu gốc hợp lệ'));
  });

  // -------------------------------------------------------------------
  // NHÓM 2: BLOCKER B — FINANCIAL DECIMAL(12,2) AUDIT
  // -------------------------------------------------------------------
  console.log('\n--- 2. BLOCKER B: KIỂM TOÁN TÀI CHÍNH DECIMAL(12,2) & SCALE ---');

  await runTest('2.1 Trường có 3 chữ số thập phân ở Invoice fees phải FAIL scale check', () => {
    const snapshot = createBaseValidSnapshot();
    // 3 chữ số thập phân
    snapshot.invoices[0].waterFee = new Prisma.Decimal('123456.789');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('vượt quá 2 chữ số thập phân của DECIMAL(12,2)'));
  });

  await runTest('2.2 Trường có 3 chữ số thập phân ở Payment.amount phải FAIL scale check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.payments[0].amount = new Prisma.Decimal('500000.123');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('vượt quá 2 chữ số thập phân của DECIMAL(12,2)'));
  });

  await runTest('2.3 Giá trị vượt giới hạn tối đa DECIMAL(12,2) (9,999,999,999.99) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].totalAmount = new Prisma.Decimal('10000000000.00'); // 10 tỷ (tràn cột)

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('vượt quá giới hạn tối đa của DECIMAL(12,2)'));
  });

  await runTest('2.4 Giá trị Decimal không hợp lệ (NaN, chuỗi lỗi) phải được bắt an toàn mà không crash', () => {
    const snapshot = createBaseValidSnapshot();
    (snapshot.invoices[0] as any).parkingFee = 'CHUOI_TIEN_TE_KHONG_HOP_LE';

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không thể parse thành Decimal hợp lệ') || result.message.includes('không hợp lệ'));
  });

  await runTest('2.5 Phí âm phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].managementFee = new Prisma.Decimal('-1000.00');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('mang giá trị âm'));
  });

  await runTest('2.6 Payment amount bằng 0 hoặc âm phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.payments[0].amount = new Prisma.Decimal('0.00');

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('bằng 0') || result.message.includes('lớn hơn 0'));
  });

  await runTest('2.7 Invoice totalAmount sai lệch so với tổng 4 phí phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].totalAmount = toDecimal(snapshot.invoices[0].totalAmount).plus(new Prisma.Decimal('1000.00'));

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không khớp tổng 4 khoản phí'));
  });

  await runTest('2.8 PaidAmount sai lệch so với tổng Payment phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const inv = snapshot.invoices.find((i) => i.status === InvoiceStatus.PAID)!;
    inv.paidAmount = toDecimal(inv.paidAmount).minus(new Prisma.Decimal('50000.00'));

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không khớp tổng Payment thực tế'));
  });

  await runTest('2.9 Overpayment (paidAmount > totalAmount) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const inv = snapshot.invoices[0];
    inv.paidAmount = toDecimal(inv.totalAmount).plus(new Prisma.Decimal('100.00'));

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('overpayment'));
  });

  await runTest('2.10 Trạng thái InvoiceStatus không khớp số tiền thực tế phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    const unpaidInv = snapshot.invoices.find((i) => i.status === InvoiceStatus.UNPAID)!;
    unpaidInv.status = InvoiceStatus.PAID;

    const result = validateFinancialIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('InvoiceStatus') || result.message.includes('status = PAID'));
  });

  // -------------------------------------------------------------------
  // NHÓM 3: BLOCKER C — PRIVACY & PII SCANNER
  // -------------------------------------------------------------------
  console.log('\n--- 3. BLOCKER C: QUÉT PII (SĐT CÁCH QUÃNG, CCCD, EMAIL, STK) & MASKING ---');

  await runTest('3.1 Quét phát hiện số điện thoại VN có dấu cách, dấu chấm, gạch ngang và mask an toàn', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.feedbacks[0].content = 'Vui lòng gọi cho tôi qua số 0987.654.321 hoặc +84 912 345 678 khi đến sửa.';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('098***321') || result.message.includes('số điện thoại'));

    // Chứng minh không lộ nguyên số điện thoại
    assert.strictEqual(result.errors?.some((e) => e.includes('0987.654.321')), false);
  });

  await runTest('3.2 Quét phát hiện CCCD 12 số trong văn bản và mask an toàn', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.tickets[0].description = 'Chủ hộ có căn cước công dân số 001200012345 đề nghị xác nhận';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('001200******'));

    // Chứng minh không lộ nguyên CCCD
    assert.strictEqual(result.errors?.some((e) => e.includes('001200012345')), false);
  });

  await runTest('3.3 Quét phát hiện email xuất hiện bất thường trong trường văn bản (Ticket/Feedback)', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.feedbacks[0].title = 'Góp ý từ canhan@example.com';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('xuất hiện bất thường'));
  });

  await runTest('3.4 Quét phát hiện số tài khoản ngân hàng (STK) 8-19 chữ số kèm ngữ cảnh và mask an toàn', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.payments[0].note = 'Chuyển khoản vào STK: 19034567891234 ngân hàng Techcombank';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('tài khoản ngân hàng'));
    assert.ok(result.message.includes('1903****1234'));

    // Chứng minh không lộ nguyên STK
    assert.strictEqual(result.errors?.some((e) => e.includes('19034567891234')), false);
  });

  await runTest('3.5 Password plaintext hoặc không đúng Bcrypt hash phải FAIL và TUYỆT ĐỐI không in giá trị ra log', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.users[0].password = 'MatKhauSieuBiMat123456!';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('chuỗi băm Bcrypt hợp lệ'));
    assert.ok(result.message.includes('[REDACTED]'));

    // Chứng minh không in chuỗi mật khẩu ra errors log
    assert.strictEqual(result.errors?.some((e) => e.includes('MatKhauSieuBiMat123456!')), false);
  });

  // -------------------------------------------------------------------
  // NHÓM 4: BLOCKER D — DATABASE VALIDATION SNAPSHOT & REPEATABLEREAD
  // -------------------------------------------------------------------
  console.log('\n--- 4. BLOCKER D: DATABASE VALIDATION SNAPSHOT & REPEATABLEREAD ISOLATION ---');

  await runTest('4.1 validateDatabase truyền chính xác RepeatableRead isolationLevel vào transaction', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_sandbox';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_sandbox';

    const baseSnapshot = createBaseValidSnapshot();
    let capturedOptions: any = null;
    let findManyCalls = 0;
    let writeCalls = 0;
    let disconnectCalls = 0;

    const mockPrisma: any = {
      $transaction: async (callback: any, options: any) => {
        capturedOptions = options;
        const tx: any = {};
        const models = ['room', 'user', 'invoice', 'payment', 'ticket', 'feedback', 'notification', 'mediaAsset'];
        for (const m of models) {
          tx[m] = {
            findMany: async () => {
              findManyCalls++;
              return (baseSnapshot as any)[m + 's'] ?? (baseSnapshot as any)[m];
            },
            create: () => { writeCalls++; },
            createMany: () => { writeCalls++; },
            update: () => { writeCalls++; },
            updateMany: () => { writeCalls++; },
            upsert: () => { writeCalls++; },
            delete: () => { writeCalls++; },
            deleteMany: () => { writeCalls++; },
          };
        }
        return callback(tx);
      },
      $disconnect: async () => {
        disconnectCalls++;
      },
    };

    const report = await validateDatabase({
      prismaClient: mockPrisma,
      databaseUrl: process.env.DATABASE_URL,
      allowlist: process.env.DATASET_DB_ALLOWLIST,
    });

    assert.strictEqual(
      capturedOptions?.isolationLevel,
      Prisma.TransactionIsolationLevel.RepeatableRead,
      'Transaction bắt buộc phải sử dụng isolationLevel RepeatableRead'
    );
    assert.strictEqual(findManyCalls, 8, 'Phải gọi đủ 8 findMany');
    assert.strictEqual(writeCalls, 0, 'Tuyệt đối 0 write methods được gọi');
    assert.strictEqual(disconnectCalls, 1, '$disconnect bắt buộc phải được gọi');
    assert.strictEqual(report.overallStatus, 'PASS');
  });

  await runTest('4.2 Lỗi trong transaction vẫn bảo đảm đóng Prisma connection ($disconnect)', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_sandbox';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_sandbox';

    let disconnectCalled = false;
    const failingMockPrisma: any = {
      $transaction: async () => {
        throw new Error('DATABASE_CONNECTION_LOST');
      },
      $disconnect: async () => {
        disconnectCalled = true;
      },
    };

    await assert.rejects(
      async () => {
        await validateDatabase({
          prismaClient: failingMockPrisma,
          databaseUrl: process.env.DATABASE_URL,
          allowlist: process.env.DATASET_DB_ALLOWLIST,
        });
      },
      /DATABASE_CONNECTION_LOST/
    );

    assert.strictEqual(disconnectCalled, true, '$disconnect vẫn bắt buộc phải được gọi khi xảy ra lỗi DB');
  });

  // -------------------------------------------------------------------
  // NHÓM 5: BLOCKER E — REPORT CONSISTENCY
  // -------------------------------------------------------------------
  console.log('\n--- 5. BLOCKER E: TÍNH NHẤT QUÁN CỦA BÁO CÁO (REPORT CONSISTENCY) ---');

  await runTest('5.1 Database rỗng: Báo cáo trả về đủ 8 kết quả, passedChecks + failedChecks === 8', async () => {
    restoreEnv();
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DATASET_VALIDATION = 'true';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/apartment_empty_db';
    process.env.DATASET_DB_ALLOWLIST = 'localhost:5432/apartment_empty_db';

    const emptyMockPrisma: any = {
      $transaction: async (cb: any) => {
        const tx: any = {};
        for (const m of ['room', 'user', 'invoice', 'payment', 'ticket', 'feedback', 'notification', 'mediaAsset']) {
          tx[m] = { findMany: async () => [] };
        }
        return cb(tx);
      },
      $disconnect: async () => {},
    };

    const report = await validateDatabase({
      prismaClient: emptyMockPrisma,
      databaseUrl: process.env.DATABASE_URL,
      allowlist: process.env.DATASET_DB_ALLOWLIST,
    });

    assert.strictEqual(report.totalChecks, 8, 'totalChecks phải bằng 8');
    assert.strictEqual(report.passedChecks, 0, 'passedChecks phải bằng 0');
    assert.strictEqual(report.failedChecks, 8, 'failedChecks phải bằng 8');
    assert.strictEqual(report.results.length, 8, 'results.length bắt buộc phải bằng 8 (khắc phục Blocker E)');
    assert.strictEqual(report.passedChecks + report.failedChecks, report.totalChecks);
    assert.strictEqual(report.overallStatus, 'FAIL');
  });

  await runTest('5.2 Một check ném ngoại lệ không làm mất 7 kết quả của các check độc lập còn lại', () => {
    const snapshot = createBaseValidSnapshot();
    // Tạo lỗi cấu trúc gây ngoại lệ trong 1 check (nhưng runner bọc an toàn)
    (snapshot.rooms as any) = null;

    const report = validateDataset(snapshot as any, 'IN_MEMORY');
    assert.strictEqual(report.totalChecks, 8);
    assert.strictEqual(report.results.length, 8);
    assert.strictEqual(report.passedChecks + report.failedChecks, 8);
    assert.strictEqual(report.overallStatus, 'FAIL');
  });

  // -------------------------------------------------------------------
  // NHÓM 6: BLOCKER F — RELATIONAL & UNIQUE CONSTRAINT AUDIT
  // -------------------------------------------------------------------
  console.log('\n--- 6. BLOCKER F: UNIQUE CONSTRAINTS & THÁNG ISO YYYY-MM ---');

  await runTest('6.1 Trùng lặp Room.roomNumber phải FAIL relational check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.rooms[1].roomNumber = snapshot.rooms[0].roomNumber;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('roomNumber') || result.message.includes('trùng lặp'));
  });

  await runTest('6.2 Trùng lặp User.username phải FAIL relational check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.users[1].username = snapshot.users[0].username;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('username bị trùng lặp'));
  });

  await runTest('6.3 Trùng lặp User.email (khác null) phải FAIL relational check', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.users[1].email = snapshot.users[0].email;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('email bị trùng lặp'));
  });

  await runTest('6.4 Trùng lặp ID trong bất kỳ model nào phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[1].id = snapshot.invoices[0].id;

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('ID trùng lặp'));
  });

  await runTest('6.5 Invoice month sai định dạng (ví dụ: 2026-13, 2026-0, chuỗi lỗi) phải FAIL', () => {
    const snapshot = createBaseValidSnapshot();
    snapshot.invoices[0].month = '2026-13'; // Tháng 13 không tồn tại

    const result = validateRelationalIntegrity(snapshot);
    assert.strictEqual(result.passed, false);
    assert.ok(result.message.includes('không đúng định dạng chuẩn YYYY-MM'));
  });

  // -------------------------------------------------------------------
  // NHÓM 7: SECTION 9 — DETERMINISM & JSON REPORT PERSISTENCE
  // -------------------------------------------------------------------
  console.log('\n--- 7. SECTION 9: TÍNH ĐƠN ĐỊNH NGHIỆP VỤ & LƯU BÁO CÁO JSON ---');

  await runTest('7.1 verifyDatasetDeterminism: Hai lần sinh với cùng seed cho dữ liệu nghiệp vụ giống hệt 100%', () => {
    const determinism = verifyDatasetDeterminism(20261111);
    assert.strictEqual(determinism.isDeterministic, true);
    assert.strictEqual(determinism.differences.length, 0);
  });

  await runTest('7.2 saveValidationReport lưu tệp JSON hợp lệ và không chứa credentials hoặc PII nhạy cảm', () => {
    const snapshot = createBaseValidSnapshot();
    const report = validateDataset(snapshot, 'IN_MEMORY');
    const savedPath = saveValidationReport(report);

    assert.ok(fs.existsSync(savedPath), 'Tệp báo cáo JSON phải tồn tại');
    const content = JSON.parse(fs.readFileSync(savedPath, 'utf-8'));

    assert.strictEqual(content.totalChecks, 8);
    assert.strictEqual(content.overallStatus, 'PASS');
    assert.strictEqual(content.results.length, 8);
    // Chứng minh không lộ password hay credentials
    assert.strictEqual(JSON.stringify(content).includes('passwordHash'), false);
  });

  restoreEnv();

  console.log('\n======================================================');
  console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M10.1 ĐẠT CHUẨN!`);
  console.log('======================================================');
}

if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}
