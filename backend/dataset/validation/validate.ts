// =========================================================================
// HỆ THỐNG KIỂM ĐỊNH CHẤT LƯỢNG DATASET (DATASET VALIDATION RUNNER)
// Phân hệ: backend/dataset/validation/validate.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: RepeatableRead Isolation, Report Consistency & Persistence
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, Prisma, Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import { generateEntireDataset, sanitizeDatabaseUrl } from '../seed/index';
import { DEFAULT_DEMO_PASSWORD, hashPasswordSync } from '../seed/utils/password';
import { checkCounts, validateCounts } from './checks/counts.check';
import { checkRelationalIntegrity, validateRelationalIntegrity } from './checks/relational.check';
import { checkFinancialIntegrity, validateFinancialIntegrity } from './checks/financial.check';
import { checkTicketIntegrity, validateTicketIntegrity } from './checks/ticket.check';
import { checkMediaIntegrity, validateMediaIntegrity } from './checks/media.check';
import { validateFeedbackIntegrity } from './checks/feedback.check';
import { validateNotificationIntegrity } from './checks/notification.check';
import { validatePrivacyIntegrity } from './checks/privacy.check';
import { CheckResult, DatasetSnapshot, ModelCounts } from './checks/types';

export {
  CheckResult,
  DatasetSnapshot,
  ModelCounts,
  checkCounts,
  checkRelationalIntegrity,
  checkFinancialIntegrity,
  checkTicketIntegrity,
  checkMediaIntegrity,
};

export interface DatabaseTarget {
  host: string;
  port: number;
  database: string;
}

export interface DatasetValidationReport {
  timestamp: string;
  mode: 'IN_MEMORY' | 'DATABASE';
  targetDatabase?: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  overallStatus: 'PASS' | 'FAIL';
  modelCounts: ModelCounts;
  results: CheckResult[];
}

export interface DatabaseValidationOptions {
  prismaClient?: any;
  databaseUrl?: string;
  allowlist?: string | (string | DatabaseTarget)[];
}

/**
 * Định dạng chuỗi target host:port/db
 */
export function formatDatabaseTarget(target: DatabaseTarget): string {
  return `${target.host}:${target.port}/${target.database}`;
}

/**
 * Phân tích cú pháp chuỗi target đơn lẻ (host:port/db hoặc url)
 */
export function parseValidationDatabaseTarget(rawUrl: string): DatabaseTarget {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('DATABASE_URL không được để trống.');
  }

  try {
    const url = new URL(trimmed);
    const dbName = url.pathname.replace(/^\//, '').split('?')[0].trim().toLowerCase();
    if (!dbName) {
      throw new Error(`DATABASE_URL thiếu tên database: ${sanitizeDatabaseUrl(trimmed)}`);
    }

    return {
      host: url.hostname.toLowerCase(),
      port: url.port ? parseInt(url.port, 10) : 5432,
      database: dbName,
    };
  } catch (err: any) {
    if (err.message && err.message.includes('DATABASE_URL')) throw err;
    throw new Error(`Định dạng DATABASE_URL không hợp lệ: ${sanitizeDatabaseUrl(trimmed)}`);
  }
}

/**
 * Phân tích allowlist database target
 */
export function parseValidationAllowlist(
  raw?: string | (string | DatabaseTarget)[]
): DatabaseTarget[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : raw.split(',').map((s) => s.trim());
  const result: DatabaseTarget[] = [];

  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'host' in item && 'database' in item) {
      result.push({
        host: item.host.toLowerCase(),
        port: item.port ? Number(item.port) : 5432,
        database: item.database.toLowerCase(),
      });
      continue;
    }

    const trimmed = (item as string).trim();
    if (!trimmed) continue;

    try {
      if (trimmed.startsWith('postgres://') || trimmed.startsWith('postgresql://')) {
        const parsed = new URL(trimmed);
        result.push({
          host: parsed.hostname.toLowerCase(),
          port: parsed.port ? parseInt(parsed.port, 10) : 5432,
          database: parsed.pathname.replace(/^\//, '').split('?')[0].trim().toLowerCase(),
        });
      } else {
        const dummyUrl = new URL(`http://${trimmed}`);
        result.push({
          host: dummyUrl.hostname.toLowerCase(),
          port: dummyUrl.port ? parseInt(dummyUrl.port, 10) : 5432,
          database: dummyUrl.pathname.replace(/^\//, '').split('?')[0].trim().toLowerCase(),
        });
      }
    } catch {
      // Bỏ qua item lỗi cú pháp trong allowlist
    }
  }

  return result;
}

/**
 * Kiểm tra các dấu hiệu nhận diện môi trường production
 */
export function isValidationProductionTarget(target: DatabaseTarget): boolean {
  const prodKeywords = [
    'production',
    'prod',
    'apartment-main',
    'release-db',
    'live',
    'master',
    'main-db',
  ];

  const hostLower = target.host.toLowerCase();
  const dbLower = target.database.toLowerCase();

  for (const kw of prodKeywords) {
    if (hostLower.includes(kw) || dbLower.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Database Safety Guard độc lập cho Validation Runner
 */
export function assertSafeDatabaseValidation(
  rawUrl?: string,
  allowlistRaw?: string | (string | DatabaseTarget)[]
): DatabaseTarget {
  // 1. Kiểm tra môi trường Node
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    throw new Error(
      '[FATAL VALIDATION SAFETY] Tuyệt đối từ chối chạy kiểm định cơ sở dữ liệu trên môi trường PRODUCTION (NODE_ENV=production)!'
    );
  }

  // 2. Bắt buộc có cờ xác nhận độc lập cho validation: ALLOW_DATASET_VALIDATION === 'true'
  const optIn = process.env.ALLOW_DATASET_VALIDATION;
  if (optIn !== 'true') {
    throw new Error(
      '[FATAL VALIDATION SAFETY] Yêu cầu bắt buộc phải bật cờ xác nhận ALLOW_DATASET_VALIDATION=true trước khi kiểm định cơ sở dữ liệu.'
    );
  }

  // 3. Phân tích target từ DATABASE_URL
  const effectiveUrl = rawUrl || process.env.DATABASE_URL;
  if (!effectiveUrl) {
    throw new Error('[FATAL VALIDATION SAFETY] Thiếu biến môi trường DATABASE_URL.');
  }

  const currentTarget = parseValidationDatabaseTarget(effectiveUrl);

  // 4. Kiểm tra từ chối các dấu hiệu production
  if (isValidationProductionTarget(currentTarget)) {
    throw new Error(
      `[FATAL VALIDATION SAFETY] Phát hiện dấu hiệu PRODUCTION trong target '${formatDatabaseTarget(
        currentTarget
      )}'. Từ chối kiểm định theo chính sách Fail-Closed!`
    );
  }

  // 5. Kiểm tra bắt buộc cấu hình Allowlist
  const effectiveAllowlistRaw = allowlistRaw ?? process.env.DATASET_DB_ALLOWLIST;
  const allowlist = parseValidationAllowlist(effectiveAllowlistRaw);

  if (allowlist.length === 0) {
    throw new Error(
      '[FATAL VALIDATION SAFETY] Thiếu cấu hình DATASET_DB_ALLOWLIST. Hệ thống từ chối kết nối database khi chưa có danh sách allowlist được xác nhận!'
    );
  }

  const isAllowed = allowlist.some(
    (allowed) =>
      allowed.host === currentTarget.host &&
      allowed.port === currentTarget.port &&
      allowed.database === currentTarget.database
  );

  if (!isAllowed) {
    throw new Error(
      `[FATAL VALIDATION SAFETY] Database target '${formatDatabaseTarget(
        currentTarget
      )}' không nằm trong allowlist được phép kiểm định. ` +
        `Danh sách allowlist: [${allowlist.map(formatDatabaseTarget).join(', ')}]. ` +
        `Từ chối thực thi theo chính sách Fail-Closed!`
    );
  }

  return currentTarget;
}

/**
 * Danh sách 8 tên tiêu chuẩn kiểm định chính thức
 */
export const VALIDATION_CHECK_NAMES = [
  'Counts Integrity Check',
  'Relational Integrity Check',
  'Financial Consistency Check',
  'Ticket Consistency Check',
  'Feedback Integrity Check',
  'Notification Integrity Check',
  'Media Integrity Check',
  'Privacy & PII Integrity Check',
] as const;

/**
 * Động cơ kiểm định tính toàn vẹn thuần túy (Pure In-Memory Validation Engine)
 * Chạy toàn bộ 8 bài kiểm tra độc lập và bảo đảm tính nhất quán của báo cáo (Blocker E Fix)
 */
export function validateDataset(
  snapshot: DatasetSnapshot,
  mode: 'IN_MEMORY' | 'DATABASE' = 'IN_MEMORY',
  targetDatabase?: string
): DatasetValidationReport {
  // 1. Thu thập số lượng thực tế an toàn (defensive)
  let modelCounts: ModelCounts = {
    rooms: 0,
    users: { total: 0, admin: 0, bql: 0, technician: 0, resident: 0 },
    tickets: 0,
    invoices: 0,
    payments: 0,
    feedbacks: 0,
    notifications: 0,
    mediaAssets: 0,
  };

  try {
    const usersList = Array.isArray(snapshot?.users) ? snapshot.users : [];
    const adminCount = usersList.filter((u) => u?.role === Role.ADMIN).length;
    const bqlCount = usersList.filter((u) => u?.role === Role.BQL).length;
    const techCount = usersList.filter((u) => u?.role === Role.TECHNICIAN).length;
    const residentCount = usersList.filter((u) => u?.role === Role.RESIDENT).length;

    modelCounts = {
      rooms: Array.isArray(snapshot?.rooms) ? snapshot.rooms.length : 0,
      users: {
        total: usersList.length,
        admin: adminCount,
        bql: bqlCount,
        technician: techCount,
        resident: residentCount,
      },
      tickets: Array.isArray(snapshot?.tickets) ? snapshot.tickets.length : 0,
      invoices: Array.isArray(snapshot?.invoices) ? snapshot.invoices.length : 0,
      payments: Array.isArray(snapshot?.payments) ? snapshot.payments.length : 0,
      feedbacks: Array.isArray(snapshot?.feedbacks) ? snapshot.feedbacks.length : 0,
      notifications: Array.isArray(snapshot?.notifications) ? snapshot.notifications.length : 0,
      mediaAssets: Array.isArray(snapshot?.mediaAssets) ? snapshot.mediaAssets.length : 0,
    };
  } catch {
    // Nếu snapshot bị lỗi cấu trúc getter/property, modelCounts giữ mặc định 0 an toàn
  }

  // 2. Chạy 8 nhóm kiểm định tính toàn vẹn
  // Mỗi check được bọc try-catch riêng để một ngoại lệ bất thường không làm mất kết quả các check khác (Blocker E)
  const checkRunners: Array<{ name: string; run: () => CheckResult }> = [
    { name: 'Counts Integrity Check', run: () => validateCounts(snapshot) },
    { name: 'Relational Integrity Check', run: () => validateRelationalIntegrity(snapshot) },
    { name: 'Financial Consistency Check', run: () => validateFinancialIntegrity(snapshot) },
    { name: 'Ticket Consistency Check', run: () => validateTicketIntegrity(snapshot) },
    { name: 'Feedback Integrity Check', run: () => validateFeedbackIntegrity(snapshot) },
    { name: 'Notification Integrity Check', run: () => validateNotificationIntegrity(snapshot) },
    { name: 'Media Integrity Check', run: () => validateMediaIntegrity(snapshot) },
    { name: 'Privacy & PII Integrity Check', run: () => validatePrivacyIntegrity(snapshot) },
  ];

  const results: CheckResult[] = [];
  for (const runner of checkRunners) {
    try {
      results.push(runner.run());
    } catch (err: any) {
      // Bảo vệ quyền riêng tư (Milestone 10.1.1): Tuyệt đối KHÔNG đưa raw err.message hoặc raw object
      // từ exception không tin cậy vào report. Chỉ ghi thông báo tổng quát đã sanitize.
      results.push({
        name: runner.name,
        passed: false,
        message: 'Validation check failed unexpectedly; internal error details redacted for privacy.',
        violationsCount: 1,
        errors: [
          `Kiểm tra '${runner.name}' gặp ngoại lệ bất thường và đã bị gián đoạn an toàn. Chi tiết nhạy cảm đã được loại bỏ.`,
        ],
      });
    }
  }

  const passedChecks = results.filter((r) => r.passed).length;
  const failedChecks = results.length - passedChecks;

  return {
    timestamp: new Date().toISOString(),
    mode,
    targetDatabase,
    totalChecks: results.length,
    passedChecks,
    failedChecks,
    overallStatus: failedChecks === 0 ? 'PASS' : 'FAIL',
    modelCounts,
    results,
  };
}

/**
 * Kiểm định In-Memory trên dataset sinh bởi generator
 */
export function validateInMemory(options: { seed?: number } = {}): DatasetValidationReport {
  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;
  const generated = generateEntireDataset({ seed });

  const snapshot: DatasetSnapshot = {
    rooms: generated.rooms,
    users: generated.users,
    invoices: generated.invoices,
    payments: generated.payments,
    tickets: generated.tickets,
    feedbacks: generated.feedbacks,
    notifications: generated.notifications,
    mediaAssets: generated.mediaAssets,
  };

  return validateDataset(snapshot, 'IN_MEMORY');
}

/**
 * Kiểm định Read-Only trên cơ sở dữ liệu PostgreSQL
 * Sử dụng RepeatableRead Isolation để chụp snapshot nhất quán tuyệt đối (Blocker D Fix)
 */
export function validateDatabase(
  options: DatabaseValidationOptions = {}
): Promise<DatasetValidationReport> {
  // 1. Kiểm tra an toàn database trước mọi kết nối
  const target = assertSafeDatabaseValidation(options.databaseUrl, options.allowlist);
  const targetStr = formatDatabaseTarget(target);

  const prisma = options.prismaClient ?? new PrismaClient();

  return (async () => {
    try {
      // 2. Đọc toàn bộ snapshot dữ liệu trong một Transaction Read-Only nhất quán
      // Sử dụng Prisma.TransactionIsolationLevel.RepeatableRead (Blocker D)
      // TUYỆT ĐỐI CHỈ DÙNG findMany, KHÔNG dùng write/update/delete/mutation
      const [rooms, users, invoices, payments, tickets, feedbacks, notifications, mediaAssets] =
        await prisma.$transaction(
          async (tx: any) => {
            const r = await tx.room.findMany();
            const u = await tx.user.findMany();
            const inv = await tx.invoice.findMany();
            const p = await tx.payment.findMany();
            const t = await tx.ticket.findMany();
            const f = await tx.feedback.findMany();
            const n = await tx.notification.findMany();
            const ma = await tx.mediaAsset.findMany();

            return [r, u, inv, p, t, f, n, ma];
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 30000,
            maxWait: 5000,
          }
        );

      // 3. Nếu database rỗng: Báo cáo FAIL với cấu trúc nhất quán 8 kết quả (Blocker E Fix)
      const totalRecords =
        rooms.length +
        users.length +
        invoices.length +
        payments.length +
        tickets.length +
        feedbacks.length +
        notifications.length +
        mediaAssets.length;

      if (totalRecords === 0) {
        const emptyResults: CheckResult[] = VALIDATION_CHECK_NAMES.map((name) => ({
          name,
          passed: false,
          message:
            'Cơ sở dữ liệu hoàn toàn rỗng (0 bản ghi). Hệ thống từ chối kiểm định theo chính sách Fail-Closed.',
          violationsCount: 1,
          errors: ['Cơ sở dữ liệu rỗng, không có dữ liệu để kiểm định.'],
        }));

        return {
          timestamp: new Date().toISOString(),
          mode: 'DATABASE',
          targetDatabase: targetStr,
          totalChecks: 8,
          passedChecks: 0,
          failedChecks: 8,
          overallStatus: 'FAIL',
          modelCounts: {
            rooms: 0,
            users: { total: 0, admin: 0, bql: 0, technician: 0, resident: 0 },
            tickets: 0,
            invoices: 0,
            payments: 0,
            feedbacks: 0,
            notifications: 0,
            mediaAssets: 0,
          },
          results: emptyResults,
        };
      }

      // 4. Chạy bộ kiểm định trên snapshot đã đọc
      const snapshot: DatasetSnapshot = {
        rooms,
        users,
        invoices,
        payments,
        tickets,
        feedbacks,
        notifications,
        mediaAssets,
      };

      return validateDataset(snapshot, 'DATABASE', targetStr);
    } finally {
      // 5. Luôn đóng Prisma connection trong mọi trường hợp
      if (prisma && typeof prisma.$disconnect === 'function') {
        await prisma.$disconnect();
      }
    }
  })();
}

/**
 * Lưu báo cáo kiểm định thành tệp JSON phục vụ nghiệm thu (Section 9 & Milestone 10.1.1)
 * Che giấu thông tin nhạy cảm, credentials, mật khẩu băm và dữ liệu PII
 */
export function saveValidationReport(
  report: DatasetValidationReport,
  outputDir = path.resolve(__dirname, '../reports')
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Sanitized report không chứa credentials, passwords, raw stacks, hay tokens
  const sanitizedResults = (report.results || []).map((r) => {
    const cleanErrors = (r.errors || []).map((errStr) => {
      if (typeof errStr !== 'string') return 'Invalid error entry';
      // Khử chuỗi Bcrypt hash nếu vô tình lọt vào errors
      return errStr.replace(/\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_BCRYPT_HASH]');
    });
    return {
      ...r,
      errors: cleanErrors,
    };
  });

  const sanitizedReport: DatasetValidationReport = {
    ...report,
    targetDatabase: report.targetDatabase
      ? report.targetDatabase.replace(/:[^:@]+@/, ':***@')
      : undefined,
    results: sanitizedResults,
  };

  const reportFilePath = path.join(outputDir, 'validation-report.json');
  fs.writeFileSync(reportFilePath, JSON.stringify(sanitizedReport, null, 2), 'utf-8');
  return reportFilePath;
}

/**
 * Danh sách 8 models chuẩn cần kiểm định tính đơn định (Canonical Models)
 */
export const CANONICAL_SNAPSHOT_MODELS = [
  'rooms',
  'users',
  'tickets',
  'invoices',
  'payments',
  'feedbacks',
  'notifications',
  'mediaAssets',
] as const;

export type CanonicalModelName = (typeof CANONICAL_SNAPSHOT_MODELS)[number];

export interface SnapshotComparisonOptions {
  excludeFields?: Partial<Record<CanonicalModelName, string[]>>;
}

export interface DeterminismComparisonResult {
  isDeterministic: boolean;
  differences: string[];
  comparedModels: string[];
  totalRecordsCompared: number;
  excludedFields: Partial<Record<CanonicalModelName, string[]>>;
}

/**
 * Chuẩn hóa giá trị nghiệp vụ để so sánh đơn định (Milestone 10.1.1):
 * - Prisma Decimal: chuyển thành chuỗi thập phân chính xác (dec.toString()), giữ nguyên precision, không qua Number.
 * - Date: chuyển thành ISO string (date.toISOString()).
 * - null: giữ nguyên null.
 * - undefined: chuyển thành ký hiệu '__UNDEFINED__' để phân biệt rõ với null.
 * - Object: sắp xếp keys theo thứ tự alphabet ổn định, đệ quy chuẩn hóa các giá trị.
 * - Array: đệ quy chuẩn hóa từng phần tử.
 */
export function canonicalizeValue(val: any): any {
  if (val === null) return null;
  if (val === undefined) return '__UNDEFINED__';

  // Prisma Decimal
  if (
    val instanceof Prisma.Decimal ||
    (typeof val === 'object' && typeof val.toFixed === 'function' && typeof val.isDecimal === 'function')
  ) {
    return val.toString();
  }

  // Date
  if (val instanceof Date) {
    return val.toISOString();
  }

  // Primitive
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
    return val;
  }

  // Array
  if (Array.isArray(val)) {
    return val.map((item) => canonicalizeValue(item));
  }

  // Object (stable key order)
  if (typeof val === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalizeValue(val[key]);
    }
    return result;
  }

  return String(val);
}

/**
 * So sánh toàn diện hai Dataset Snapshot trên toàn bộ 8 models và tất cả các trường nghiệp vụ (Milestone 10.1.1):
 * - Room (id, roomNumber, floor, area, status, createdAt, updatedAt)
 * - User (id, username, password, fullName, phone, email, role, roomId, isApproved, createdAt, updatedAt)
 * - Ticket (id, title, category, description, status, isDuplicate, rating, ratingComment, materials, mediaUrl, residentId, technicianId, roomId, createdAt, updatedAt)
 * - Invoice (id, roomId, month, managementFee, parkingFee, waterFee, otherFee, totalAmount, paidAmount, status, dueDate, createdAt, updatedAt)
 * - Payment (id, invoiceId, amount, method, status, transactionCode, note, paidAt, createdAt, updatedAt)
 * - Feedback (id, title, content, reply, isResolved, residentId, roomId, createdAt, updatedAt)
 * - Notification (id, title, content, authorId, targetRoom, createdAt, updatedAt)
 * - MediaAsset (Zero-Asset policy)
 */
export function compareDatasetSnapshots(
  ds1: DatasetSnapshot,
  ds2: DatasetSnapshot,
  options: SnapshotComparisonOptions = {}
): DeterminismComparisonResult {
  const diffs: string[] = [];
  const excludeFields = options.excludeFields || {};
  let totalRecordsCompared = 0;

  for (const model of CANONICAL_SNAPSHOT_MODELS) {
    const list1 = (ds1[model] as any[]) || [];
    const list2 = (ds2[model] as any[]) || [];

    if (list1.length !== list2.length) {
      diffs.push(`Model '${model}' số lượng bản ghi không khớp: ds1=${list1.length}, ds2=${list2.length}`);
      continue;
    }

    totalRecordsCompared += list1.length;

    // Sắp xếp ổn định theo ID để so sánh record-by-record
    const sorted1 = [...list1].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const sorted2 = [...list2].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const excludedForModel = new Set(excludeFields[model] || []);

    for (let i = 0; i < sorted1.length; i++) {
      const r1 = sorted1[i];
      const r2 = sorted2[i];
      const recordId = r1?.id ?? i;

      // Lấy tập hợp tất cả các keys của cả 2 records
      const allKeys = Array.from(new Set([...Object.keys(r1 || {}), ...Object.keys(r2 || {})])).sort();

      for (const key of allKeys) {
        if (excludedForModel.has(key)) {
          continue; // Bỏ qua trường được liệt kê trong danh sách loại trừ có lý do kỹ thuật
        }

        const v1 = r1?.[key];
        const v2 = r2?.[key];

        // So sánh trực tiếp Decimal nếu cả 2 là Decimal
        if (v1 instanceof Prisma.Decimal && v2 instanceof Prisma.Decimal) {
          if (!v1.equals(v2)) {
            diffs.push(
              `Model '${model}' [id=${recordId}] field '${key}' Decimal mismatch: '${v1.toString()}' !== '${v2.toString()}'`
            );
          }
          continue;
        }

        // So sánh Date bằng getTime()
        if (v1 instanceof Date && v2 instanceof Date) {
          if (v1.getTime() !== v2.getTime()) {
            diffs.push(
              `Model '${model}' [id=${recordId}] field '${key}' Date mismatch: '${v1.toISOString()}' !== '${v2.toISOString()}'`
            );
          }
          continue;
        }

        // Chuẩn hóa canonicalize cho các kiểu dữ liệu khác
        const c1 = canonicalizeValue(v1);
        const c2 = canonicalizeValue(v2);

        const s1 = JSON.stringify(c1);
        const s2 = JSON.stringify(c2);

        if (s1 !== s2) {
          diffs.push(
            `Model '${model}' [id=${recordId}] field '${key}' mismatch: ${s1} !== ${s2}`
          );
        }
      }
    }
  }

  return {
    isDeterministic: diffs.length === 0,
    differences: diffs,
    comparedModels: [...CANONICAL_SNAPSHOT_MODELS],
    totalRecordsCompared,
    excludedFields: excludeFields,
  };
}

/**
 * Xác minh tính đơn định (Determinism) giữa hai lượt sinh dữ liệu (Section 9 & Milestone 10.1.1)
 * Sử dụng fixed password hash để so sánh đầy đủ 100% tất cả các trường của cả 8 models mà KHÔNG loại trừ trường nào.
 */
export function verifyDatasetDeterminism(options?: number | {
  seed?: number;
  fixedPasswordHash?: string;
  excludeFields?: Partial<Record<CanonicalModelName, string[]>>;
}): DeterminismComparisonResult {
  const seed = typeof options === 'number' ? options : (options?.seed ?? DATASET_CONFIG.RANDOM_SEED);
  const fixedHash =
    typeof options === 'object' && options?.fixedPasswordHash
      ? options.fixedPasswordHash
      : hashPasswordSync(DEFAULT_DEMO_PASSWORD);
  const excludeFields = typeof options === 'object' ? options?.excludeFields : undefined;

  const ds1 = generateEntireDataset({ seed, passwordHash: fixedHash });
  const ds2 = generateEntireDataset({ seed, passwordHash: fixedHash });

  return compareDatasetSnapshots(ds1, ds2, { excludeFields });
}

/**
 * Định dạng và in báo cáo kiểm định ra màn hình console (Sanitized Output)
 */
export function printValidationReport(report: DatasetValidationReport): void {
  console.log('================================================================');
  console.log('📋  BÁO CÁO KIỂM TOÁN TÍNH TOÀN VẸN VÀ BẢO MẬT DATASET (M10.1)');
  console.log('================================================================');
  console.log(`Thời điểm kiểm toán:  ${report.timestamp}`);
  console.log(`Chế độ thực thi:      ${report.mode}`);
  if (report.targetDatabase) {
    console.log(`Database mục tiêu:    ${report.targetDatabase}`);
  }
  console.log(`Tổng số tiêu chuẩn:   ${report.totalChecks}`);
  console.log(`Số tiêu chuẩn ĐẠT:    ${report.passedChecks}`);
  console.log(`Số tiêu chuẩn LỖI:    ${report.failedChecks}`);
  console.log(`KẾT QUẢ CHUNG:        ${report.overallStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log('----------------------------------------------------------------');
  console.log('📊 THỐNG KÊ SỐ LƯỢNG BẢN GHI (8 PRISMA MODELS):');
  console.log(`  - Room:             ${report.modelCounts.rooms}`);
  console.log(
    `  - User:             ${report.modelCounts.users.total} (Admin: ${report.modelCounts.users.admin}, BQL: ${report.modelCounts.users.bql}, Thợ: ${report.modelCounts.users.technician}, Cư dân: ${report.modelCounts.users.resident})`
  );
  console.log(`  - Ticket:           ${report.modelCounts.tickets}`);
  console.log(`  - Invoice:          ${report.modelCounts.invoices}`);
  console.log(`  - Payment:          ${report.modelCounts.payments}`);
  console.log(`  - Feedback:         ${report.modelCounts.feedbacks}`);
  console.log(`  - Notification:     ${report.modelCounts.notifications}`);
  console.log(`  - MediaAsset:       ${report.modelCounts.mediaAssets} (Zero-Asset Policy)`);
  console.log('----------------------------------------------------------------');
  console.log('📝 CHI TIẾT KẾT QUẢ TỪNG TIÊU CHUẨN:');

  for (let i = 0; i < report.results.length; i++) {
    const res = report.results[i];
    const icon = res.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`\n${i + 1}. ${icon} ${res.name}`);
    console.log(`   Thông điệp: ${res.message}`);
    if (!res.passed && res.errors && res.errors.length > 0) {
      console.log(`   Chi tiết vi phạm (${res.errors.length} lỗi):`);
      for (const err of res.errors.slice(0, 5)) {
        console.log(`     - ${err}`);
      }
      if (res.errors.length > 5) {
        console.log(`     ... và ${res.errors.length - 5} lỗi khác.`);
      }
    }
  }

  console.log('\n================================================================');
  if (report.overallStatus === 'PASS') {
    console.log('🎉 TẤT CẢ 8 TIÊU CHUẨN ĐÃ ĐƯỢC XÁC THỰC TOÀN VẸN VÀ AN TOÀN!');
  } else {
    console.log('⚠️  CẢNH BÁO: PHÁT HIỆN LỖI TOÀN VẸN HOẶC BẢO MẬT TRONG DATASET!');
  }
  console.log('================================================================');
}

/**
 * Hàm khởi tạo CLI cho Dataset Validation Runner
 */
export async function runValidationCLI(): Promise<number> {
  const args = process.argv.slice(2);
  const isDbMode = args.includes('--mode=database');

  console.log('🚀 Khởi động Dataset Validation Runner (Milestone 10.1)...');

  try {
    let report: DatasetValidationReport;

    if (isDbMode) {
      report = await validateDatabase();
    } else {
      report = validateInMemory();
    }

    printValidationReport(report);

    // Tự động lưu báo cáo JSON phục vụ kiểm toán nghiệm thu (Section 9)
    try {
      const savedPath = saveValidationReport(report);
      console.log(`💾 Báo cáo nghiệm thu đã được lưu tự động tại: ${savedPath}`);
    } catch (saveErr: any) {
      console.warn(`⚠️ Không thể lưu báo cáo JSON: ${saveErr.message}`);
    }

    return report.overallStatus === 'PASS' ? 0 : 1;
  } catch (err: any) {
    console.error('\n❌ [FATAL VALIDATION ERROR]:', err.message);
    return 1;
  }
}

if (require.main === module) {
  runValidationCLI().then((exitCode) => {
    process.exit(exitCode);
  });
}
