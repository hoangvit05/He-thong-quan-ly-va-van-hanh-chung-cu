// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN HÒM THƯ GÓP Ý (FEEDBACK INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/feedback.check.ts
// Đặc tả: Milestone 10 — Kiểm toán quyền gửi góp ý, phạm vi phòng và độ dài nội dung
// =========================================================================

import { Role } from '@prisma/client';
import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

function containsBase64(str: string): boolean {
  const base64Regex = /data:(image|video|application)\/[a-zA-Z0-9.+-]+;base64,/i;
  return base64Regex.test(str) || str.includes(';base64,') || (str.length > 5000 && !/\s/.test(str));
}

/**
 * Kiểm tra toàn diện tính toàn vẹn của dữ liệu Feedback trực tiếp trên Dataset Snapshot
 */
export function validateFeedbackIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  const userMap = new Map<number, (typeof snapshot.users)[0]>(
    snapshot.users.map((u) => [u.id, u])
  );

  for (const f of snapshot.feedbacks) {
    const resident = userMap.get(f.residentId);

    // 1. Kiểm tra vai trò người tạo
    if (!resident) {
      errors.push(`Feedback #${f.id} tham chiếu residentId ${f.residentId} không tồn tại.`);
    } else if (resident.role !== Role.RESIDENT) {
      errors.push(
        `Feedback #${f.id} có người gửi mang vai trò ${resident.role} (chỉ tài khoản RESIDENT mới có quyền gửi).`
      );
    }

    // 2. Kiểm tra ràng buộc roomId
    if (resident) {
      if (resident.roomId !== null) {
        if (f.roomId !== resident.roomId) {
          errors.push(
            `Feedback #${f.id} của cư dân #${resident.id} có roomId (${f.roomId}) không khớp với resident.roomId (${resident.roomId}). Cư dân đang có phòng không được gửi phản ánh chung hoặc phòng khác.`
          );
        }
      } else {
        if (f.roomId !== null) {
          errors.push(
            `Feedback #${f.id} của cư dân không có phòng #${resident.id} phải có roomId = null nhưng nhận được ${f.roomId}.`
          );
        }
      }
    }

    // 3. Kiểm tra độ dài văn bản theo validator
    if (typeof f.title !== 'string') {
      errors.push(`Feedback #${f.id} có title không phải kiểu chuỗi.`);
    } else {
      const trimmedTitle = f.title.trim();
      if (trimmedTitle.length < 3 || trimmedTitle.length > 200) {
        errors.push(
          `Feedback #${f.id} có title dài ${trimmedTitle.length} ký tự (yêu cầu trong khoảng 3 đến 200 ký tự).`
        );
      }
      if (containsBase64(f.title)) {
        errors.push(`Feedback #${f.id} có title chứa mã Base64 không hợp lệ.`);
      }
    }

    if (typeof f.content !== 'string') {
      errors.push(`Feedback #${f.id} có content không phải kiểu chuỗi.`);
    } else {
      const trimmedContent = f.content.trim();
      if (trimmedContent.length < 5 || trimmedContent.length > 2000) {
        errors.push(
          `Feedback #${f.id} có content dài ${trimmedContent.length} ký tự (yêu cầu trong khoảng 5 đến 2000 ký tự).`
        );
      }
      if (containsBase64(f.content)) {
        errors.push(`Feedback #${f.id} có content chứa mã Base64 không hợp lệ.`);
      }
    }

    // 4. Kiểm tra trường reply và repliedAt
    if (f.reply !== null && f.reply !== undefined) {
      const trimmedReply = f.reply.trim();
      if (trimmedReply.length < 2 || trimmedReply.length > 2000) {
        errors.push(
          `Feedback #${f.id} có reply dài ${trimmedReply.length} ký tự (yêu cầu trong khoảng 2 đến 2000 ký tự).`
        );
      }
      if (containsBase64(f.reply)) {
        errors.push(`Feedback #${f.id} có reply chứa mã Base64 không hợp lệ.`);
      }
      if (f.repliedAt === null || f.repliedAt === undefined) {
        errors.push(
          `Feedback #${f.id} đã có nội dung reply nhưng repliedAt bị null.`
        );
      }
    } else {
      if (f.repliedAt !== null && f.repliedAt !== undefined) {
        errors.push(
          `Feedback #${f.id} chưa có nội dung reply nhưng repliedAt lại có giá trị.`
        );
      }
    }
  }

  return {
    name: 'Feedback Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Dữ liệu Feedback tuân thủ đầy đủ quy tắc RBAC, phạm vi phòng và độ dài văn bản 100%.'
        : `Phát hiện ${errors.length} vi phạm Feedback: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} lỗi khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      totalFeedbacks: snapshot.feedbacks.length,
      errorsCount: errors.length,
    },
  };
}

