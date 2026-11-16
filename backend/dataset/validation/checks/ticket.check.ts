// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN SỰ CỐ & LỌC TRÙNG (TICKET INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/ticket.check.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: Thuật toán lọc trùng khớp 100% backend
// =========================================================================

import { Role, TicketStatus } from '@prisma/client';
import { CheckResult, DatasetSnapshot, SnapshotTicket } from './types';

export { CheckResult };

export interface TicketValidationInput {
  invalidTechnicianAssignments: number;
  invalidRatings: number;
  invalidDuplicateFlags: number;
  invalidTransitions: number;
}

/**
 * Hàm kiểm tra từ bộ đếm số liệu thô (giữ tương thích ngược với các test cũ)
 */
export function checkTicketIntegrity(input: TicketValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.invalidTransitions > 0) {
    errors.push(`Phát hiện ${input.invalidTransitions} ticket có chuyển đổi trạng thái không hợp lệ.`);
  }

  if (input.invalidTechnicianAssignments > 0) {
    errors.push(
      `Phát hiện ${input.invalidTechnicianAssignments} ticket ở trạng thái ASSIGNED/IN_PROGRESS/COMPLETED nhưng thiếu technicianId hoặc gán sai vai trò.`
    );
  }

  if (input.invalidRatings > 0) {
    errors.push(
      `Phát hiện ${input.invalidRatings} ticket có điểm rating nhưng chưa đóng (status !== CLOSED) hoặc điểm ngoài 1-5 sao.`
    );
  }

  if (input.invalidDuplicateFlags > 0) {
    errors.push(
      `Phát hiện ${input.invalidDuplicateFlags} ticket sai lệch cờ isDuplicate (phiếu gốc bị gán true hoặc phiếu trùng bị gán false).`
    );
  }

  return {
    name: 'Ticket Consistency Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ vòng đời Ticket và cờ lọc trùng hợp lệ.'
        : `Phát hiện ${errors.length} vi phạm Ticket: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: input,
  };
}

/**
 * Kiểm tra toàn diện tính toàn vẹn sự cố kỹ thuật trực tiếp trên Dataset Snapshot
 * Đối chiếu trực tiếp với backend/src/modules/tickets/tickets.controller.ts
 */
export function validateTicketIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  const userMap = new Map<number, (typeof snapshot.users)[0]>(
    snapshot.users.map((u) => [u.id, u])
  );
  const roomMap = new Map<number, (typeof snapshot.rooms)[0]>(
    snapshot.rooms.map((r) => [r.id, r])
  );

  let invalidTech = 0;
  let invalidRatings = 0;
  let invalidDuplicate = 0;

  // 1. Kiểm tra từng ticket: Người tạo, phân công thợ, trạng thái và rating
  for (const t of snapshot.tickets) {
    // 1.1 Kiểm tra trạng thái thuộc enum hợp lệ
    if (!Object.values(TicketStatus).includes(t.status)) {
      errors.push(`Ticket #${t.id} có status '${t.status}' không thuộc enum TicketStatus.`);
    }

    // 1.2 Kiểm tra người tạo phiếu (residentId)
    const creator = userMap.get(t.residentId);
    if (!creator) {
      errors.push(`Ticket #${t.id} tham chiếu residentId ${t.residentId} không tồn tại.`);
    } else {
      // Backend cấm Thợ kỹ thuật tạo phiếu báo hỏng
      if (creator.role === Role.TECHNICIAN) {
        errors.push(
          `Ticket #${t.id} có người tạo mang vai trò TECHNICIAN (Thợ kỹ thuật bị cấm tạo phiếu báo hỏng).`
        );
      }
      // Sự cố thuộc căn hộ cụ thể bắt buộc người tạo phải là RESIDENT
      if (t.roomId !== null && creator.role !== Role.RESIDENT) {
        errors.push(
          `Ticket #${t.id} của căn hộ #${t.roomId} có người tạo mang vai trò ${creator.role} (sự cố căn hộ bắt buộc người tạo là RESIDENT).`
        );
      }
    }

    // 1.3 Kiểm tra gán thợ: ASSIGNED, IN_PROGRESS, COMPLETED bắt buộc phải có technicianId
    if (
      t.status === TicketStatus.ASSIGNED ||
      t.status === TicketStatus.IN_PROGRESS ||
      t.status === TicketStatus.COMPLETED
    ) {
      if (t.technicianId === null) {
        invalidTech++;
        errors.push(
          `Ticket #${t.id} ở trạng thái ${t.status} nhưng technicianId bị null (bắt buộc phải có thợ tiếp nhận).`
        );
      } else {
        const tech = userMap.get(t.technicianId);
        if (!tech || tech.role !== Role.TECHNICIAN) {
          invalidTech++;
          errors.push(
            `Ticket #${t.id} gán technicianId ${t.technicianId} không phải TECHNICIAN (vai trò: ${tech ? tech.role : 'không tồn tại'}).`
          );
        }
      }
    } else if (t.status === TicketStatus.PENDING) {
      // PENDING: cho phép technicianId null hoặc có thợ (trường hợp BQL thu hồi gán việc về PENDING)
      if (t.technicianId !== null) {
        const tech = userMap.get(t.technicianId);
        if (!tech || tech.role !== Role.TECHNICIAN) {
          invalidTech++;
          errors.push(
            `Ticket #${t.id} ở trạng thái PENDING có technicianId ${t.technicianId} không hợp lệ (không phải TECHNICIAN).`
          );
        }
      }
    } else if (t.status === TicketStatus.CLOSED) {
      // CLOSED: có thể có thợ (nghiệm thu xong) hoặc không có thợ (hủy phiếu trước khi gán việc)
      if (t.technicianId !== null) {
        const tech = userMap.get(t.technicianId);
        if (!tech || tech.role !== Role.TECHNICIAN) {
          invalidTech++;
          errors.push(
            `Ticket #${t.id} ở trạng thái CLOSED có technicianId ${t.technicianId} không phải TECHNICIAN.`
          );
        }
      }
    }

    // 1.4 Kiểm tra Rating nghiệm thu
    if (t.rating !== null && t.rating !== undefined) {
      if (!Number.isInteger(t.rating) || t.rating < 1 || t.rating > 5) {
        invalidRatings++;
        errors.push(
          `Ticket #${t.id} có điểm rating (${t.rating}) không hợp lệ (phải là số nguyên từ 1 đến 5 sao).`
        );
      }

      // Nghiệp vụ nghiệm thu: Chỉ được phép có rating khi ticket đã CLOSED
      if (t.status !== TicketStatus.CLOSED) {
        invalidRatings++;
        errors.push(
          `Ticket #${t.id} có điểm rating (${t.rating}) nhưng trạng thái là ${t.status} (chỉ được phép chấm điểm khi đã CLOSED).`
        );
      }
    }
  }

  // 2. THUẬT TOÁN LỌC PHIẾU TRÙNG LẶP 24 GIỜ (BLOCKER A FIX - KHỚP 100% BACKEND)
  // Quy tắc chuẩn từ backend/src/modules/tickets/tickets.controller.ts (lines 408-428):
  // - Category.trim() khớp chính xác
  // - Thời gian trong vòng 24 giờ trước thời điểm tạo candidate (candidateTime - 24h <= priorTime <= candidateTime)
  // - Phiếu trước có trạng thái thuộc: PENDING, ASSIGNED, IN_PROGRESS
  // - Backend TUYỆT ĐỐI KHÔNG loại trừ phiếu trước có isDuplicate = true
  // - Cùng roomId (nếu là phòng) hoặc cùng residentId & roomId = null (khu vực chung)
  // - Kiểm tra hai chiều:
  //   * Có phiếu trước hợp lệ mà isDuplicate = false -> VIOLATION!
  //   * Không có phiếu trước hợp lệ mà isDuplicate = true -> VIOLATION!
  for (const t of snapshot.tickets) {
    const tTime = new Date(t.createdAt).getTime();
    const oneDayAgo = tTime - 24 * 60 * 60 * 1000;
    const tCategory = t.category.trim();

    // Tìm xem có ít nhất một phiếu tương tự hợp lệ trước đó trong vòng 24 giờ hay không
    const matchingPrior = snapshot.tickets.find((prev) => {
      if (prev.id === t.id) return false;

      const prevTime = new Date(prev.createdAt).getTime();
      // Phiếu trước phải xảy ra trước (hoặc cùng mốc thời gian nhưng ID nhỏ hơn) và trong vòng 24 giờ
      if (prevTime > tTime || prevTime < oneDayAgo) return false;
      if (prevTime === tTime && prev.id >= t.id) return false;

      // Chỉ xét trạng thái PENDING, ASSIGNED, IN_PROGRESS
      if (
        prev.status !== TicketStatus.PENDING &&
        prev.status !== TicketStatus.ASSIGNED &&
        prev.status !== TicketStatus.IN_PROGRESS
      ) {
        return false;
      }

      // So sánh category sau khi trim
      if (prev.category.trim() !== tCategory) return false;

      // Đối chiếu theo phạm vi Căn hộ hoặc Khu vực chung
      if (t.roomId !== null) {
        return prev.roomId === t.roomId;
      } else {
        return prev.roomId === null && prev.residentId === t.residentId;
      }
    });

    const shouldBeDuplicate = !!matchingPrior;

    // KIỂM TRA HAI CHIỀU (Bi-directional Validation):
    if (t.isDuplicate && !shouldBeDuplicate) {
      invalidDuplicate++;
      errors.push(
        `Ticket #${t.id} bị đánh dấu isDuplicate = true nhưng không tìm thấy phiếu gốc hợp lệ nào trong vòng 24 giờ trước đó.`
      );
    } else if (!t.isDuplicate && shouldBeDuplicate) {
      invalidDuplicate++;
      errors.push(
        `Ticket #${t.id} có isDuplicate = false nhưng thực tế đã có phiếu tương tự (#${matchingPrior!.id}) đang xử lý trong vòng 24 giờ trước đó (lẽ ra phải là true).`
      );
    }
  }

  return {
    name: 'Ticket Consistency Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ vòng đời Ticket, phân công thợ, rating và cờ lọc trùng 24h hai chiều hợp lệ 100%.'
        : `Phát hiện ${errors.length} vi phạm Ticket: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} lỗi khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      invalidTechnicianAssignments: invalidTech,
      invalidRatings,
      invalidDuplicateFlags: invalidDuplicate,
      totalErrors: errors.length,
    },
  };
}
