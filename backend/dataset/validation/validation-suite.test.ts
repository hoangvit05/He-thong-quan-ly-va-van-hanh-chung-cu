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
  compareDatasetSnapshots,
  canonicalizeValue,
  CANONICAL_SNAPSHOT_MODELS,
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
import { validateTicketIntegrity, isMatchingPriorTicket } from './checks/ticket.check';
import { validateFeedbackIntegrity } from './checks/feedback.check';
import { validateNotificationIntegrity } from './checks/notification.check';
import { validateMediaIntegrity } from './checks/media.check';
import {
  validatePrivacyIntegrity,
  maskUsername,
  maskEmail,
  maskPhone,
  maskCCCD,
  maskBankAccount,
} from './checks/privacy.check';
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
    assert.ok(result.message.includes('không tìm thấy phiếu'));
  });

  await runTest('1.10 Khác title nhưng cùng category và scope: vẫn duplicate theo chuẩn controller lines 408-428', () => {
    const snapshot = createBaseValidSnapshot();
    const now = new Date('2026-06-08T10:00:00Z');

    const t1 = {
      ...snapshot.tickets[0],
      id: 8081,
      title: 'Hỏng vòi nước bồn rửa mặt',
      category: 'Cấp thoát nước',
      roomId: 105,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      createdAt: new Date(now.getTime()),
    };

    const t2 = {
      ...snapshot.tickets[0],
      id: 8082,
      title: 'Rò rỉ ống nước khu vệ sinh cực kỳ nghiêm trọng (tiêu đề hoàn toàn khác)',
      category: 'Cấp thoát nước',
      roomId: 105,
      status: TicketStatus.PENDING,
      isDuplicate: true, // Backend controller không so sánh title nên vẫn là duplicate
      createdAt: new Date(now.getTime() + 3 * 3600 * 1000),
    };

    snapshot.tickets.push(t1, t2);
    // isMatchingPriorTicket phải trả về true dù title khác nhau
    assert.strictEqual(isMatchingPriorTicket(t2, t1), true, 'Khác title nhưng cùng category và roomId phải là duplicate');

    const result = validateTicketIntegrity(snapshot);
    assert.strictEqual(result.passed, true, 'Validation phải PASS khi t2.isDuplicate = true');
  });

  await runTest('1.11 Boundary 24 giờ: đúng 24h00m00s (gte) là duplicate, 24h00m00s + 1ms (> 24h) không là duplicate', () => {
    const now = new Date('2026-06-08T12:00:00.000Z');
    const exact24hAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const beyond24hAgo = new Date(now.getTime() - 24 * 3600 * 1000 - 1);

    const baseCandidate = {
      id: 8090,
      title: 'Sự cố điện',
      category: 'Hệ thống điện',
      description: 'Mô tả sự cố hệ thống điện căn hộ',
      roomId: 101,
      residentId: 10,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      rating: null,
      ratingComment: null,
      materials: null,
      mediaUrl: null,
      completedMediaUrl: null,
      technicianId: null,
      createdAt: now,
      updatedAt: now,
    };

    const priorExact = {
      ...baseCandidate,
      id: 8089,
      createdAt: exact24hAgo,
      updatedAt: exact24hAgo,
    };

    const priorBeyond = {
      ...baseCandidate,
      id: 8088,
      createdAt: beyond24hAgo,
      updatedAt: beyond24hAgo,
    };

    // Đúng mốc 24h00m00s: backend dùng { gte: oneDayAgo } nên vẫn tính là trong cửa sổ
    assert.strictEqual(isMatchingPriorTicket(baseCandidate, priorExact), true, 'Đúng mốc 24h phải là duplicate (gte)');

    // Vượt quá 24h đúng 1ms: nằm ngoài cửa sổ
    assert.strictEqual(isMatchingPriorTicket(baseCandidate, priorBeyond), false, 'Vượt quá 24h dù chỉ 1ms KHÔNG được tính là duplicate');
  });

  await runTest('1.12 isMatchingPriorTicket: So sánh đầy đủ các trường hợp phân loại, trạng thái và scope', () => {
    const now = new Date('2026-06-08T12:00:00.000Z');
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000);

    const candidateRoom = {
      id: 8100,
      title: 'Hỏng đèn',
      category: 'Chiếu sáng',
      description: 'Mô tả hỏng đèn phòng khách',
      roomId: 202,
      residentId: 15,
      status: TicketStatus.PENDING,
      isDuplicate: false,
      rating: null,
      ratingComment: null,
      materials: null,
      mediaUrl: null,
      completedMediaUrl: null,
      technicianId: null,
      createdAt: now,
      updatedAt: now,
    };

    const candidateCommon = {
      ...candidateRoom,
      id: 8101,
      roomId: null, // Khu vực chung
      residentId: 15,
    };

    // 1. Khác category: không duplicate
    const priorDiffCat = { ...candidateRoom, id: 8095, category: 'Thang máy', createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, priorDiffCat), false);

    // 2. Khác roomId: không duplicate
    const priorDiffRoom = { ...candidateRoom, id: 8096, roomId: 203, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, priorDiffRoom), false);

    // 3. Status COMPLETED hoặc CLOSED: không duplicate
    const priorCompleted = { ...candidateRoom, id: 8097, status: TicketStatus.COMPLETED, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, priorCompleted), false);
    const priorClosed = { ...candidateRoom, id: 8098, status: TicketStatus.CLOSED, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, priorClosed), false);

    // 4. Status PENDING, ASSIGNED, IN_PROGRESS: đều duplicate
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, { ...candidateRoom, id: 8091, status: TicketStatus.PENDING, createdAt: oneHourAgo }), true);
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, { ...candidateRoom, id: 8092, status: TicketStatus.ASSIGNED, createdAt: oneHourAgo }), true);
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, { ...candidateRoom, id: 8093, status: TicketStatus.IN_PROGRESS, createdAt: oneHourAgo }), true);

    // 5. Common area: cùng residentId & roomId = null -> duplicate; khác residentId -> không duplicate
    const priorCommonSame = { ...candidateCommon, id: 8094, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateCommon, priorCommonSame), true);

    const priorCommonDiffResident = { ...candidateCommon, id: 8095, residentId: 16, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateCommon, priorCommonDiffResident), false);

    // 6. Prior ticket đã mang isDuplicate = true vẫn là ứng viên duplicate hợp lệ
    const priorAlreadyDup = { ...candidateRoom, id: 8096, isDuplicate: true, createdAt: oneHourAgo };
    assert.strictEqual(isMatchingPriorTicket(candidateRoom, priorAlreadyDup), true);
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

  await runTest('3.6 Username và Email xuất hiện trong lỗi phải được che giấu (mask) - không để lộ nguyên văn', () => {
    const snapshot = createBaseValidSnapshot();
    // Gán thông tin vi phạm PII
    snapshot.users[0].username = 'nguyen_van_a_vip';
    snapshot.users[0].phone = '0987123456';
    snapshot.users[0].email = 'nguyenvana@gmail.com';

    const result = validatePrivacyIntegrity(snapshot);
    assert.strictEqual(result.passed, false);

    // Bắt buộc: KHÔNG ĐƯỢC để lộ nguyên văn username và email vi phạm
    const allErrorsText = (result.errors || []).join(' ');
    assert.strictEqual(allErrorsText.includes('nguyen_van_a_vip'), false, 'Không được lộ nguyên văn username');
    assert.strictEqual(allErrorsText.includes('nguyenvana@gmail.com'), false, 'Không được lộ nguyên văn email');

    // Phải chứa username và email đã được mask an toàn
    assert.ok(allErrorsText.includes(maskUsername('nguyen_van_a_vip')), 'Phải chứa masked username');
    assert.ok(allErrorsText.includes(maskEmail('nguyenvana@gmail.com')), 'Phải chứa masked email');
  });

  await runTest('3.7 maskEmail che giấu cả tên và domain nhạy cảm, không để lộ nguyên domain', () => {
    // Domain nhạy cảm nhiều cấp
    const masked1 = maskEmail('secret_ceo@superprivatebank.com.vn');
    assert.strictEqual(masked1, 'se***@su***.vn');
    assert.strictEqual(masked1.includes('superprivatebank'), false);

    // Domain công cộng phổ biến
    const masked2 = maskEmail('admin@gmail.com');
    assert.strictEqual(masked2, 'ad***@gm***.com');
    assert.strictEqual(masked2.includes('gmail'), false);

    // Domain nội bộ
    const masked3 = maskEmail('resident@chungcu.internal');
    assert.strictEqual(masked3, 're***@ch***.internal');

    // Kiểm tra maskUsername
    assert.strictEqual(maskUsername('admin'), 'ad***n');
    assert.strictEqual(maskUsername('resident99'), 're***9');
    assert.strictEqual(maskUsername('ab'), 'a*');
    assert.strictEqual(maskUsername(''), '***');
  });

  await runTest('3.8 Exception chứa PII (email, SĐT, STK) bị chặn hoàn toàn, không lọt vào report hay JSON file', () => {
    const snapshot = createBaseValidSnapshot();
    // Giả lập ngoại lệ nhạy cảm bằng cách làm hỏng mảng users khiến runner throw
    // Tạo custom property gây throw có chứa PII
    const sensitiveErrorMsg = 'Sensitive internal error with admin_secret@bank.com phone 0987654321 and STK 123456789012';
    Object.defineProperty(snapshot, 'users', {
      get() {
        throw new Error(sensitiveErrorMsg);
      },
    });

    const report = validateDataset(snapshot, 'IN_MEMORY');
    assert.strictEqual(report.overallStatus, 'FAIL');

    const reportStr = JSON.stringify(report);
    // Bắt buộc: raw error message từ ngoại lệ KHÔNG được xuất hiện trong report
    assert.strictEqual(reportStr.includes('admin_secret@bank.com'), false, 'Không được lộ email từ exception');
    assert.strictEqual(reportStr.includes('0987654321'), false, 'Không được lộ phone từ exception');
    assert.strictEqual(reportStr.includes('123456789012'), false, 'Không được lộ STK từ exception');
    assert.strictEqual(reportStr.includes(sensitiveErrorMsg), false, 'Không được lộ raw err.message');

    // Báo cáo vẫn phải xác định được check nào bị lỗi
    const failingResult = report.results.find((r) => !r.passed);
    assert.ok(failingResult, 'Phải ghi nhận check bị thất bại');
    assert.ok(failingResult.message.includes('Validation check failed unexpectedly; internal error details redacted for privacy.'));
  });

  await runTest('3.9 saveValidationReport không chứa raw error message, stack trace, passwordHash hay secret', () => {
    const snapshot = createBaseValidSnapshot();
    const report = validateDataset(snapshot, 'IN_MEMORY');
    const savedPath = saveValidationReport(report);

    const savedContent = fs.readFileSync(savedPath, 'utf-8');
    assert.strictEqual(savedContent.includes('passwordHash'), false);
    assert.strictEqual(savedContent.includes('stack'), false);
    assert.strictEqual(savedContent.includes('[REDACTED_BCRYPT_HASH]'), false); // Vì snapshot chuẩn không có lỗi Bcrypt
    const parsed = JSON.parse(savedContent);
    assert.strictEqual(parsed.totalChecks, 8);
    assert.strictEqual(parsed.passedChecks, 8);
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

  await runTest('7.1 verifyDatasetDeterminism: Hai lần sinh với cùng seed cho dữ liệu nghiệp vụ giống hệt 100% trên cả 8 models', () => {
    const determinism = verifyDatasetDeterminism(20261111);
    assert.strictEqual(determinism.isDeterministic, true);
    assert.strictEqual(determinism.differences.length, 0);
    assert.strictEqual(determinism.totalRecordsCompared, 1440, 'Bắt buộc so sánh đủ 1440 bản ghi của cả 8 models');
    assert.strictEqual(determinism.comparedModels.length, 8);
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

  await runTest('7.3 Thay đổi bất kỳ trường nghiệp vụ nào trong 8 models đều bị so sánh phát hiện', () => {
    // 1. Thay đổi Room status (trường không nằm trong bộ test cũ)
    const s1 = createBaseValidSnapshot();
    const s2_room = createBaseValidSnapshot();
    s2_room.rooms[0].status = RoomStatus.MAINTENANCE;
    const r1 = compareDatasetSnapshots(s1, s2_room);
    assert.strictEqual(r1.isDeterministic, false);
    assert.ok(r1.differences.some((d) => d.includes("Model 'rooms'") && d.includes("'status'")));

    // 2. Thay đổi User fullName
    const s2_user = createBaseValidSnapshot();
    s2_user.users[0].fullName = 'Họ Tên Đã Bị Thay Đổi';
    const r2 = compareDatasetSnapshots(s1, s2_user);
    assert.strictEqual(r2.isDeterministic, false);
    assert.ok(r2.differences.some((d) => d.includes("Model 'users'") && d.includes("'fullName'")));

    // 3. Thay đổi Ticket materials
    const s2_ticket = createBaseValidSnapshot();
    s2_ticket.tickets[0].materials = 'Vật tư kê khai khác biệt';
    const r3 = compareDatasetSnapshots(s1, s2_ticket);
    assert.strictEqual(r3.isDeterministic, false);
    assert.ok(r3.differences.some((d) => d.includes("Model 'tickets'") && d.includes("'materials'")));

    // 4. Thay đổi Invoice waterFee
    const s2_inv = createBaseValidSnapshot();
    s2_inv.invoices[0].waterFee = new Prisma.Decimal('999999.00');
    const r4 = compareDatasetSnapshots(s1, s2_inv);
    assert.strictEqual(r4.isDeterministic, false);
    assert.ok(r4.differences.some((d) => d.includes("Model 'invoices'") && d.includes("'waterFee'")));

    // 5. Thay đổi Payment note
    const s2_pay = createBaseValidSnapshot();
    s2_pay.payments[0].note = 'Ghi chú thanh toán đột biến';
    const r5 = compareDatasetSnapshots(s1, s2_pay);
    assert.strictEqual(r5.isDeterministic, false);
    assert.ok(r5.differences.some((d) => d.includes("Model 'payments'") && d.includes("'note'")));

    // 6. Thay đổi Feedback reply
    const s2_fb = createBaseValidSnapshot();
    s2_fb.feedbacks[0].reply = 'Phản hồi mới từ BQL';
    const r6 = compareDatasetSnapshots(s1, s2_fb);
    assert.strictEqual(r6.isDeterministic, false);
    assert.ok(r6.differences.some((d) => d.includes("Model 'feedbacks'") && d.includes("'reply'")));

    // 7. Thay đổi Notification targetRoom
    const s2_notif = createBaseValidSnapshot();
    s2_notif.notifications[0].targetRoom = 'P-999';
    const r7 = compareDatasetSnapshots(s1, s2_notif);
    assert.strictEqual(r7.isDeterministic, false);
    assert.ok(r7.differences.some((d) => d.includes("Model 'notifications'") && d.includes("'targetRoom'")));

    // 8. Thay đổi số lượng MediaAssets (Zero-Asset policy)
    const s2_media = createBaseValidSnapshot();
    s2_media.mediaAssets.push({
      id: 1,
      publicId: 'fake_media_01',
      url: 'https://res.cloudinary.com/demo/image/upload/fake_media_01.jpg',
      resourceType: 'image',
      deliveryType: 'authenticated',
      purpose: 'tickets',
      bytes: 10240,
      format: 'jpg',
      uploaderId: 1,
      isConfirmed: true,
      confirmedAt: new Date(),
    });
    const r8 = compareDatasetSnapshots(s1, s2_media);
    assert.strictEqual(r8.isDeterministic, false);
    assert.ok(r8.differences.some((d) => d.includes("Model 'mediaAssets'") && d.includes('số lượng bản ghi không khớp')));
  });

  await runTest('7.4 Decimal giữ nguyên precision chính xác khi so sánh (không qua JS floating-point)', () => {
    const d1 = new Prisma.Decimal('9999999999.99');
    const d2 = new Prisma.Decimal('9999999999.98');

    const c1 = canonicalizeValue(d1);
    const c2 = canonicalizeValue(d2);

    assert.strictEqual(typeof c1, 'string', 'Canonical Decimal phải là string');
    assert.strictEqual(c1, '9999999999.99');
    assert.strictEqual(c2, '9999999999.98');
    assert.notStrictEqual(c1, c2, 'Decimal khác biệt ở phần lẻ thập phân phải khác nhau');
  });

  await runTest('7.5 Date được canonicalize nhất quán và phân biệt null vs undefined', () => {
    const dateObj = new Date('2026-06-01T15:30:00.000Z');
    assert.strictEqual(canonicalizeValue(dateObj), '2026-06-01T15:30:00.000Z');

    assert.strictEqual(canonicalizeValue(null), null);
    assert.strictEqual(canonicalizeValue(undefined), '__UNDEFINED__');
    assert.notStrictEqual(canonicalizeValue(null), canonicalizeValue(undefined), 'null và undefined phải được phân biệt rõ');
  });

  await runTest('7.6 Thứ tự object keys không làm ảnh hưởng tính đơn định', () => {
    const objA = { z: 1, a: 'abc', m: true, d: [3, 2, 1] };
    const objB = { d: [3, 2, 1], m: true, a: 'abc', z: 1 };

    const cA = canonicalizeValue(objA);
    const cB = canonicalizeValue(objB);

    assert.strictEqual(JSON.stringify(cA), JSON.stringify(cB), 'Object khác thứ tự keys sau khi canonicalize phải có JSON giống hệt nhau');
  });

  await runTest('7.7 Danh sách loại trừ excludeFields hoạt động chính xác khi có lý do kỹ thuật rõ ràng', () => {
    const s1 = createBaseValidSnapshot();
    const s2 = createBaseValidSnapshot();

    // Thay đổi trường User.password (mô phỏng Bcrypt salt ngẫu nhiên)
    s2.users[0].password = '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr';

    // Khi không có excludeFields: phát hiện khác biệt
    const resWithoutExclude = compareDatasetSnapshots(s1, s2);
    assert.strictEqual(resWithoutExclude.isDeterministic, false);
    assert.ok(resWithoutExclude.differences.some((d) => d.includes("'password'")));

    // Khi loại trừ User.password (do lý do kỹ thuật Bcrypt random salt)
    const resWithExclude = compareDatasetSnapshots(s1, s2, {
      excludeFields: { users: ['password'] },
    });
    assert.strictEqual(resWithExclude.isDeterministic, true, 'Khi loại trừ đúng password thì snapshot phải đơn định 100%');

    // Nhưng nếu đổi thêm trường fullName (không nằm trong excludeFields): VẪN PHẢI BỊ PHÁT HIỆN
    s2.users[0].fullName = 'Họ Tên Sai';
    const resPartial = compareDatasetSnapshots(s1, s2, {
      excludeFields: { users: ['password'] },
    });
    assert.strictEqual(resPartial.isDeterministic, false, 'Trường không nằm trong excludeFields vẫn phải bị phát hiện');
    assert.ok(resPartial.differences.some((d) => d.includes("'fullName'")));
  });

  restoreEnv();

  console.log('\n======================================================');
  console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M10.1.1 ĐẠT CHUẨN!`);
  console.log('======================================================');
}

if (require.main === module) {
  runAllTests().catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
}
