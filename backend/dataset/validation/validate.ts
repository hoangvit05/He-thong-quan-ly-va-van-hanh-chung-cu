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
import {
  validatePrivacyIntegrity,
  maskUsername,
  maskEmail,
  maskPhone,
  maskCCCD,
  maskBankAccount,
} from './checks/privacy.check';
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
 * Kiểm tra tính hợp lệ của chuỗi ISO 8601 timestamp theo lịch nghiêm ngặt (Milestone 10.1.4 Blocker B)
 * - Kiểm tra định dạng ISO 8601: YYYY-MM-DDTHH:mm:ss(.sss)?(Z|[+-]HH:mm)
 * - Kiểm tra tính hợp lệ của năm, tháng (1..12), ngày theo từng tháng thực tế (kể cả năm nhuận 29/02)
 * - Kiểm tra giới hạn giờ (00..23), phút (00..59), giây (00..59)
 * - Kiểm tra giới hạn timezone offset (+00..+14:00, -00..-12:00, phút 00..59)
 * - Loại bỏ hoàn toàn timestamp chứa PII, secrets hoặc nội dung tùy ý
 */
export function isValidIsoTimestamp(ts: any): boolean {
  if (typeof ts !== 'string') return false;
  const match = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):?(\d{2}))$/);
  if (!match) return false;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);

  if (year < 1 || year > 9999) return false;
  if (month < 1 || month > 12) return false;

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  const daysInMonth = [0, 31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
  if (day < 1 || day > daysInMonth) return false;

  if (hour < 0 || hour > 23) return false;
  if (minute < 0 || minute > 59) return false;
  if (second < 0 || second > 59) return false;

  if (match[8] !== 'Z') {
    const tzSign = match[9];
    const tzHour = parseInt(match[10], 10);
    const tzMin = parseInt(match[11], 10);
    if (tzMin < 0 || tzMin > 59) return false;
    if (tzSign === '+') {
      if (tzHour < 0 || tzHour > 14) return false;
      if (tzHour === 14 && tzMin > 0) return false;
    } else {
      if (tzHour < 0 || tzHour > 12) return false;
      if (tzHour === 12 && tzMin > 0) return false;
    }
  }

  const parsed = Date.parse(ts);
  return !Number.isNaN(parsed);
}

/**
 * Làm sạch Database Target / URL (Milestone 10.1.3 Blocker B):
 * - Che giấu cả username và password (thành ***:***@).
 * - Loại bỏ hoàn toàn query parameters chứa token, credentials hoặc secret.
 * - Làm sạch PII (email, SĐT, STK) nếu vô tình nằm trong hostname hoặc database name.
 */
export function sanitizeDatabaseTarget(rawTarget?: string): string | undefined {
  if (!rawTarget || typeof rawTarget !== 'string') return undefined;
  const trimmed = rawTarget.trim();
  if (!trimmed) return undefined;

  let cleaned = trimmed;

  // 1. Nếu là URL PostgreSQL (postgres:// hoặc postgresql://)
  if (cleaned.startsWith('postgres://') || cleaned.startsWith('postgresql://')) {
    try {
      const parsed = new URL(cleaned);
      // Che giấu cả username và password
      const userPart = parsed.username ? '***' : '';
      const passPart = parsed.password ? ':***' : '';
      const authPart = userPart || passPart ? `${userPart}${passPart}@` : '';

      // Khử query parameters (loại bỏ credentials, tokens, api keys trong query string)
      parsed.search = '';
      parsed.hash = '';

      // Làm sạch hostname và pathname
      const cleanHost = sanitizeTextForReport(parsed.hostname);
      const portPart = parsed.port ? `:${parsed.port}` : '';
      const cleanPath = sanitizeTextForReport(parsed.pathname);

      cleaned = `${parsed.protocol}//${authPart}${cleanHost}${portPart}${cleanPath}`;
    } catch {
      // Fallback regex nếu URL parse thất bại
      cleaned = cleaned.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***:***@');
      cleaned = cleaned.split('?')[0]; // Cắt bỏ query params
    }
  } else {
    // 2. Định dạng host:port/dbname hoặc custom target string
    cleaned = cleaned.replace(/(?:^|\/\/)[^:@\s]+(?::[^@\s]+)?@/g, '***:***@');
    cleaned = cleaned.split('?')[0]; // Cắt bỏ query params
  }

  // 3. Quét sạch PII (email, SĐT, STK, Bcrypt, token, secret) trên toàn bộ chuỗi
  return sanitizeTextForReport(cleaned);
}

/**
 * Làm sạch chuỗi văn bản phục vụ báo cáo kiểm toán (Milestone 10.1.2/10.1.3):
 * Loại bỏ / che giấu PII, email, số điện thoại, STK, CCCD, Bcrypt hash,
 * credentials, database username/passwords, tokens, secrets, stack traces và source paths.
 */
export function sanitizeTextForReport(text: string): string {
  if (typeof text !== 'string') return '';
  let sanitized = text;

  // 1. Khử chuỗi Bcrypt hash ($2a$10$..., $2b$10$...)
  sanitized = sanitized.replace(/\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_BCRYPT_HASH]');

  // 2. Khử Database credentials (che cả username và password trong postgres://user:pass@)
  sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1***:***@');
  sanitized = sanitized.replace(/:[^:@\s]+@/g, ':***@');

  // 3. Khử secrets, tokens, credentials, passwords
  sanitized = sanitized.replace(/\b(bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, '$1[REDACTED_TOKEN]');
  sanitized = sanitized.replace(
    /\b(password|passwd|secret|token|api_key|apikey|credentials)\b\s*[:=]\s*['"]?[^\s'",;]+['"]?/gi,
    '$1=[REDACTED_SECRET]'
  );

  // 4. Khử Email (bao gồm cả name và domain)
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (email) => maskEmail(email));

  // 5. Khử số điện thoại Việt Nam (kể cả có dấu cách, chấm, gạch ngang)
  sanitized = sanitized.replace(
    /(?:(?:\+84|84|0)[\s.-]?(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)(?:[\s.-]?\d){7})\b/g,
    (phone) => maskPhone(phone)
  );

  // 6. Khử Số tài khoản ngân hàng (STK) kèm ngữ cảnh
  sanitized = sanitized.replace(
    /(?:stk|số tài khoản|so tai khoan|tài khoản ngân hàng|tai khoan ngan hang|tk ngân hàng|tk ngan hang)[\s:=#_-]*([0-9]{8,19})/gi,
    (match, digits) => match.replace(digits, maskBankAccount(digits))
  );
  sanitized = sanitized.replace(
    /(?:^|[^\d])([0-9]{8,19})(?=[^\d]|$)(?=[\s\S]{0,35}(?:stk|số tài khoản|so tai khoan|tài khoản ngân hàng|tai khoan ngan hang))/gi,
    (match, digits) => match.replace(digits, maskBankAccount(digits))
  );

  // 7. Khử CCCD 12 số (bắt đầu bằng 0)
  sanitized = sanitized.replace(/\b(0\d{11})\b/g, (cccd) => maskCCCD(cccd));

  // 8. Khử username hoặc định danh người dùng nếu có ngữ cảnh
  sanitized = sanitized.replace(
    /(?:username|user|người dùng)\s*[:=]?\s*['"]?([a-zA-Z0-9_.-]+)['"]?/gi,
    (match, uname) => match.replace(uname, maskUsername(uname))
  );

  // 9. Khử Stack traces (dòng '   at ...') và đường dẫn file mã nguồn nhạy cảm
  sanitized = sanitized.replace(/^\s*at\s+.*(?:\(.*:\d+:\d+\)|:\d+:\d+).*$/gm, '[REDACTED_STACK_TRACE]');
  sanitized = sanitized.replace(/(\b(?:[a-zA-Z]:|\/)(?:[^\s:()]+)\.(?:ts|js):\d+:\d+\b)/g, '[REDACTED_SOURCE_PATH]');

  return sanitized;
}

/**
 * Đệ quy làm sạch các giá trị trong object / array phục vụ báo cáo an toàn (Milestone 10.1.4 Blocker A):
 * - Phân biệt số liệu thống kê an toàn (invalidPasswords) với thông tin bí mật thực sự.
 * - Bảo toàn invalidPasswords khi giá trị là number hữu hạn hợp lệ (kiểu number được giữ nguyên).
 * - Nếu invalidPasswords là string, object hoặc non-number, che giấu an toàn thành [REDACTED_SENSITIVE_FIELD].
 * - Các trường password, passwordHash, secret, token, credential, stack luôn được bảo vệ/che giấu.
 */
export function sanitizeValueForReport(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return sanitizeTextForReport(val);
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : '[REDACTED_SENSITIVE_FIELD]';
  }
  if (typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValueForReport(item));
  }
  if (typeof val === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const lowerKey = k.toLowerCase();
      if (lowerKey === 'invalidpasswords') {
        if (typeof v === 'number' && Number.isFinite(v)) {
          res[k] = v;
        } else {
          res[k] = '[REDACTED_SENSITIVE_FIELD]';
        }
      } else if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('credential') ||
        lowerKey.includes('stack')
      ) {
        res[k] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        res[k] = sanitizeValueForReport(v);
      }
    }
    return res;
  }
  return String(val);
}

/**
 * Lưu báo cáo kiểm định thành tệp JSON phục vụ nghiệm thu (Section 9 & Milestone 10.1.2/10.1.3)
 * Sử dụng Allowlist Serializer không dùng spread operator, loại bỏ hoàn toàn rò rỉ PII,
 * credentials, secrets, stack traces và nested objects nhạy cảm.
 */
export function saveValidationReport(
  report: DatasetValidationReport,
  outputDir = path.resolve(__dirname, '../reports')
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Thẩm định và chuẩn hóa timestamp (Milestone 10.1.3 Blocker B)
  const safeTimestamp = isValidIsoTimestamp(report?.timestamp)
    ? report.timestamp
    : new Date().toISOString();

  // 2. Thẩm định và làm sạch targetDatabase (Milestone 10.1.3 Blocker B)
  const safeTargetDatabase = report?.targetDatabase
    ? sanitizeDatabaseTarget(report.targetDatabase)
    : undefined;

  // 3. Allowlist serializer cho từng kết quả kiểm tra
  const sanitizedResults = (Array.isArray(report?.results) ? report.results : []).map((r) => {
    const cleanName = sanitizeTextForReport(String(r?.name ?? ''));
    const cleanMessage = sanitizeTextForReport(String(r?.message ?? ''));
    const cleanErrors = (Array.isArray(r?.errors) ? r.errors : []).map((errStr) =>
      sanitizeTextForReport(typeof errStr === 'string' ? errStr : String(errStr ?? ''))
    );

    const resultItem: Record<string, any> = {
      name: cleanName,
      passed: Boolean(r?.passed),
      message: cleanMessage,
      violationsCount: Number(r?.violationsCount ?? cleanErrors.length),
      errors: cleanErrors,
    };

    if (r?.details && typeof r.details === 'object' && !Array.isArray(r.details)) {
      resultItem.details = sanitizeValueForReport(r.details);
    }

    return resultItem;
  });

  // 4. Allowlist serializer cho báo cáo tổng thể
  const sanitizedReport = {
    timestamp: safeTimestamp,
    mode: report?.mode === 'DATABASE' ? 'DATABASE' : 'IN_MEMORY',
    targetDatabase: safeTargetDatabase,
    totalChecks: Number(report?.totalChecks ?? sanitizedResults.length),
    passedChecks: Number(report?.passedChecks ?? sanitizedResults.filter((r) => r.passed).length),
    failedChecks: Number(report?.failedChecks ?? sanitizedResults.filter((r) => !r.passed).length),
    overallStatus: report?.overallStatus === 'PASS' ? 'PASS' : 'FAIL',
    modelCounts: {
      rooms: Number(report?.modelCounts?.rooms ?? 0),
      users: {
        total: Number(report?.modelCounts?.users?.total ?? 0),
        admin: Number(report?.modelCounts?.users?.admin ?? 0),
        bql: Number(report?.modelCounts?.users?.bql ?? 0),
        technician: Number(report?.modelCounts?.users?.technician ?? 0),
        resident: Number(report?.modelCounts?.users?.resident ?? 0),
      },
      tickets: Number(report?.modelCounts?.tickets ?? 0),
      invoices: Number(report?.modelCounts?.invoices ?? 0),
      payments: Number(report?.modelCounts?.payments ?? 0),
      feedbacks: Number(report?.modelCounts?.feedbacks ?? 0),
      notifications: Number(report?.modelCounts?.notifications ?? 0),
      mediaAssets: Number(report?.modelCounts?.mediaAssets ?? 0),
    },
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
 * Danh sách toàn bộ các trường vô hướng (scalar fields) theo Prisma Schema cho cả 8 models (Milestone 10.1.2)
 */
export const PRISMA_SCHEMA_EXPECTED_FIELDS: Record<CanonicalModelName, readonly string[]> = {
  rooms: ['id', 'roomNumber', 'floor', 'area', 'status', 'createdAt', 'updatedAt'] as const,
  users: [
    'id',
    'username',
    'password',
    'fullName',
    'phone',
    'email',
    'role',
    'roomId',
    'isApproved',
    'createdAt',
    'updatedAt',
  ] as const,
  tickets: [
    'id',
    'title',
    'category',
    'description',
    'mediaUrl',
    'status',
    'roomId',
    'residentId',
    'technicianId',
    'materials',
    'completedMediaUrl',
    'rating',
    'ratingComment',
    'isDuplicate',
    'createdAt',
    'updatedAt',
  ] as const,
  invoices: [
    'id',
    'roomId',
    'month',
    'managementFee',
    'parkingFee',
    'waterFee',
    'otherFee',
    'totalAmount',
    'paidAmount',
    'dueDate',
    'status',
    'createdAt',
    'updatedAt',
  ] as const,
  payments: ['id', 'invoiceId', 'amount', 'paymentMethod', 'transactionCode', 'note', 'paidAt'] as const,
  feedbacks: [
    'id',
    'residentId',
    'roomId',
    'title',
    'content',
    'reply',
    'isResolved',
    'repliedAt',
    'createdAt',
    'updatedAt',
  ] as const,
  notifications: ['id', 'title', 'content', 'targetRoom', 'authorId', 'createdAt'] as const,
  mediaAssets: [
    'id',
    'publicId',
    'url',
    'resourceType',
    'deliveryType',
    'purpose',
    'bytes',
    'format',
    'width',
    'height',
    'duration',
    'uploaderId',
    'ticketId',
    'isConfirmed',
    'confirmedAt',
    'createdAt',
    'updatedAt',
  ] as const,
};

/**
 * So sánh bình đẳng ngữ nghĩa giữa hai giá trị mà không dùng chuỗi sentinel
 * (Milestone 10.1.2 - Tránh va chạm giữa undefined và chuỗi '__UNDEFINED__')
 */
export function areCanonicalValuesEqual(v1: any, v2: any): boolean {
  // Cả hai cùng là undefined
  if (v1 === undefined && v2 === undefined) return true;
  if (v1 === undefined || v2 === undefined) return false;

  // Cả hai cùng là null
  if (v1 === null && v2 === null) return true;
  if (v1 === null || v2 === null) return false;

  // Prisma Decimal
  const isDec1 =
    v1 instanceof Prisma.Decimal ||
    (typeof v1 === 'object' && typeof v1?.toFixed === 'function' && typeof v1?.isDecimal === 'function');
  const isDec2 =
    v2 instanceof Prisma.Decimal ||
    (typeof v2 === 'object' && typeof v2?.toFixed === 'function' && typeof v2?.isDecimal === 'function');

  if (isDec1 && isDec2) {
    if (typeof v1.equals === 'function') {
      return v1.equals(v2);
    }
    return v1.toString() === v2.toString();
  }
  if (isDec1 || isDec2) return false;

  // Date
  if (v1 instanceof Date && v2 instanceof Date) {
    return v1.getTime() === v2.getTime();
  }
  if (v1 instanceof Date || v2 instanceof Date) return false;

  // Primitives (number, string, boolean)
  if (typeof v1 === 'number' && typeof v2 === 'number') {
    if (Number.isNaN(v1) && Number.isNaN(v2)) return true;
    return v1 === v2;
  }
  if (typeof v1 === 'string' || typeof v1 === 'boolean') {
    return v1 === v2;
  }

  // Array
  if (Array.isArray(v1) && Array.isArray(v2)) {
    if (v1.length !== v2.length) return false;
    for (let i = 0; i < v1.length; i++) {
      if (!areCanonicalValuesEqual(v1[i], v2[i])) return false;
    }
    return true;
  }
  if (Array.isArray(v1) || Array.isArray(v2)) return false;

  // Object
  if (typeof v1 === 'object' && typeof v2 === 'object') {
    const keys1 = Object.keys(v1).sort();
    const keys2 = Object.keys(v2).sort();
    if (keys1.length !== keys2.length) return false;
    for (let i = 0; i < keys1.length; i++) {
      const k1 = keys1[i];
      const k2 = keys2[i];
      if (k1 !== k2) return false;
      if (!areCanonicalValuesEqual(v1[k1], v2[k2])) return false;
    }
    return true;
  }

  return v1 === v2;
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
 * So sánh toàn diện hai Dataset Snapshot trên toàn bộ 8 models và tất cả các trường theo Prisma Schema (Milestone 10.1.2):
 * - Kiểm tra sự hiện diện của 100% các trường theo Prisma Schema trên từng bản ghi.
 * - Nghiêm cấm loại trừ tùy tiện: CHỈ chấp nhận duy nhất 'users.password' do tính chất muối ngẫu nhiên của Bcrypt.
 * - So sánh trực tiếp giá trị bằng areCanonicalValuesEqual() tránh va chạm chuỗi sentinel.
 */
export function compareDatasetSnapshots(
  ds1: DatasetSnapshot,
  ds2: DatasetSnapshot,
  options: SnapshotComparisonOptions = {}
): DeterminismComparisonResult {
  const diffs: string[] = [];
  const rawExclude = options.excludeFields || {};
  let totalRecordsCompared = 0;

  // 1. Kiểm tra nghiêm ngặt danh sách excludeFields:
  // CHỈ chấp nhận duy nhất 'users.password' do tính chất Bcrypt salt ngẫu nhiên.
  // Mọi trường khác trong bất kỳ model nào đều BỊ TỪ CHỐI và gây lỗi FAIL.
  for (const [modelKey, fields] of Object.entries(rawExclude)) {
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      if (modelKey === 'users' && field === 'password') {
        continue; // Hợp lệ do Bcrypt salt ngẫu nhiên
      }
      diffs.push(
        `Yêu cầu loại trừ không hợp lệ cho model '${modelKey}', trường '${field}'. Chỉ chấp nhận duy nhất trường 'users.password' do tính chất muối ngẫu nhiên của Bcrypt.`
      );
    }
  }

  for (const model of CANONICAL_SNAPSHOT_MODELS) {
    const hasInDs1 = Boolean(ds1 && typeof ds1 === 'object' && model in ds1);
    const hasInDs2 = Boolean(ds2 && typeof ds2 === 'object' && model in ds2);

    if (!hasInDs1 && !hasInDs2) {
      diffs.push(`Model '${model}' bị thiếu ở cả hai snapshots.`);
      continue;
    }
    if (!hasInDs1) {
      diffs.push(`Model '${model}' bị thiếu ở snapshot 1.`);
      continue;
    }
    if (!hasInDs2) {
      diffs.push(`Model '${model}' bị thiếu ở snapshot 2.`);
      continue;
    }

    const val1 = (ds1 as any)[model];
    const val2 = (ds2 as any)[model];
    const isArr1 = Array.isArray(val1);
    const isArr2 = Array.isArray(val2);

    if (!isArr1 && !isArr2) {
      diffs.push(
        `Model '${model}' trong cả snapshot 1 và 2 không phải là mảng hợp lệ (snapshot 1: ${
          val1 === null ? 'null' : typeof val1
        }, snapshot 2: ${val2 === null ? 'null' : typeof val2}).`
      );
      continue;
    }
    if (!isArr1) {
      diffs.push(
        `Model '${model}' trong snapshot 1 không phải là mảng hợp lệ (kiểu dữ liệu: ${
          val1 === null ? 'null' : typeof val1
        }).`
      );
      continue;
    }
    if (!isArr2) {
      diffs.push(
        `Model '${model}' trong snapshot 2 không phải là mảng hợp lệ (kiểu dữ liệu: ${
          val2 === null ? 'null' : typeof val2
        }).`
      );
      continue;
    }

    const list1 = val1 as any[];
    const list2 = val2 as any[];

    if (list1.length !== list2.length) {
      diffs.push(`Model '${model}' số lượng bản ghi không khớp: ds1=${list1.length}, ds2=${list2.length}`);
      continue;
    }

    totalRecordsCompared += list1.length;

    // Sắp xếp ổn định theo ID để so sánh record-by-record
    const sorted1 = [...list1].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const sorted2 = [...list2].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const excludedForModel = new Set(rawExclude[model] || []);

    const expectedFields = PRISMA_SCHEMA_EXPECTED_FIELDS[model] || [];

    for (let i = 0; i < sorted1.length; i++) {
      const r1 = sorted1[i];
      const r2 = sorted2[i];
      const recordId = r1?.id ?? r2?.id ?? i;

      // 2. Kiểm tra sự hiện diện của tất cả các trường theo Prisma Schema trên từng bản ghi
      for (const expectedKey of expectedFields) {
        const inR1 = expectedKey in (r1 || {});
        const inR2 = expectedKey in (r2 || {});

        if (!inR1 && !inR2) {
          diffs.push(
            `Model '${model}' [id=${recordId}] cả snapshot 1 và 2 đều thiếu trường schema bắt buộc '${expectedKey}'`
          );
        } else if (!inR1) {
          diffs.push(
            `Model '${model}' [id=${recordId}] snapshot 1 thiếu trường schema bắt buộc '${expectedKey}'`
          );
        } else if (!inR2) {
          diffs.push(
            `Model '${model}' [id=${recordId}] snapshot 2 thiếu trường schema bắt buộc '${expectedKey}'`
          );
        }
      }

      // Lấy tập hợp tất cả các keys thực tế có trên r1, r2 cùng với expectedFields
      const allKeys = Array.from(
        new Set([...Object.keys(r1 || {}), ...Object.keys(r2 || {}), ...expectedFields])
      ).sort();

      for (const key of allKeys) {
        if (model === 'users' && key === 'password' && excludedForModel.has('password')) {
          continue; // Bỏ qua mật khẩu đã băm khi có excludeFields hợp lệ
        }

        const v1 = r1?.[key];
        const v2 = r2?.[key];

        if (!areCanonicalValuesEqual(v1, v2)) {
          const s1 = typeof v1 === 'object' && v1 !== null ? JSON.stringify(v1) : String(v1);
          const s2 = typeof v2 === 'object' && v2 !== null ? JSON.stringify(v2) : String(v2);
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
    excludedFields: rawExclude,
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
 * Định dạng và in báo cáo kiểm định ra màn hình console (Sanitized Output - Milestone 10.1.3 Blocker A)
 */
export function printValidationReport(report: DatasetValidationReport): void {
  console.log('================================================================');
  console.log('📋  BÁO CÁO KIỂM TOÁN TÍNH TOÀN VẸN VÀ BẢO MẬT DATASET (M10.1)');
  console.log('================================================================');

  const safeTimestamp = isValidIsoTimestamp(report?.timestamp)
    ? sanitizeTextForReport(report.timestamp)
    : new Date().toISOString();
  console.log(`Thời điểm kiểm toán:  ${safeTimestamp}`);
  console.log(`Chế độ thực thi:      ${report?.mode === 'DATABASE' ? 'DATABASE' : 'IN_MEMORY'}`);

  if (report?.targetDatabase) {
    const safeTargetDb = sanitizeDatabaseTarget(report.targetDatabase);
    if (safeTargetDb) {
      console.log(`Database mục tiêu:    ${safeTargetDb}`);
    }
  }

  const totalChecks = Number(report?.totalChecks ?? 0);
  const passedChecks = Number(report?.passedChecks ?? 0);
  const failedChecks = Number(report?.failedChecks ?? 0);
  const overallStatus = report?.overallStatus === 'PASS' ? '✅ PASS' : '❌ FAIL';

  console.log(`Tổng số tiêu chuẩn:   ${totalChecks}`);
  console.log(`Số tiêu chuẩn ĐẠT:    ${passedChecks}`);
  console.log(`Số tiêu chuẩn LỖI:    ${failedChecks}`);
  console.log(`KẾT QUẢ CHUNG:        ${overallStatus}`);
  console.log('----------------------------------------------------------------');
  console.log('📊 THỐNG KÊ SỐ LƯỢNG BẢN GHI (8 PRISMA MODELS):');
  console.log(`  - Room:             ${Number(report?.modelCounts?.rooms ?? 0)}`);
  console.log(
    `  - User:             ${Number(report?.modelCounts?.users?.total ?? 0)} (Admin: ${Number(
      report?.modelCounts?.users?.admin ?? 0
    )}, BQL: ${Number(report?.modelCounts?.users?.bql ?? 0)}, Thợ: ${Number(
      report?.modelCounts?.users?.technician ?? 0
    )}, Cư dân: ${Number(report?.modelCounts?.users?.resident ?? 0)})`
  );
  console.log(`  - Ticket:           ${Number(report?.modelCounts?.tickets ?? 0)}`);
  console.log(`  - Invoice:          ${Number(report?.modelCounts?.invoices ?? 0)}`);
  console.log(`  - Payment:          ${Number(report?.modelCounts?.payments ?? 0)}`);
  console.log(`  - Feedback:         ${Number(report?.modelCounts?.feedbacks ?? 0)}`);
  console.log(`  - Notification:     ${Number(report?.modelCounts?.notifications ?? 0)}`);
  console.log(`  - MediaAsset:       ${Number(report?.modelCounts?.mediaAssets ?? 0)} (Zero-Asset Policy)`);
  console.log('----------------------------------------------------------------');
  console.log('📝 CHI TIẾT KẾT QUẢ TỪNG TIÊU CHUẨN:');

  const results = Array.isArray(report?.results) ? report.results : [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const icon = res?.passed ? '✅ [PASS]' : '❌ [FAIL]';
    const safeName = sanitizeTextForReport(String(res?.name ?? ''));
    const safeMsg = sanitizeTextForReport(String(res?.message ?? ''));
    console.log(`\n${i + 1}. ${icon} ${safeName}`);
    console.log(`   Thông điệp: ${safeMsg}`);

    const errors = Array.isArray(res?.errors) ? res.errors : [];
    if (!res?.passed && errors.length > 0) {
      console.log(`   Chi tiết vi phạm (${errors.length} lỗi):`);
      for (const err of errors.slice(0, 5)) {
        const safeErr = sanitizeTextForReport(typeof err === 'string' ? err : String(err ?? ''));
        console.log(`     - ${safeErr}`);
      }
      if (errors.length > 5) {
        console.log(`     ... và ${errors.length - 5} lỗi khác.`);
      }
    }
  }

  console.log('\n================================================================');
  if (report?.overallStatus === 'PASS') {
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
      const safeSaveErr = sanitizeTextForReport(saveErr?.message ?? 'Unknown save error');
      console.warn(`⚠️ Không thể lưu báo cáo JSON: ${safeSaveErr}`);
    }

    return report.overallStatus === 'PASS' ? 0 : 1;
  } catch (err: any) {
    const safeMsg = sanitizeTextForReport(err?.message ?? 'Unknown validation error');
    console.error('\n❌ [FATAL VALIDATION ERROR]:', safeMsg);
    return 1;
  }
}

if (require.main === module) {
  runValidationCLI().then((exitCode) => {
    process.exit(exitCode);
  });
}
