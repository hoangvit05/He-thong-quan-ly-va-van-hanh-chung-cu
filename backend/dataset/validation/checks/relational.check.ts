// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN QUAN HỆ & KHÓA NGOẠI (RELATIONAL INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/relational.check.ts
// Đặc tả: Milestone 10.1 — Red Team Fix: Kiểm toán khóa ngoại, unique constraint & ID 8 models
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
 * Regex kiểm tra định dạng tháng hợp lệ ISO YYYY-MM (tháng từ 01 đến 12)
 */
const VALID_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

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
 * Kiểm tra toàn diện tính toàn vẹn quan hệ, khóa chính và unique constraint trực tiếp trên Dataset Snapshot
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
  const ticketMap = new Map<number, (typeof snapshot.tickets)[0]>(
    snapshot.tickets.map((t) => [t.id, t])
  );
  const roomNumberSet = new Set<string>();

  let invalidRoomRefs = 0;
  let invalidUserRefs = 0;
  let staffWithRoomId = 0;
  let orphanedPayments = 0;
  let duplicateRoomMonths = 0;

  // 1. Kiểm tra tính duy nhất của ID và các trường Unique trong từng Model (Blocker F)
  // 1.1 Model Room
  const roomIdSet = new Set<number>();
  for (const r of snapshot.rooms) {
    if (roomIdSet.has(r.id)) {
      errors.push(`Bảng Room phát hiện ID trùng lặp: #${r.id}.`);
    }
    roomIdSet.add(r.id);

    if (roomNumberSet.has(r.roomNumber)) {
      errors.push(`Bảng Room phát hiện số phòng (roomNumber) bị trùng lặp: '${r.roomNumber}'.`);
    }
    roomNumberSet.add(r.roomNumber);
  }

  // 1.2 Model User
  const userIdSet = new Set<number>();
  const usernameSet = new Set<string>();
  const emailSet = new Set<string>();
  for (const u of snapshot.users) {
    if (userIdSet.has(u.id)) {
      errors.push(`Bảng User phát hiện ID trùng lặp: #${u.id}.`);
    }
    userIdSet.add(u.id);

    if (usernameSet.has(u.username)) {
      errors.push(`Bảng User phát hiện username bị trùng lặp: '${u.username}'.`);
    }
    usernameSet.add(u.username);

    if (u.email !== null && u.email !== undefined) {
      const emailLower = u.email.toLowerCase();
      if (emailSet.has(emailLower)) {
        errors.push(`Bảng User phát hiện email bị trùng lặp: '${u.email}'.`);
      }
      emailSet.add(emailLower);
    }
  }

  // 1.3 Model Ticket ID
  const ticketIdSet = new Set<number>();
  for (const t of snapshot.tickets) {
    if (ticketIdSet.has(t.id)) {
      errors.push(`Bảng Ticket phát hiện ID trùng lặp: #${t.id}.`);
    }
    ticketIdSet.add(t.id);
  }

  // 1.4 Model Invoice ID
  const invoiceIdSet = new Set<number>();
  for (const inv of snapshot.invoices) {
    if (invoiceIdSet.has(inv.id)) {
      errors.push(`Bảng Invoice phát hiện ID trùng lặp: #${inv.id}.`);
    }
    invoiceIdSet.add(inv.id);
  }

  // 1.5 Model Payment ID
  const paymentIdSet = new Set<number>();
  for (const p of snapshot.payments) {
    if (paymentIdSet.has(p.id)) {
      errors.push(`Bảng Payment phát hiện ID trùng lặp: #${p.id}.`);
    }
    paymentIdSet.add(p.id);
  }

  // 1.6 Model Feedback ID
  const feedbackIdSet = new Set<number>();
  for (const f of snapshot.feedbacks) {
    if (feedbackIdSet.has(f.id)) {
      errors.push(`Bảng Feedback phát hiện ID trùng lặp: #${f.id}.`);
    }
    feedbackIdSet.add(f.id);
  }

  // 1.7 Model Notification ID
  const notificationIdSet = new Set<number>();
  for (const n of snapshot.notifications) {
    if (notificationIdSet.has(n.id)) {
      errors.push(`Bảng Notification phát hiện ID trùng lặp: #${n.id}.`);
    }
    notificationIdSet.add(n.id);
  }

  // 1.8 Model MediaAsset ID (nếu có)
  const mediaAssetIdSet = new Set<number>();
  for (const m of snapshot.mediaAssets) {
    if (m.id !== undefined) {
      if (mediaAssetIdSet.has(m.id)) {
        errors.push(`Bảng MediaAsset phát hiện ID trùng lặp: #${m.id}.`);
      }
      mediaAssetIdSet.add(m.id);
    }
  }

  // 2. Quan hệ Room / User
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
  }

  // 3. Quan hệ Ticket
  for (const t of snapshot.tickets) {
    const creator = userMap.get(t.residentId);
    if (!creator) {
      invalidUserRefs++;
      errors.push(`Ticket #${t.id} tham chiếu residentId ${t.residentId} không tồn tại.`);
    } else {
      // Backend cấm TECHNICIAN tạo ticket
      if (creator.role === Role.TECHNICIAN) {
        errors.push(
          `Ticket #${t.id} có người tạo mang vai trò TECHNICIAN (Thợ kỹ thuật bị cấm tạo phiếu báo hỏng).`
        );
      }
      // Sự cố thuộc căn hộ yêu cầu người tạo là RESIDENT
      if (t.roomId !== null && creator.role !== Role.RESIDENT) {
        errors.push(
          `Ticket #${t.id} của căn hộ #${t.roomId} có người tạo mang vai trò ${creator.role} (sự cố căn hộ bắt buộc người tạo là RESIDENT).`
        );
      }
    }

    if (t.technicianId !== null) {
      const tech = userMap.get(t.technicianId);
      if (!tech) {
        invalidUserRefs++;
        errors.push(`Ticket #${t.id} tham chiếu technicianId ${t.technicianId} không tồn tại.`);
      } else if (tech.role !== Role.TECHNICIAN) {
        errors.push(
          `Ticket #${t.id} gán technicianId ${t.technicianId} cho người dùng mang vai trò ${tech.role} (không phải TECHNICIAN).`
        );
      }
    }

    if (t.roomId !== null && !roomMap.has(t.roomId)) {
      invalidRoomRefs++;
      errors.push(`Ticket #${t.id} tham chiếu roomId ${t.roomId} không tồn tại.`);
    }
  }

  // 4. Quan hệ Invoice & Payment, unique [roomId, month] và định dạng month YYYY-MM
  const roomMonthSet = new Set<string>();
  for (const inv of snapshot.invoices) {
    if (!roomMap.has(inv.roomId)) {
      invalidRoomRefs++;
      errors.push(`Hóa đơn #${inv.id} tham chiếu roomId ${inv.roomId} không tồn tại.`);
    }

    // Kiểm tra định dạng month YYYY-MM (01 đến 12)
    if (typeof inv.month !== 'string' || !VALID_MONTH_REGEX.test(inv.month)) {
      errors.push(
        `Hóa đơn #${inv.id} có month '${inv.month}' không đúng định dạng chuẩn YYYY-MM (tháng từ 01 đến 12).`
      );
    }

    const key = `${inv.roomId}_${inv.month}`;
    if (roomMonthSet.has(key)) {
      duplicateRoomMonths++;
      errors.push(
        `Hóa đơn #${inv.id} trùng lặp cặp [roomId: ${inv.roomId}, month: '${inv.month}'] vi phạm unique constraint.`
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

  // 5. Quan hệ Feedback
  for (const f of snapshot.feedbacks) {
    const resident = userMap.get(f.residentId);
    if (!resident) {
      invalidUserRefs++;
      errors.push(`Feedback #${f.id} tham chiếu residentId ${f.residentId} không tồn tại.`);
    } else if (resident.role !== Role.RESIDENT) {
      errors.push(
        `Feedback #${f.id} người tạo mang vai trò ${resident.role} (chỉ RESIDENT mới có quyền gửi góp ý).`
      );
    }

    if (resident) {
      if (resident.roomId !== null) {
        if (f.roomId !== resident.roomId) {
          errors.push(
            `Feedback #${f.id} của cư dân #${resident.id} có roomId (${f.roomId}) không khớp với resident.roomId (${resident.roomId}).`
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

    if (f.roomId !== null && !roomMap.has(f.roomId)) {
      invalidRoomRefs++;
      errors.push(`Feedback #${f.id} tham chiếu roomId ${f.roomId} không tồn tại.`);
    }
  }

  // 6. Quan hệ Notification
  for (const n of snapshot.notifications) {
    if (n.authorId !== null) {
      const author = userMap.get(n.authorId);
      if (!author) {
        invalidUserRefs++;
        errors.push(`Thông báo #${n.id} tham chiếu authorId ${n.authorId} không tồn tại.`);
      } else if (author.role !== Role.ADMIN && author.role !== Role.BQL) {
        errors.push(
          `Thông báo #${n.id} có tác giả mang vai trò ${author.role} (chỉ ADMIN hoặc BQL mới có quyền phát thông báo).`
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

  // 7. Quan hệ MediaAsset (nếu có tài sản)
  for (const ma of snapshot.mediaAssets) {
    if (ma.uploaderId !== undefined) {
      if (!userMap.has(ma.uploaderId)) {
        invalidUserRefs++;
        errors.push(`MediaAsset #${ma.id ?? ma.publicId} tham chiếu uploaderId ${ma.uploaderId} không tồn tại.`);
      }
    }
    if (ma.ticketId !== undefined && ma.ticketId !== null) {
      if (!ticketMap.has(ma.ticketId)) {
        errors.push(`MediaAsset #${ma.id ?? ma.publicId} tham chiếu ticketId ${ma.ticketId} không tồn tại.`);
      }
    }
  }

  return {
    name: 'Relational Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Toàn bộ quan hệ, khóa ngoại, unique constraint và định dạng tháng nhất quán 100%.'
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
