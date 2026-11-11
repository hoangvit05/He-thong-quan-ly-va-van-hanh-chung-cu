// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN SỰ CỐ & LỌC TRÙNG (TICKET INTEGRITY CHECK)
// =========================================================================

import { CheckResult } from './counts.check';

export interface TicketValidationInput {
  invalidTechnicianAssignments: number;
  invalidRatings: number;
  invalidDuplicateFlags: number;
  invalidTransitions: number;
}

/**
 * Kiểm tra tính nhất quán của vòng đời Ticket và cờ lọc trùng 24h
 */
export function checkTicketIntegrity(input: TicketValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.invalidTechnicianAssignments > 0) {
    errors.push(
      `Phát hiện ${input.invalidTechnicianAssignments} ticket ở trạng thái ASSIGNED/IN_PROGRESS/COMPLETED nhưng thiếu technicianId hoặc gán sai vai trò.`
    );
  }

  if (input.invalidRatings > 0) {
    errors.push(`Phát hiện ${input.invalidRatings} ticket có điểm rating nhưng chưa đóng (status !== CLOSED) hoặc điểm ngoài 1-5 sao.`);
  }

  if (input.invalidDuplicateFlags > 0) {
    errors.push(`Phát hiện ${input.invalidDuplicateFlags} ticket sai lệch cờ isDuplicate (phiếu gốc bị gán true hoặc phiếu trùng bị gán false).`);
  }

  return {
    name: 'Ticket Consistency Check',
    passed: errors.length === 0,
    message: errors.length === 0 ? 'Toàn bộ vòng đời Ticket và cờ lọc trùng hợp lệ.' : errors.join('; '),
    details: input,
  };
}

