// =========================================================================
// KIỂM TRA SỐ LƯỢNG BẢN GHI (COUNTS VALIDATION CHECK)
// Phân hệ: backend/dataset/validation/checks/counts.check.ts
// Đặc tả: Milestone 10 — Kiểm toán quy mô số lượng bản ghi của 8 models
// =========================================================================

import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { CheckResult, ModelCounts, DatasetSnapshot } from './types';

export { CheckResult, ModelCounts };

/**
 * Kiểm tra số lượng bản ghi thực tế có nằm trong khoảng mục tiêu đã duyệt
 */
export function checkCounts(counts: ModelCounts): CheckResult {
  const errors: string[] = [];
  const cfg = DATASET_CONFIG.TARGET_COUNTS;

  // 1. Kiểm tra số lượng âm, NaN hoặc vô hạn (Non-negative, Finite checks)
  const numericFields: Array<{ name: string; val: number }> = [
    { name: 'Room', val: counts.rooms },
    { name: 'User (Tổng)', val: counts.users?.total },
    { name: 'Admin', val: counts.users?.admin },
    { name: 'BQL', val: counts.users?.bql },
    { name: 'Thợ', val: counts.users?.technician },
    { name: 'Cư dân', val: counts.users?.resident },
    { name: 'Ticket', val: counts.tickets },
    { name: 'Invoice', val: counts.invoices },
    { name: 'Payment', val: counts.payments },
    { name: 'Feedback', val: counts.feedbacks },
    { name: 'Notification', val: counts.notifications },
    { name: 'MediaAsset', val: counts.mediaAssets },
  ];

  for (const f of numericFields) {
    if (typeof f.val !== 'number' || Number.isNaN(f.val) || !Number.isFinite(f.val)) {
      errors.push(`Số lượng ${f.name} không hợp lệ (phải là số hữu hạn, nhận được: ${f.val}).`);
    } else if (f.val < 0) {
      errors.push(`Số lượng ${f.name} không được âm (nhận ${f.val}).`);
    }
  }

  // 2. Kiểm tra tính nhất quán tổng User và từng vai trò
  if (counts.users) {
    const expectedTotalUsers =
      (counts.users.admin ?? 0) +
      (counts.users.bql ?? 0) +
      (counts.users.technician ?? 0) +
      (counts.users.resident ?? 0);
    if (counts.users.total !== expectedTotalUsers) {
      errors.push(
        `Tổng số User (${counts.users.total}) không khớp với tổng các nhóm vai trò (${expectedTotalUsers} = ${counts.users.admin} Admin + ${counts.users.bql} BQL + ${counts.users.technician} Thợ + ${counts.users.resident} Cư dân).`
      );
    }
  }

  // 3. Kiểm tra mục tiêu số lượng từng model theo DATASET_CONFIG
  if (counts.rooms !== cfg.ROOMS) {
    errors.push(`Số lượng Room (${counts.rooms}) không khớp mục tiêu (${cfg.ROOMS}).`);
  }

  if (counts.users?.admin !== cfg.USERS.ADMIN) {
    errors.push(`Số lượng Admin (${counts.users?.admin}) phải bằng ${cfg.USERS.ADMIN}.`);
  }

  if (counts.users?.bql !== cfg.USERS.BQL) {
    errors.push(`Số lượng BQL (${counts.users?.bql}) phải bằng ${cfg.USERS.BQL}.`);
  }

  if (counts.users?.technician !== cfg.USERS.TECHNICIAN) {
    errors.push(`Số lượng Thợ (${counts.users?.technician}) phải bằng ${cfg.USERS.TECHNICIAN}.`);
  }

  if (
    counts.users?.resident < cfg.USERS.RESIDENT_MIN ||
    counts.users?.resident > cfg.USERS.RESIDENT_MAX
  ) {
    errors.push(
      `Số lượng Cư dân (${counts.users?.resident}) nằm ngoài khoảng cho phép [${cfg.USERS.RESIDENT_MIN}, ${cfg.USERS.RESIDENT_MAX}].`
    );
  }

  if (counts.tickets < cfg.TICKETS.MIN || counts.tickets > cfg.TICKETS.MAX) {
    errors.push(
      `Số lượng Ticket (${counts.tickets}) nằm ngoài khoảng [${cfg.TICKETS.MIN}, ${cfg.TICKETS.MAX}].`
    );
  }

  if (counts.invoices < cfg.INVOICES.MIN || counts.invoices > cfg.INVOICES.MAX) {
    errors.push(
      `Số lượng Invoice (${counts.invoices}) nằm ngoài khoảng [${cfg.INVOICES.MIN}, ${cfg.INVOICES.MAX}].`
    );
  }

  if (counts.payments < cfg.PAYMENTS.MIN || counts.payments > cfg.PAYMENTS.MAX) {
    errors.push(
      `Số lượng Payment (${counts.payments}) nằm ngoài khoảng [${cfg.PAYMENTS.MIN}, ${cfg.PAYMENTS.MAX}].`
    );
  }

  if (counts.feedbacks < cfg.FEEDBACKS.MIN || counts.feedbacks > cfg.FEEDBACKS.MAX) {
    errors.push(
      `Số lượng Feedback (${counts.feedbacks}) nằm ngoài khoảng [${cfg.FEEDBACKS.MIN}, ${cfg.FEEDBACKS.MAX}].`
    );
  }

  if (counts.notifications < cfg.NOTIFICATIONS.MIN || counts.notifications > cfg.NOTIFICATIONS.MAX) {
    errors.push(
      `Số lượng Notification (${counts.notifications}) nằm ngoài khoảng [${cfg.NOTIFICATIONS.MIN}, ${cfg.NOTIFICATIONS.MAX}].`
    );
  }

  // MediaAsset: Chính sách Zero-Asset yêu cầu chính xác 0
  if (counts.mediaAssets !== 0) {
    errors.push(
      `Số lượng MediaAsset (${counts.mediaAssets}) vượt quá giới hạn cho phép (tối đa ${cfg.MEDIA_ASSETS.MAX_VERIFIED}, yêu cầu chính xác 0 theo chính sách Zero-Asset).`
    );
  }

  return {
    name: 'Counts Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ số lượng bản ghi thỏa mãn quy mô đã duyệt.'
        : `Phát hiện ${errors.length} vi phạm quy mô: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: counts,
  };
}

/**
 * Trích xuất số lượng bản ghi từ Dataset Snapshot và thực hiện kiểm định
 */
export function validateCounts(snapshot: DatasetSnapshot): CheckResult {
  const adminCount = snapshot.users.filter((u) => u.role === Role.ADMIN).length;
  const bqlCount = snapshot.users.filter((u) => u.role === Role.BQL).length;
  const techCount = snapshot.users.filter((u) => u.role === Role.TECHNICIAN).length;
  const residentCount = snapshot.users.filter((u) => u.role === Role.RESIDENT).length;

  const counts: ModelCounts = {
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

  return checkCounts(counts);
}
