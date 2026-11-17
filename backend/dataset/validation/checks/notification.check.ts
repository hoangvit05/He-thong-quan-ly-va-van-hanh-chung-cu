// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN THÔNG BÁO TÒA NHÀ (NOTIFICATION INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/notification.check.ts
// Đặc tả: Milestone 10 — Kiểm toán người phát thông báo và mục tiêu phòng
// =========================================================================

import { Role } from '@prisma/client';
import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

function containsBase64(str: string): boolean {
  const base64Regex = /data:(image|video|application)\/[a-zA-Z0-9.+-]+;base64,/i;
  return base64Regex.test(str) || str.includes(';base64,') || (str.length > 5000 && !/\s/.test(str));
}

/**
 * Kiểm tra toàn diện tính toàn vẹn của dữ liệu Notification trực tiếp trên Dataset Snapshot
 */
export function validateNotificationIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  const userMap = new Map<number, (typeof snapshot.users)[0]>(
    snapshot.users.map((u) => [u.id, u])
  );
  const roomNumberSet = new Set<string>(snapshot.rooms.map((r) => r.roomNumber));

  for (const n of snapshot.notifications) {
    // 1. Kiểm tra tiêu đề và nội dung
    if (typeof n.title !== 'string' || n.title.trim().length === 0) {
      errors.push(`Thông báo #${n.id} có tiêu đề để trống hoặc không phải chuỗi.`);
    } else {
      if (n.title.length > 200) {
        errors.push(`Thông báo #${n.id} có tiêu đề quá dài (> 200 ký tự).`);
      }
      if (containsBase64(n.title)) {
        errors.push(`Thông báo #${n.id} có tiêu đề chứa mã Base64 không hợp lệ.`);
      }
    }

    if (typeof n.content !== 'string' || n.content.trim().length === 0) {
      errors.push(`Thông báo #${n.id} có nội dung để trống hoặc không phải chuỗi.`);
    } else {
      if (containsBase64(n.content)) {
        errors.push(`Thông báo #${n.id} có nội dung chứa mã Base64 không hợp lệ.`);
      }
    }

    // 2. Kiểm tra vai trò tác giả (authorId)
    if (n.authorId !== null) {
      const author = userMap.get(n.authorId);
      if (!author) {
        errors.push(`Thông báo #${n.id} tham chiếu authorId ${n.authorId} không tồn tại.`);
      } else if (author.role !== Role.ADMIN && author.role !== Role.BQL) {
        errors.push(
          `Thông báo #${n.id} có tác giả #${author.id} mang vai trò ${author.role} (không phải ADMIN hoặc BQL).`
        );
      }
    }

    // 3. Kiểm tra mục tiêu phòng (targetRoom)
    // targetRoom = null: gửi toàn chung cư (hợp lệ)
    // targetRoom != null: bắt buộc phải khớp roomNumber thực tế (ví dụ "101", "A-201"), không phải Room.id!
    if (n.targetRoom !== null) {
      if (!roomNumberSet.has(n.targetRoom)) {
        errors.push(
          `Thông báo #${n.id} có targetRoom '${n.targetRoom}' không tồn tại trong danh sách số phòng căn hộ thực tế.`
        );
      }
    }
  }

  return {
    name: 'Notification Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu Notification hợp lệ, đúng vai trò tác giả và khớp số phòng 100%.'
        : `Phát hiện ${errors.length} vi phạm Notification: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} lỗi khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      totalNotifications: snapshot.notifications.length,
      errorsCount: errors.length,
    },
  };
}
