// =========================================================================
// HỆ THỐNG KIỂM ĐỊNH CHẤT LƯỢNG DATASET (DATASET VALIDATION RUNNER)
// Phân hệ: backend/dataset/validation/validate.ts
// Đặc tả: Milestone 10 — Hai chế độ IN_MEMORY và DATABASE (Read-Only Safety Guard)
// =========================================================================

import { PrismaClient, Role } from '@prisma/client';
import { DATASET_CONFIG } from '../config/dataset.config';
import { generateEntireDataset, sanitizeDatabaseUrl } from '../seed/index';
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
  // Tuyệt đối không chấp nhận ALLOW_DATASET_SEED thay thế
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

  // 4. Kiểm tra từ chối các dấu hiệu production (kể cả khi cố tình đưa vào allowlist)
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
 * Động cơ kiểm định tính toàn vẹn thuần túy (Pure In-Memory Validation Engine)
 * Chạy toàn bộ 8 bài kiểm tra độc lập và tổng hợp báo cáo toàn diện
 */
export function validateDataset(
  snapshot: DatasetSnapshot,
  mode: 'IN_MEMORY' | 'DATABASE' = 'IN_MEMORY',
  targetDatabase?: string
): DatasetValidationReport {
  // 1. Thu thập số lượng thực tế
  const adminCount = snapshot.users.filter((u) => u.role === Role.ADMIN).length;
  const bqlCount = snapshot.users.filter((u) => u.role === Role.BQL).length;
  const techCount = snapshot.users.filter((u) => u.role === Role.TECHNICIAN).length;
  const residentCount = snapshot.users.filter((u) => u.role === Role.RESIDENT).length;

  const modelCounts: ModelCounts = {
    rooms: snapshot.rooms.length,
    users: {
      total: snapshot.users.length,
      admin: adminCount,
      bql: bqlCount,
      technician: techCount,
      resident: residentCount,
    },
    tickets: snapshot.tickets.length,
    invoices: snapshot.invoices.length,
    payments: snapshot.payments.length,
    feedbacks: snapshot.feedbacks.length,
    notifications: snapshot.notifications.length,
    mediaAssets: snapshot.mediaAssets.length,
  };

  // 2. Chạy 8 nhóm kiểm định tính toàn vẹn (mỗi check chạy độc lập, một check fail không ảnh hưởng check khác)
  const results: CheckResult[] = [
    validateCounts(snapshot),
    validateRelationalIntegrity(snapshot),
    validateFinancialIntegrity(snapshot),
    validateTicketIntegrity(snapshot),
    validateFeedbackIntegrity(snapshot),
    validateNotificationIntegrity(snapshot),
    validateMediaIntegrity(snapshot),
    validatePrivacyIntegrity(snapshot),
  ];

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
      // TUYỆT ĐỐI CHỈ DÙNG findMany, KHÔNG dùng write/update/delete/mutation
      const [rooms, users, invoices, payments, tickets, feedbacks, notifications, mediaAssets] =
        await prisma.$transaction(async (tx: any) => {
          const r = await tx.room.findMany();
          const u = await tx.user.findMany();
          const inv = await tx.invoice.findMany();
          const p = await tx.payment.findMany();
          const t = await tx.ticket.findMany();
          const f = await tx.feedback.findMany();
          const n = await tx.notification.findMany();
          const ma = await tx.mediaAsset.findMany();

          return [r, u, inv, p, t, f, n, ma];
        });

      // 3. Nếu database rỗng: Tuyệt đối không tự ý seed! Báo cáo lỗi kiểm định ngay lập tức
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
          results: [
            {
              name: 'Database Empty Check',
              passed: false,
              message:
                'Cơ sở dữ liệu hoàn toàn rỗng (0 bản ghi). Hệ thống không tự động seed và từ chối kiểm định theo chính sách Fail-Closed.',
              violationsCount: 1,
              errors: ['Database rỗng, không có dữ liệu để kiểm định.'],
            },
          ],
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
 * Định dạng và in báo cáo kiểm định ra màn hình console (Sanitized Output)
 */
export function printValidationReport(report: DatasetValidationReport): void {
  console.log('================================================================');
  console.log('📋  BÁO CÁO KIỂM TOÁN TÍNH TOÀN VẸN VÀ BẢO MẬT DATASET (M10)');
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

  console.log('🚀 Khởi động Dataset Validation Runner (Milestone 10)...');

  try {
    let report: DatasetValidationReport;

    if (isDbMode) {
      report = await validateDatabase();
    } else {
      report = validateInMemory();
    }

    printValidationReport(report);
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
