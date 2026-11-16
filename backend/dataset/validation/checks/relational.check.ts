// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN QUAN HỆ & KHÓA NGOẠI (RELATIONAL INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/relational.check.ts
// Đặc tả: Milestone 10 — Kiểm toán quan hệ khóa ngoại và tính nhất quán 8 models
// =========================================================================

import { Role } from '@prisma/client';
import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

export interface RelationalValidationInput {
  invalidRoomReferences: number;
  invalidUserReferences: number;
  staffWithRoomId: number;
  orphanedPayments: number;
  duplicateRoomMonths: number;
}

/**
 * Hàm kiểm tra từ bộ đếm số liệu thô (giữ tương thích ngược với các test cũ)
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
    errors.push(
      `Phát hiện ${input.staffWithRoomId} tài khoản nhân sự (Admin/BQL/Thợ) bị gán roomId trái phép.`
    );
  }

  if (input.orphanedPayments > 0) {
    errors.push(`Phát hiện ${input.orphanedPayments} giao dịch Payment không liên kết được với Invoice.`);
  }

  if (input.duplicateRoomMonths > 0) {
    errors.push(
      `Phát hiện ${input.duplicateRoomMonths} cặp trùng lặp [roomId, month] vi phạm unique constraint.`
    );
  }

  return {
    name: 'Relational Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ quan hệ và khóa ngoại nhất quán.'
        : `Phát hiện ${errors.length} vi phạm quan hệ: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: input,
  };
}

/**
 * Kiểm tra toàn diện tính toàn vẹn quan hệ và khóa ngoại trực tiếp trên Dataset Snapshot
 */
export function validateRelationalIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  const roomMap = new Map<number, (typeof snapshot.rooms)[0]>(
    snapshot.rooms.map((r) => [r.id, r])
  );
  const userMap = new Map<number, (typeof snapshot.users)[0]>(
    snapshot.users.map((u) => [u.id, u])
  );
  const invoiceMap = new Map<number, (typeof snapshot.invoices)[0]>(
    snapshot.invoices.map((i) => [i.id, i])
  );
  const roomNumberSet = new Set<string>(snapshot.rooms.map((r) => r.roomNumber));

  let invalidRoomRefs = 0;
  let invalidUserRefs = 0;
  let staffWithRoomId = 0;
  let orphanedPayments = 0;
  let duplicateRoomMonths = 0;

  // 1. Quan hệ Room / User
  for (const u of snapshot.users) {
    if (u.role === Role.ADMIN || u.role === Role.BQL || u.role === Role.TECHNICIAN) {
      if (u.roomId !== null) {
        staffWithRoomId++;
        errors.push(
          `Nhân sự #${u.id} (${u.username}, vai trò: ${u.role}) không được phép có roomId nhưng có roomId = ${u.roomId}.`
        );
      }
    } else if (u.roomId !== null) {
      if (!roomMap.has(u.roomId)) {
        invalidRoomRefs++;
        errors.push(
          `Cư dân #${u.id} (${u.username}) tham chiếu roomId ${u.roomId} không tồn tại trong danh sách Room.`
        );
      }
    }
    // RESIDENT có thể có roomId === null (được phép theo schema). Không cấm nhiều resident trong cùng một room.
  }

  // 2. Quan hệ Ticket
  for (const t of snapshot.tickets) {
    if (!userMap.has(t.residentId)) {
      invalidUserRefs++;
      errors.push(`Ticket #${t.id} tham chiếu residentId ${t.residentId} không tồn tại.`);
    }

    if (t.technicianId !== null) {
      const tech = userMap.get(t.technicianId);
      if (!tech) {
        invalidUserRefs++;
        errors.push(`Ticket #${t.id} tham chiếu technicianId ${t.technicianId} không tồn tại.`);
      } else if (tech.role !== Role.TECHNICIAN) {
        errors.push(
          `Ticket #${t.id} gán technicianId ${t.technicianId} cho người dùng #${tech.id} có vai trò ${tech.role} (không phải TECHNICIAN).`
        );
      }
    }

    if (t.roomId !== null && !roomMap.has(t.roomId)) {
      invalidRoomRefs++;
      errors.push(`Ticket #${t.id} tham chiếu roomId ${t.roomId} không tồn tại.`);
    }
  }

  // 3. Quan hệ Invoice & Payment & Unique [roomId, month]
  const roomMonthSet = new Set<string>();
  for (const inv of snapshot.invoices) {
    if (!roomMap.has(inv.roomId)) {
      invalidRoomRefs++;
      errors.push(`Hóa đơn #${inv.id} tham chiếu roomId ${inv.roomId} không tồn tại.`);
    }

    const key = `${inv.roomId}_${inv.month}`;
    if (roomMonthSet.has(key)) {
      duplicateRoomMonths++;
      errors.push(
        `Hóa đơn #${inv.id} trùng lặp cặp [roomId: ${inv.roomId}, month: '${inv.month}'] với hóa đơn khác.`
      );
    }
    roomMonthSet.add(key);
  }

  for (const p of snapshot.payments) {
    if (!invoiceMap.has(p.invoiceId)) {
      orphanedPayments++;
      errors.push(
        `Giao dịch Payment #${p.id} tham chiếu invoiceId ${p.invoiceId} không tồn tại (Payment mồ côi).`
      );
    }
  }

  // 4. Quan hệ Feedback
  for (const f of snapshot.feedbacks) {
    const resident = userMap.get(f.residentId);
    if (!resident) {
      invalidUserRefs++;
      errors.push(`Feedback #${f.id} tham chiếu residentId ${f.residentId} không tồn tại.`);
    } else if (resident.role !== Role.RESIDENT) {
      errors.push(
        `Feedback #${f.id} người tạo #${resident.id} có vai trò ${resident.role} (không phải RESIDENT).`
      );
    }

    // Ràng buộc khớp roomId của Feedback với resident.roomId
    if (resident) {
      if (resident.roomId !== null) {
        if (f.roomId !== resident.roomId) {
          errors.push(
            `Feedback #${f.id} của cư dân #${resident.id} có roomId (${f.roomId}) không khớp với resident.roomId (${resident.roomId}). Cư dân có phòng không được gửi phản ánh roomId khác.`
          );
        }
      } else {
        // Cư dân chưa có phòng chỉ được gửi feedback có roomId = null
        if (f.roomId !== null) {
          errors.push(
            `Feedback #${f.id} của cư dân không có phòng #${resident.id} phải có roomId = null nhưng nhận được ${f.roomId}.`
          );
        }
      }
    }

    if (f.roomId !== null && !roomMap.has(f.roomId)) {
      invalidRoomRefs++;
      errors.push(`Feedback #${f.id} tham chiếu roomId ${f.roomId} không tồn tại.`);
    }
  }

  // 5. Quan hệ Notification
  for (const n of snapshot.notifications) {
    if (n.authorId !== null) {
      const author = userMap.get(n.authorId);
      if (!author) {
        invalidUserRefs++;
        errors.push(`Thông báo #${n.id} tham chiếu authorId ${n.authorId} không tồn tại.`);
      } else if (author.role !== Role.ADMIN && author.role !== Role.BQL) {
        errors.push(
          `Thông báo #${n.id} có người tạo #${author.id} mang vai trò ${author.role} (không phải ADMIN hoặc BQL).`
        );
      }
    }

    if (n.targetRoom !== null) {
      if (!roomNumberSet.has(n.targetRoom)) {
        errors.push(
          `Thông báo #${n.id} có targetRoom '${n.targetRoom}' không tồn tại trong danh sách số phòng căn hộ.`
        );
      }
    }
  }

  return {
    name: 'Relational Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ quan hệ và khóa ngoại của 8 models nhất quán 100%.'
        : `Phát hiện ${errors.length} vi phạm quan hệ: ${errors.slice(0, 10).join('; ')}${
            errors.length > 10 ? `... và ${errors.length - 10} lỗi khác` : ''
          }`,
    violationsCount: errors.length,
    errors,
    details: {
      invalidRoomReferences: invalidRoomRefs,
      invalidUserReferences: invalidUserRefs,
      staffWithRoomId,
      orphanedPayments,
      duplicateRoomMonths,
      totalErrors: errors.length,
    },
  };
}
