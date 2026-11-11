// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN QUAN HỆ & KHÓA NGOẠI (RELATIONAL INTEGRITY CHECK)
// =========================================================================

import { CheckResult } from './counts.check';

export interface RelationalValidationInput {
  invalidRoomReferences: number;
  invalidUserReferences: number;
  staffWithRoomId: number;
  orphanedPayments: number;
  duplicateRoomMonths: number;
}

/**
 * Kiểm tra các ràng buộc quan hệ cốt lõi
 */
export function checkRelationalIntegrity(input: RelationalValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.invalidRoomReferences > 0) {
    errors.push(`Phát hiện ${input.invalidRoomReferences} tham chiếu roomId không tồn tại.`);
  }

  if (input.invalidUserReferences > 0) {
    errors.push(`Phát hiện ${input.invalidUserReferences} tham chiếu userId không tồn tại.`);
  }

  if (input.staffWithRoomId > 0) {
    errors.push(`Phát hiện ${input.staffWithRoomId} tài khoản nhân viên (Admin/BQL/Thợ) bị gán roomId trái phép.`);
  }

  if (input.orphanedPayments > 0) {
    errors.push(`Phát hiện ${input.orphanedPayments} giao dịch Payment không liên kết được với Invoice.`);
  }

  if (input.duplicateRoomMonths > 0) {
    errors.push(`Phát hiện ${input.duplicateRoomMonths} cặp trùng lặp [roomId, month] vi phạm unique constraint.`);
  }

  return {
    name: 'Relational Integrity Check',
    passed: errors.length === 0,
    message: errors.length === 0 ? 'Toàn bộ quan hệ và khóa ngoại nhất quán.' : errors.join('; '),
    details: input,
  };
}

