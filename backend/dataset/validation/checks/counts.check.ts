// =========================================================================
// KIỂM TRA SỐ LƯỢNG BẢN GHI (COUNTS VALIDATION CHECK)
// =========================================================================

import { DATASET_CONFIG } from '../../config/dataset.config';

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

export interface ModelCounts {
  rooms: number;
  users: {
    total: number;
    admin: number;
    bql: number;
    technician: number;
    resident: number;
  };
  tickets: number;
  invoices: number;
  payments: number;
  feedbacks: number;
  notifications: number;
  mediaAssets: number;
}

/**
 * Kiểm tra số lượng bản ghi thực tế có nằm trong khoảng mục tiêu đã duyệt
 */
export function checkCounts(counts: ModelCounts): CheckResult {
  const errors: string[] = [];
  const cfg = DATASET_CONFIG.TARGET_COUNTS;

  // 1. Kiểm tra số lượng âm (Negative checks)
  if (counts.rooms < 0) {
    errors.push(`Số lượng Room không được âm (nhận ${counts.rooms}).`);
  }
  if (counts.users.total < 0) {
    errors.push(`Tổng số User không được âm (nhận ${counts.users.total}).`);
  }
  if (counts.users.admin < 0) {
    errors.push(`Số lượng Admin không được âm (nhận ${counts.users.admin}).`);
  }
  if (counts.users.bql < 0) {
    errors.push(`Số lượng BQL không được âm (nhận ${counts.users.bql}).`);
  }
  if (counts.users.technician < 0) {
    errors.push(`Số lượng Thợ không được âm (nhận ${counts.users.technician}).`);
  }
  if (counts.users.resident < 0) {
    errors.push(`Số lượng Cư dân không được âm (nhận ${counts.users.resident}).`);
  }
  if (counts.tickets < 0) {
    errors.push(`Số lượng Ticket không được âm (nhận ${counts.tickets}).`);
  }
  if (counts.invoices < 0) {
    errors.push(`Số lượng Invoice không được âm (nhận ${counts.invoices}).`);
  }
  if (counts.payments < 0) {
    errors.push(`Số lượng Payment không được âm (nhận ${counts.payments}).`);
  }
  if (counts.feedbacks < 0) {
    errors.push(`Số lượng Feedback không được âm (nhận ${counts.feedbacks}).`);
  }
  if (counts.notifications < 0) {
    errors.push(`Số lượng Notification không được âm (nhận ${counts.notifications}).`);
  }
  if (counts.mediaAssets < 0) {
    errors.push(`Số lượng MediaAsset không được âm (nhận ${counts.mediaAssets}).`);
  }

  // 2. Kiểm tra tính nhất quán tổng User và từng vai trò
  const expectedTotalUsers =
    counts.users.admin + counts.users.bql + counts.users.technician + counts.users.resident;
  if (counts.users.total !== expectedTotalUsers) {
    errors.push(
      `Tổng số User (${counts.users.total}) không khớp với tổng các nhóm vai trò (${expectedTotalUsers} = ${counts.users.admin} Admin + ${counts.users.bql} BQL + ${counts.users.technician} Thợ + ${counts.users.resident} Cư dân).`
    );
  }

  // 3. Kiểm tra mục tiêu số lượng từng model
  if (counts.rooms !== cfg.ROOMS) {
    errors.push(`Số lượng Room (${counts.rooms}) không khớp mục tiêu (${cfg.ROOMS}).`);
  }

  if (counts.users.admin !== cfg.USERS.ADMIN) {
    errors.push(`Số lượng Admin (${counts.users.admin}) phải bằng ${cfg.USERS.ADMIN}.`);
  }

  if (counts.users.bql !== cfg.USERS.BQL) {
    errors.push(`Số lượng BQL (${counts.users.bql}) phải bằng ${cfg.USERS.BQL}.`);
  }

  if (counts.users.technician !== cfg.USERS.TECHNICIAN) {
    errors.push(`Số lượng Thợ (${counts.users.technician}) phải bằng ${cfg.USERS.TECHNICIAN}.`);
  }

  if (counts.users.resident < cfg.USERS.RESIDENT_MIN || counts.users.resident > cfg.USERS.RESIDENT_MAX) {
    errors.push(
      `Số lượng Cư dân (${counts.users.resident}) nằm ngoài khoảng cho phép [${cfg.USERS.RESIDENT_MIN}, ${cfg.USERS.RESIDENT_MAX}].`
    );
  }

  if (counts.tickets < cfg.TICKETS.MIN || counts.tickets > cfg.TICKETS.MAX) {
    errors.push(`Số lượng Ticket (${counts.tickets}) nằm ngoài khoảng [${cfg.TICKETS.MIN}, ${cfg.TICKETS.MAX}].`);
  }

  if (counts.invoices < cfg.INVOICES.MIN || counts.invoices > cfg.INVOICES.MAX) {
    errors.push(`Số lượng Invoice (${counts.invoices}) nằm ngoài khoảng [${cfg.INVOICES.MIN}, ${cfg.INVOICES.MAX}].`);
  }

  if (counts.payments < cfg.PAYMENTS.MIN || counts.payments > cfg.PAYMENTS.MAX) {
    errors.push(`Số lượng Payment (${counts.payments}) nằm ngoài khoảng [${cfg.PAYMENTS.MIN}, ${cfg.PAYMENTS.MAX}].`);
  }

  if (counts.feedbacks < cfg.FEEDBACKS.MIN || counts.feedbacks > cfg.FEEDBACKS.MAX) {
    errors.push(`Số lượng Feedback (${counts.feedbacks}) nằm ngoài khoảng [${cfg.FEEDBACKS.MIN}, ${cfg.FEEDBACKS.MAX}].`);
  }

  if (counts.notifications < cfg.NOTIFICATIONS.MIN || counts.notifications > cfg.NOTIFICATIONS.MAX) {
    errors.push(
      `Số lượng Notification (${counts.notifications}) nằm ngoài khoảng [${cfg.NOTIFICATIONS.MIN}, ${cfg.NOTIFICATIONS.MAX}].`
    );
  }

  if (counts.mediaAssets > cfg.MEDIA_ASSETS.MAX_VERIFIED) {
    errors.push(
      `Số lượng MediaAsset (${counts.mediaAssets}) vượt quá giới hạn cho phép (tối đa ${cfg.MEDIA_ASSETS.MAX_VERIFIED}).`
    );
  }

  return {
    name: 'Counts Integrity Check',
    passed: errors.length === 0,
    message: errors.length === 0 ? 'Toàn bộ số lượng bản ghi thỏa mãn quy mô đã duyệt.' : errors.join('; '),
    details: counts,
  };
}

