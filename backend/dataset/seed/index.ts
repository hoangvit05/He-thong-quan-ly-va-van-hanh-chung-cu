// =========================================================================
// ENTRY POINT NỀN TẢNG CHO SEED ENGINE (DATASET SEED FOUNDATION)
// Phân hệ: backend/dataset/seed/index.ts
// Trạng thái: Milestone 2 — Kiến trúc nền tảng (Foundation Only)
// =========================================================================

import { DATASET_CONFIG } from '../config/dataset.config';

/**
 * Kiểm tra các điều kiện an toàn môi trường trước khi seed
 */
export function assertSafeDatabaseEnvironment(): void {
  const nodeEnv = process.env.NODE_ENV;
  if (DATASET_CONFIG.SAFETY.REJECT_PRODUCTION && nodeEnv === 'production') {
    throw new Error('[FATAL DATABASE SAFETY ERROR] Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!');
  }

  const optIn = process.env[DATASET_CONFIG.SAFETY.REQUIRED_OPT_IN_ENV];
  if (!optIn || optIn !== 'true') {
    console.warn(
      `[Safety Notice] Biến môi trường ${DATASET_CONFIG.SAFETY.REQUIRED_OPT_IN_ENV} chưa được bật (=true).`
    );
  }
}

/**
 * Khung điều phối tiến trình sinh và nạp dataset (Planned Pipeline)
 */
export interface SeedPipelineSummary {
  status: 'PENDING_IMPLEMENTATION' | 'READY';
  milestone: string;
  config: typeof DATASET_CONFIG;
}

export function getSeedPipelinePlan(): SeedPipelineSummary {
  assertSafeDatabaseEnvironment();

  return {
    status: 'PENDING_IMPLEMENTATION',
    milestone: 'Milestone 2 - Foundation Established',
    config: DATASET_CONFIG,
  };
}

if (require.main === module) {
  console.log('======================================================');
  console.log('🏗️  KHỞI ĐỘNG NỀN TẢNG SEED ENGINE (MILESTONE 2 FOUNDATION)');
  console.log('======================================================');
  const plan = getSeedPipelinePlan();
  console.log(`Quy mô mục tiêu:`);
  console.log(`- Phòng (Room): ${plan.config.TARGET_COUNTS.ROOMS}`);
  console.log(`- Người dùng (User): 1 Admin, 2 BQL, 5 Thợ, 100-150 Cư dân`);
  console.log(`- Sự cố (Ticket): ${plan.config.TARGET_COUNTS.TICKETS.MIN}-${plan.config.TARGET_COUNTS.TICKETS.MAX}`);
  console.log(`- Hóa đơn (Invoice): ${plan.config.TARGET_COUNTS.INVOICES.MIN}-${plan.config.TARGET_COUNTS.INVOICES.MAX}`);
  console.log(`- Giao dịch (Payment): ${plan.config.TARGET_COUNTS.PAYMENTS.MIN}-${plan.config.TARGET_COUNTS.PAYMENTS.MAX}`);
  console.log(`- Góp ý (Feedback): ${plan.config.TARGET_COUNTS.FEEDBACKS.MIN}-${plan.config.TARGET_COUNTS.FEEDBACKS.MAX}`);
  console.log(`- Thông báo (Notification): ${plan.config.TARGET_COUNTS.NOTIFICATIONS.MIN}-${plan.config.TARGET_COUNTS.NOTIFICATIONS.MAX}`);
  console.log(`- MediaAsset thật: ${plan.config.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED}`);
  console.log(`Random Seed: ${plan.config.RANDOM_SEED}`);
  console.log('======================================================');
  console.log('✅ Bộ khung nền tảng Seed đã sẵn sàng cho các Generator tại Milestone 4-7.');
}

