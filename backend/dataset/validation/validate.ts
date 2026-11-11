// =========================================================================
// RUNNER KIỂM ĐỊNH CHẤT LƯỢNG DATASET (DATASET VALIDATION RUNNER)
// Phân hệ: backend/dataset/validation/validate.ts
// Trạng thái: Milestone 2 — Kiến trúc nền tảng (Foundation Only)
// =========================================================================

import { checkCounts, CheckResult } from './checks/counts.check';
import { checkRelationalIntegrity } from './checks/relational.check';
import { checkFinancialIntegrity } from './checks/financial.check';
import { checkTicketIntegrity } from './checks/ticket.check';
import { checkMediaIntegrity } from './checks/media.check';
import { DATASET_CONFIG } from '../config/dataset.config';

export interface DatasetValidationReport {
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  results: CheckResult[];
}

/**
 * Runner tổng hợp các bài kiểm định tính toàn vẹn dataset
 */
export function createValidationSuiteReport(results: CheckResult[]): DatasetValidationReport {
  const passedChecks = results.filter((r) => r.passed).length;
  const failedChecks = results.length - passedChecks;

  return {
    timestamp: new Date().toISOString(),
    totalChecks: results.length,
    passedChecks,
    failedChecks,
    results,
  };
}

if (require.main === module) {
  console.log('======================================================');
  console.log('🧪  KHỞI ĐỘNG HỆ THỐNG KIỂM ĐỊNH DATASET (VALIDATION FOUNDATION)');
  console.log('======================================================');
  console.log('Đã đăng ký 5 tiêu chuẩn kiểm tra toàn diện:');
  console.log('1. [counts.check]       Kiểm tra quy mô số lượng bản ghi đã khóa.');
  console.log('2. [relational.check]   Kiểm tra toàn vẹn quan hệ và khóa ngoại.');
  console.log('3. [financial.check]    Kiểm tra tổng tiền, nộp lũy kế và chống overpayment.');
  console.log('4. [ticket.check]       Kiểm tra vòng đời sự cố và cờ lọc trùng 24h.');
  console.log('5. [media.check]        Kiểm tra tính toàn vẹn MediaAsset (chống fake asset).');
  console.log('======================================================');
  console.log('✅ Bộ khung kiểm toán dữ liệu đã sẵn sàng để tích hợp runner ở Milestone 8.');
}

