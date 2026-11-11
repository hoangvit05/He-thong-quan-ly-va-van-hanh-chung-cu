// =========================================================================
// KIỂM THỬ XÁC MINH TICKET GENERATOR (MILESTONE 6 TESTS)
// Phân hệ: backend/dataset/validation/ticket-generator.test.ts
// Đặc tả: Kiểm định 17 yêu cầu bắt buộc của M6 theo controller/validator backend
// =========================================================================

import assert from 'assert';
import { Role, TicketStatus } from '@prisma/client';
import { generateRooms, GeneratedRoom } from '../seed/generators/room.generator';
import { generateUsers, GeneratedUser } from '../seed/generators/user.generator';
import {
  generateTickets,
  evaluateTicketDuplicate,
  GeneratedTicket,
} from '../seed/generators/ticket.generator';
import { checkTicketIntegrity } from './checks/ticket.check';
import { DATASET_CONFIG } from '../config/dataset.config';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('======================================================');
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH TICKET GENERATOR (MILESTONE 6)');
console.log('======================================================');

// Chuẩn bị dữ liệu đầu vào mẫu từ M4 generators
const sampleRooms: GeneratedRoom[] = generateRooms({ count: 100, seed: 20261111 });
const sampleUsers: GeneratedUser[] = generateUsers(sampleRooms, { seed: 20261111 });
const roomMap = new Map<number, GeneratedRoom>(sampleRooms.map((r) => [r.id, r]));
const userMap = new Map<number, GeneratedUser>(sampleUsers.map((u) => [u.id, u]));

// Sinh danh sách vé mặc định để kiểm tra
const tickets: GeneratedTicket[] = generateTickets(sampleUsers, sampleRooms, { seed: 20261111 });

// =========================================================================
// 1. KIỂM THỬ SỐ LƯỢNG & CẤU TRÚC DỮ LIỆU
// =========================================================================
console.log('--- 1. Kiểm thử Số lượng & Cấu trúc ---');

runTest('1.1 Số lượng Ticket mặc định nằm trong khoảng [150, 200]', () => {
  assert.ok(
    tickets.length >= DATASET_CONFIG.TARGET_COUNTS.TICKETS.MIN &&
      tickets.length <= DATASET_CONFIG.TARGET_COUNTS.TICKETS.MAX,
    `Số lượng Ticket (${tickets.length}) phải nằm trong [${DATASET_CONFIG.TARGET_COUNTS.TICKETS.MIN}, ${DATASET_CONFIG.TARGET_COUNTS.TICKETS.MAX}]`
  );
  assert.strictEqual(tickets.length, 175, 'Mặc định sinh đúng 175 Ticket');
});

runTest('1.2 Toàn bộ ID của Ticket là duy nhất và tăng dần bắt đầu từ 1', () => {
  const ids = tickets.map((t) => t.id);
  const idSet = new Set(ids);
  assert.strictEqual(idSet.size, tickets.length, 'ID ticket không được trùng lặp');
  for (let i = 0; i < tickets.length; i++) {
    assert.strictEqual(tickets[i].id, i + 1, `ID tại vị trí ${i} phải là ${i + 1}`);
  }
});

runTest('1.3 Có đầy đủ cả 5 trạng thái TicketStatus theo quy chuẩn Prisma schema', () => {
  const statuses = new Set(tickets.map((t) => t.status));
  assert.ok(statuses.has(TicketStatus.PENDING), 'Thiếu trạng thái PENDING');
  assert.ok(statuses.has(TicketStatus.ASSIGNED), 'Thiếu trạng thái ASSIGNED');
  assert.ok(statuses.has(TicketStatus.IN_PROGRESS), 'Thiếu trạng thái IN_PROGRESS');
  assert.ok(statuses.has(TicketStatus.COMPLETED), 'Thiếu trạng thái COMPLETED');
  assert.ok(statuses.has(TicketStatus.CLOSED), 'Thiếu trạng thái CLOSED');
  assert.strictEqual(statuses.size, 5, 'Phải có đầy đủ 5 trạng thái');
});

runTest('1.4 Tiêu đề, danh mục và mô tả không rỗng, giới hạn ký tự chuẩn validator', () => {
  for (const t of tickets) {
    assert.ok(t.title && t.title.trim().length > 0, `Ticket ${t.id} thiếu title`);
    assert.ok(t.title.trim().length <= 100, `Ticket ${t.id} title vượt quá 100 ký tự`);

    assert.ok(t.category && t.category.trim().length > 0, `Ticket ${t.id} thiếu category`);
    assert.ok(t.category.trim().length <= 50, `Ticket ${t.id} category vượt quá 50 ký tự`);

    assert.ok(t.description && t.description.trim().length >= 5, `Ticket ${t.id} description quá ngắn`);
    assert.ok(t.description.trim().length <= 2000, `Ticket ${t.id} description vượt quá 2000 ký tự`);
  }
});

// =========================================================================
// 2. KIỂM THỬ KHÓA NGOẠI & PHÂN QUYỀN RBAC
// =========================================================================
console.log('--- 2. Kiểm thử Khóa ngoại & Phân quyền RBAC ---');

runTest('2.1 Mọi residentId đều tham chiếu tới User có thật trong dữ liệu đầu vào', () => {
  for (const t of tickets) {
    const creator = userMap.get(t.residentId);
    assert.ok(creator, `Ticket ${t.id} có residentId ${t.residentId} không tồn tại`);
    // Người tạo vé hợp lệ: RESIDENT hoặc Ban quản lý tạo thay
    assert.ok(
      creator.role === Role.RESIDENT || creator.role === Role.BQL || creator.role === Role.ADMIN,
      `Ticket ${t.id} người tạo có vai trò không hợp lệ: ${creator.role}`
    );
  }
});

runTest('2.2 Người tạo vé chủ đạo là RESIDENT (>= 90%)', () => {
  const residentCreated = tickets.filter((t) => userMap.get(t.residentId)?.role === Role.RESIDENT);
  const ratio = residentCreated.length / tickets.length;
  assert.ok(
    ratio >= 0.9,
    `Tỷ lệ vé do RESIDENT tạo (${(ratio * 100).toFixed(1)}%) phải đạt tối thiểu 90%`
  );
});

runTest('2.3 Mọi roomId (khi không null) đều tham chiếu tới Room có thật', () => {
  for (const t of tickets) {
    if (t.roomId !== null) {
      assert.ok(roomMap.has(t.roomId), `Ticket ${t.id} có roomId ${t.roomId} không tồn tại`);
    }
  }
});

runTest('2.4 Tồn tại sự cố khu vực chung (roomId = null)', () => {
  const commonAreaTickets = tickets.filter((t) => t.roomId === null);
  assert.ok(
    commonAreaTickets.length > 0,
    'Phải có ít nhất một sự cố khu vực chung có roomId = null'
  );
  const commonRatio = commonAreaTickets.length / tickets.length;
  assert.ok(
    commonRatio >= 0.05 && commonRatio <= 0.35,
    `Tỷ lệ sự cố khu vực chung (${(commonRatio * 100).toFixed(1)}%) phải nằm trong [5%, 35%]`
  );
});

runTest('2.5 Mọi technicianId (khi không null) đều tham chiếu tới User có role TECHNICIAN', () => {
  for (const t of tickets) {
    if (t.technicianId !== null) {
      const tech = userMap.get(t.technicianId);
      assert.ok(tech, `Ticket ${t.id} gán technicianId ${t.technicianId} không tồn tại`);
      assert.strictEqual(
        tech.role,
        Role.TECHNICIAN,
        `Ticket ${t.id} gán cho user ${tech.id} có vai trò ${tech.role}, không phải TECHNICIAN`
      );
    }
  }
});

// =========================================================================
// 3. KIỂM THỬ QUY TẮC TECHNICIAN THEO TRẠNG THÁI VÒNG ĐỜI
// =========================================================================
console.log('--- 3. Kiểm thử Quy tắc Technician theo Trạng thái ---');

runTest('3.1 ASSIGNED, IN_PROGRESS, COMPLETED bắt buộc 100% phải có technicianId', () => {
  const requiringTech = tickets.filter(
    (t) =>
      t.status === TicketStatus.ASSIGNED ||
      t.status === TicketStatus.IN_PROGRESS ||
      t.status === TicketStatus.COMPLETED
  );

  for (const t of requiringTech) {
    assert.ok(
      t.technicianId !== null,
      `Ticket ${t.id} ở trạng thái ${t.status} nhưng thiếu technicianId`
    );
  }
});

runTest('3.2 PENDING đa số không có thợ, nhưng tồn tại kịch bản thu hồi gán việc giữ thợ cũ', () => {
  const pendingTickets = tickets.filter((t) => t.status === TicketStatus.PENDING);
  assert.ok(pendingTickets.length > 0, 'Phải có vé PENDING');

  const pendingWithoutTech = pendingTickets.filter((t) => t.technicianId === null);
  const pendingWithTech = pendingTickets.filter((t) => t.technicianId !== null);

  assert.ok(
    pendingWithoutTech.length > 0,
    'Đa số vé PENDING phải có technicianId = null'
  );
  assert.ok(
    pendingWithTech.length > 0,
    'Phải có ít nhất 1 vé PENDING giữ technicianId cũ (kịch bản BQL thu hồi gán việc)'
  );
});

runTest('3.3 CLOSED không bị ép buộc phải có Technician (tồn tại cả có thợ và không có thợ)', () => {
  const closedTickets = tickets.filter((t) => t.status === TicketStatus.CLOSED);
  assert.ok(closedTickets.length > 0, 'Phải có vé CLOSED');

  const closedWithTech = closedTickets.filter((t) => t.technicianId !== null);
  const closedWithoutTech = closedTickets.filter((t) => t.technicianId === null);

  assert.ok(
    closedWithTech.length > 0,
    'Phải có vé CLOSED đã qua sửa chữa có technicianId'
  );
  assert.ok(
    closedWithoutTech.length > 0,
    'Phải có vé CLOSED bị hủy từ PENDING có technicianId = null'
  );
});

// =========================================================================
// 4. KIỂM THỬ VẬT TƯ (MATERIALS) & TỆP ĐÍNH KÈM (MEDIA)
// =========================================================================
console.log('--- 4. Kiểm thử Vật tư & Tệp đính kèm Media ---');

runTest('4.1 PENDING và ASSIGNED tuyệt đối không có kê khai vật tư (materials = null)', () => {
  const earlyTickets = tickets.filter(
    (t) => t.status === TicketStatus.PENDING || t.status === TicketStatus.ASSIGNED
  );

  for (const t of earlyTickets) {
    assert.strictEqual(
      t.materials,
      null,
      `Ticket ${t.id} ở trạng thái ${t.status} không được phép có materials`
    );
  }
});

runTest('4.2 Vật tư (materials) chỉ xuất hiện ở các trạng thái được phép (IN_PROGRESS, COMPLETED, CLOSED)', () => {
  for (const t of tickets) {
    if (t.materials !== null) {
      assert.ok(
        t.status === TicketStatus.IN_PROGRESS ||
          t.status === TicketStatus.COMPLETED ||
          t.status === TicketStatus.CLOSED,
        `Ticket ${t.id} có materials nhưng ở trạng thái không được phép: ${t.status}`
      );
    }
  }
});

runTest('4.3 Không tạo Cloudinary URL, publicId hoặc MediaAsset giả', () => {
  for (const t of tickets) {
    assert.strictEqual(t.mediaUrl, null, `Ticket ${t.id} không được tạo mediaUrl giả`);
    assert.strictEqual(
      t.completedMediaUrl,
      null,
      `Ticket ${t.id} không được tạo completedMediaUrl giả`
    );
  }
});

// =========================================================================
// 5. KIỂM THỬ ĐÁNH GIÁ NGHIỆM THU (RATING)
// =========================================================================
console.log('--- 5. Kiểm thử Đánh giá Nghiệm thu (Rating) ---');

runTest('5.1 Các trạng thái chưa đóng (PENDING, ASSIGNED, IN_PROGRESS, COMPLETED) tuyệt đối không có rating', () => {
  const nonClosed = tickets.filter((t) => t.status !== TicketStatus.CLOSED);
  for (const t of nonClosed) {
    assert.strictEqual(
      t.rating,
      null,
      `Ticket ${t.id} trạng thái ${t.status} không được có rating`
    );
    assert.strictEqual(
      t.ratingComment,
      null,
      `Ticket ${t.id} trạng thái ${t.status} không được có ratingComment`
    );
  }
});

runTest('5.2 Mọi rating tồn tại đều là số nguyên từ 1 đến 5 sao theo validator', () => {
  const ratedTickets = tickets.filter((t) => t.rating !== null);
  assert.ok(ratedTickets.length > 0, 'Phải có ít nhất một vé có rating');

  for (const t of ratedTickets) {
    assert.ok(
      Number.isInteger(t.rating) && t.rating! >= 1 && t.rating! <= 5,
      `Ticket ${t.id} rating không hợp lệ: ${t.rating}`
    );
    if (t.ratingComment !== null) {
      assert.ok(
        t.ratingComment.length <= 500,
        `Ticket ${t.id} ratingComment vượt quá 500 ký tự`
      );
    }
  }
});

runTest('5.3 Vé CLOSED bị hủy (cancellation) không có rating', () => {
  const closedTickets = tickets.filter((t) => t.status === TicketStatus.CLOSED);
  const unratedClosed = closedTickets.filter((t) => t.rating === null);
  assert.ok(
    unratedClosed.length > 0,
    'Phải tồn tại vé CLOSED không có rating (vé bị hủy, không qua nghiệm thu hoàn tất)'
  );
});

// =========================================================================
// 6. KIỂM THỬ THUẬT TOÁN CHỐNG PHIẾU TRÙNG LẶP (DUPLICATE DETECTION)
// =========================================================================
console.log('--- 6. Kiểm thử Thuật toán Chống Phiếu Trùng Lặp 24h ---');

runTest('6.1 Tồn tại vé gửi trùng lặp hợp lệ (isDuplicate = true) cho cả Room và Khu vực chung', () => {
  const duplicates = tickets.filter((t) => t.isDuplicate);
  assert.ok(
    duplicates.length >= 4,
    `Số lượng vé duplicate (${duplicates.length}) phải tối thiểu là 4`
  );

  const roomDups = duplicates.filter((t) => t.roomId !== null);
  const commonDups = duplicates.filter((t) => t.roomId === null);

  assert.ok(roomDups.length > 0, 'Phải có vé duplicate theo Căn hộ (cùng roomId)');
  assert.ok(commonDups.length > 0, 'Phải có vé duplicate theo Khu vực chung (roomId = null, cùng residentId)');
});

runTest('6.2 Mọi vé có isDuplicate = true đều tìm thấy ít nhất 1 vé gốc hợp lệ trong vòng 24h trước đó', () => {
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (!t.isDuplicate) continue;

    const candidateTime = t.createdAt.getTime();
    const oneDayAgo = candidateTime - 24 * 60 * 60 * 1000;
    const catTrimmed = t.category.trim();

    // Tìm trong các vé xuất hiện trước t
    const priorTickets = tickets.slice(0, i);
    const matchingPrior = priorTickets.filter((prev) => {
      const pTime = prev.createdAt.getTime();
      if (pTime < oneDayAgo || pTime > candidateTime) return false;
      if (
        prev.status !== TicketStatus.PENDING &&
        prev.status !== TicketStatus.ASSIGNED &&
        prev.status !== TicketStatus.IN_PROGRESS
      ) {
        return false;
      }
      if (prev.category.trim() !== catTrimmed) return false;

      if (t.roomId !== null) {
        return prev.roomId === t.roomId;
      } else {
        return prev.roomId === null && prev.residentId === t.residentId;
      }
    });

    assert.ok(
      matchingPrior.length > 0,
      `Ticket ${t.id} bị đánh dấu isDuplicate = true nhưng không có vé gốc hợp lệ thỏa mãn 24h`
    );
  }
});

runTest('6.3 Vé gốc ban đầu KHÔNG bị đổi cờ isDuplicate (vẫn giữ isDuplicate = false)', () => {
  // Vé đầu tiên của từng nhóm trùng lặp phải có isDuplicate = false
  const duplicates = tickets.filter((t) => t.isDuplicate);
  for (const dup of duplicates) {
    const candidateTime = dup.createdAt.getTime();
    const oneDayAgo = candidateTime - 24 * 60 * 60 * 1000;

    const priorOriginal = tickets.find((prev) => {
      if (prev.id >= dup.id) return false;
      const pTime = prev.createdAt.getTime();
      if (pTime < oneDayAgo || pTime > candidateTime) return false;
      if (prev.category.trim() !== dup.category.trim()) return false;
      if (dup.roomId !== null) {
        return prev.roomId === dup.roomId;
      } else {
        return prev.roomId === null && prev.residentId === dup.residentId;
      }
    });

    if (priorOriginal) {
      assert.strictEqual(
        priorOriginal.isDuplicate,
        false,
        `Vé gốc ${priorOriginal.id} bị gán nhầm isDuplicate = true`
      );
    }
  }
});

runTest('6.4 (Phủ định) Không đánh dấu duplicate nếu khác Category', () => {
  const baseTicket: GeneratedTicket = {
    id: 1001,
    title: 'Hỏng điện',
    category: 'Hệ thống điện & chiếu sáng',
    description: 'Chập điện ổ cắm',
    mediaUrl: null,
    status: TicketStatus.PENDING,
    roomId: 1,
    residentId: 10,
    technicianId: null,
    materials: null,
    completedMediaUrl: null,
    rating: null,
    ratingComment: null,
    isDuplicate: false,
    createdAt: new Date('2026-10-15T08:00:00.000Z'),
    updatedAt: new Date('2026-10-15T08:00:00.000Z'),
  };

  const newTicketCandidate = {
    category: 'Cấp thoát nước & vệ sinh', // KHÁC category
    roomId: 1,
    residentId: 10,
    createdAt: new Date('2026-10-15T10:00:00.000Z'), // Sau 2 giờ
  };

  const isDup = evaluateTicketDuplicate(newTicketCandidate, [baseTicket]);
  assert.strictEqual(isDup, false, 'Khác category không được coi là duplicate');
});

runTest('6.5 (Phủ định) Không đánh dấu duplicate nếu ngoài 24 giờ (> 24h)', () => {
  const baseTicket: GeneratedTicket = {
    id: 1002,
    title: 'Hỏng điện',
    category: 'Hệ thống điện & chiếu sáng',
    description: 'Chập điện',
    mediaUrl: null,
    status: TicketStatus.PENDING,
    roomId: 2,
    residentId: 11,
    technicianId: null,
    materials: null,
    completedMediaUrl: null,
    rating: null,
    ratingComment: null,
    isDuplicate: false,
    createdAt: new Date('2026-10-15T08:00:00.000Z'),
    updatedAt: new Date('2026-10-15T08:00:00.000Z'),
  };

  const newTicketCandidate = {
    category: 'Hệ thống điện & chiếu sáng',
    roomId: 2,
    residentId: 11,
    createdAt: new Date('2026-10-16T09:00:01.000Z'), // Sau 25 giờ 1 giây
  };

  const isDup = evaluateTicketDuplicate(newTicketCandidate, [baseTicket]);
  assert.strictEqual(isDup, false, 'Ngoài 24 giờ không được coi là duplicate');
});

runTest('6.6 (Phủ định) Không đánh dấu duplicate nếu vé cũ đã COMPLETED hoặc CLOSED', () => {
  const completedTicket: GeneratedTicket = {
    id: 1003,
    title: 'Hỏng điện đã sửa',
    category: 'Hệ thống điện & chiếu sáng',
    description: 'Đã sửa xong',
    mediaUrl: null,
    status: TicketStatus.COMPLETED, // ĐÃ XONG
    roomId: 3,
    residentId: 12,
    technicianId: 3,
    materials: 'Aptomat',
    completedMediaUrl: null,
    rating: null,
    ratingComment: null,
    isDuplicate: false,
    createdAt: new Date('2026-10-15T08:00:00.000Z'),
    updatedAt: new Date('2026-10-15T12:00:00.000Z'),
  };

  const closedTicket: GeneratedTicket = {
    id: 1004,
    title: 'Hỏng điện đã đóng',
    category: 'Hệ thống điện & chiếu sáng',
    description: 'Đã đóng nghiệm thu',
    mediaUrl: null,
    status: TicketStatus.CLOSED, // ĐÃ ĐÓNG
    roomId: 4,
    residentId: 13,
    technicianId: 3,
    materials: 'Aptomat',
    completedMediaUrl: null,
    rating: 5,
    ratingComment: 'Tốt',
    isDuplicate: false,
    createdAt: new Date('2026-10-15T08:00:00.000Z'),
    updatedAt: new Date('2026-10-15T14:00:00.000Z'),
  };

  const cand1 = {
    category: 'Hệ thống điện & chiếu sáng',
    roomId: 3,
    residentId: 12,
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
  };
  const cand2 = {
    category: 'Hệ thống điện & chiếu sáng',
    roomId: 4,
    residentId: 13,
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
  };

  assert.strictEqual(evaluateTicketDuplicate(cand1, [completedTicket]), false);
  assert.strictEqual(evaluateTicketDuplicate(cand2, [closedTicket]), false);
});

runTest('6.7 (Phủ định) Không đánh dấu duplicate khu vực chung nếu KHÁC cư dân tạo vé', () => {
  const commonTicket: GeneratedTicket = {
    id: 1005,
    title: 'Thang máy kêu',
    category: 'Hệ thống thang máy',
    description: 'Rung lắc thang 1',
    mediaUrl: null,
    status: TicketStatus.PENDING,
    roomId: null, // Khu vực chung
    residentId: 20, // Cư dân A
    technicianId: null,
    materials: null,
    completedMediaUrl: null,
    rating: null,
    ratingComment: null,
    isDuplicate: false,
    createdAt: new Date('2026-10-15T08:00:00.000Z'),
    updatedAt: new Date('2026-10-15T08:00:00.000Z'),
  };

  const candDifferentResident = {
    category: 'Hệ thống thang máy',
    roomId: null,
    residentId: 21, // Cư dân B khác cư dân A
    createdAt: new Date('2026-10-15T09:00:00.000Z'),
  };

  const isDup = evaluateTicketDuplicate(candDifferentResident, [commonTicket]);
  assert.strictEqual(isDup, false, 'Khu vực chung khác cư dân không được coi là duplicate');
});

// =========================================================================
// 7. KIỂM THỬ THỜI GIAN & TÍNH ĐƠN ĐỊNH (DETERMINISM)
// =========================================================================
console.log('--- 7. Kiểm thử Thời gian & Tính Đơn định ---');

runTest('7.1 Mọi ticket có updatedAt >= createdAt hợp lệ theo tiến trình thời gian', () => {
  for (const t of tickets) {
    assert.ok(
      t.createdAt instanceof Date && !isNaN(t.createdAt.getTime()),
      `Ticket ${t.id} createdAt không hợp lệ`
    );
    assert.ok(
      t.updatedAt instanceof Date && !isNaN(t.updatedAt.getTime()),
      `Ticket ${t.id} updatedAt không hợp lệ`
    );
    assert.ok(
      t.updatedAt.getTime() >= t.createdAt.getTime(),
      `Ticket ${t.id} có updatedAt trước createdAt: ${t.updatedAt.toISOString()} < ${t.createdAt.toISOString()}`
    );
  }
});

runTest('7.2 Cùng seed và input tạo kết quả 100% giống nhau (Deterministic)', () => {
  const tickets2 = generateTickets(sampleUsers, sampleRooms, { seed: 20261111 });
  assert.strictEqual(tickets2.length, tickets.length, 'Số lượng phải giống nhau');

  for (let i = 0; i < tickets.length; i++) {
    const a = tickets[i];
    const b = tickets2[i];
    assert.strictEqual(a.id, b.id);
    assert.strictEqual(a.title, b.title);
    assert.strictEqual(a.category, b.category);
    assert.strictEqual(a.status, b.status);
    assert.strictEqual(a.roomId, b.roomId);
    assert.strictEqual(a.residentId, b.residentId);
    assert.strictEqual(a.technicianId, b.technicianId);
    assert.strictEqual(a.materials, b.materials);
    assert.strictEqual(a.rating, b.rating);
    assert.strictEqual(a.isDuplicate, b.isDuplicate);
    assert.strictEqual(a.createdAt.getTime(), b.createdAt.getTime());
    assert.strictEqual(a.updatedAt.getTime(), b.updatedAt.getTime());
  }
});

runTest('7.3 Khác seed tạo kết quả phân bổ và thời gian khác nhau', () => {
  const ticketsDifferentSeed = generateTickets(sampleUsers, sampleRooms, { seed: 99999999 });
  let diffCount = 0;
  for (let i = 0; i < Math.min(tickets.length, ticketsDifferentSeed.length); i++) {
    if (
      tickets[i].createdAt.getTime() !== ticketsDifferentSeed[i].createdAt.getTime() ||
      tickets[i].title !== ticketsDifferentSeed[i].title
    ) {
      diffCount++;
    }
  }
  assert.ok(diffCount > 10, 'Khác seed phải tạo dữ liệu khác nhau');
});

// =========================================================================
// 8. KIỂM THỬ RÀNG BUỘC ĐẦU VÀO & NGOẠI LỆ (INPUT VALIDATION)
// =========================================================================
console.log('--- 8. Kiểm thử Ràng buộc Đầu vào & Ngoại lệ ---');

runTest('8.1 Danh sách User hoặc Room rỗng phải ném lỗi rõ ràng', () => {
  assert.throws(
    () => {
      generateTickets([], sampleRooms);
    },
    /Danh sách User đầu vào rỗng/
  );
  assert.throws(
    () => {
      generateTickets(sampleUsers, []);
    },
    /Danh sách Room đầu vào rỗng/
  );
});

runTest('8.2 Thiếu vai trò RESIDENT hoặc TECHNICIAN phải ném lỗi', () => {
  const noResidents = sampleUsers.filter((u) => u.role !== Role.RESIDENT);
  assert.throws(
    () => {
      generateTickets(noResidents, sampleRooms);
    },
    /Không tìm thấy User nào có vai trò RESIDENT/
  );

  const noTechs = sampleUsers.filter((u) => u.role !== Role.TECHNICIAN);
  assert.throws(
    () => {
      generateTickets(noTechs, sampleRooms);
    },
    /Không tìm thấy User nào có vai trò TECHNICIAN/
  );
});

runTest('8.3 Tham số count không hợp lệ (NaN, số âm, số thực) phải ném lỗi', () => {
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { count: NaN });
    },
    /count phải là số nguyên không âm/
  );
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { count: -10 });
    },
    /count phải là số nguyên không âm/
  );
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { count: 12.5 });
    },
    /count phải là số nguyên không âm/
  );
});

runTest('8.4 Tham số duplicateRate và commonAreaRate ngoài [0, 1] phải ném lỗi', () => {
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { duplicateRate: -0.1 });
    },
    /duplicateRate phải là số thực trong đoạn \[0, 1\]/
  );
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { duplicateRate: 1.5 });
    },
    /duplicateRate phải là số thực trong đoạn \[0, 1\]/
  );
  assert.throws(
    () => {
      generateTickets(sampleUsers, sampleRooms, { commonAreaRate: 2 });
    },
    /commonAreaRate phải là số thực trong đoạn \[0, 1\]/
  );
});

runTest('8.5 Khi count = 0 trả về mảng rỗng []', () => {
  const empty = generateTickets(sampleUsers, sampleRooms, { count: 0 });
  assert.strictEqual(empty.length, 0);
});

// =========================================================================
// 9. TÍCH HỢP VỚI CHECK TICKET INTEGRITY (KIỂM ĐỊNH TÍCH HỢP TOÀN DIỆN)
// =========================================================================
console.log('--- 9. Tích hợp Ticket Consistency Check ---');

runTest('9.1 Toàn bộ dữ liệu vượt qua checkTicketIntegrity của hệ thống với 0 vi phạm', () => {
  let invalidTech = 0;
  let invalidRatings = 0;
  let invalidDup = 0;

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    // Kiểm tra gán thợ
    if (
      t.status === TicketStatus.ASSIGNED ||
      t.status === TicketStatus.IN_PROGRESS ||
      t.status === TicketStatus.COMPLETED
    ) {
      if (!t.technicianId || userMap.get(t.technicianId)?.role !== Role.TECHNICIAN) {
        invalidTech++;
      }
    }
    // Kiểm tra rating
    if (t.rating !== null && (t.status !== TicketStatus.CLOSED || t.rating < 1 || t.rating > 5)) {
      invalidRatings++;
    }
    // Kiểm tra cờ duplicate
    const priorTickets = tickets.slice(0, i);
    const expectedDup = evaluateTicketDuplicate(
      {
        category: t.category,
        roomId: t.roomId,
        residentId: t.residentId,
        createdAt: t.createdAt,
      },
      priorTickets
    );
    if (t.isDuplicate !== expectedDup) {
      invalidDup++;
    }
  }

  const checkResult = checkTicketIntegrity({
    invalidTechnicianAssignments: invalidTech,
    invalidRatings: invalidRatings,
    invalidDuplicateFlags: invalidDup,
    invalidTransitions: 0,
  });

  assert.strictEqual(checkResult.passed, true, `Ticket check thất bại: ${checkResult.message}`);
  assert.strictEqual(invalidTech, 0, 'Không được có lỗi gán thợ');
  assert.strictEqual(invalidRatings, 0, 'Không được có lỗi rating');
  assert.strictEqual(invalidDup, 0, 'Không được có sai lệch cờ duplicate');
});

// =========================================================================
// 10. KIỂM THỬ HỒI QUY M6.1: DUPLICATE RATE EDGE CASES
// =========================================================================
console.log('--- 10. Kiểm thử Hồi quy M6.1: Duplicate Rate Edge Cases ---');

runTest('10.1 count = 175, duplicateRate = 0: sinh đúng 175 Ticket và 0 duplicate', () => {
  const result = generateTickets(sampleUsers, sampleRooms, { count: 175, duplicateRate: 0, seed: 20261111 });
  assert.strictEqual(result.length, 175, 'Phải sinh đúng 175 Ticket');
  const dups = result.filter((t) => t.isDuplicate);
  assert.strictEqual(dups.length, 0, 'Tuyệt đối không được có vé duplicate khi duplicateRate = 0');
});

runTest('10.2 count = 175, duplicateRate = 0.06: sinh đúng 175 Ticket và 11 duplicate (bảo toàn M6)', () => {
  const result = generateTickets(sampleUsers, sampleRooms, { count: 175, duplicateRate: 0.06, seed: 20261111 });
  assert.strictEqual(result.length, 175, 'Phải sinh đúng 175 Ticket');
  const dups = result.filter((t) => t.isDuplicate);
  assert.strictEqual(dups.length, 11, 'Số lượng duplicate phải là đúng 11 theo baseline M6');
});

runTest('10.3 count = 175, duplicateRate = 1: sinh đúng 175 Ticket, có Ticket gốc và duplicate hợp lệ', () => {
  const result = generateTickets(sampleUsers, sampleRooms, { count: 175, duplicateRate: 1, seed: 20261111 });
  assert.strictEqual(result.length, 175, 'Phải sinh đúng 175 Ticket');
  const originals = result.filter((t) => !t.isDuplicate);
  const dups = result.filter((t) => t.isDuplicate);
  assert.ok(originals.length >= 1, 'Phải có ít nhất 1 Ticket gốc');
  assert.ok(dups.length > 0, 'Phải có duplicate');
  assert.strictEqual(originals.length + dups.length, 175);

  // Mọi duplicate đều phải có nguồn hợp lệ theo thuật toán 24h
  for (let i = 0; i < result.length; i++) {
    const prior = result.slice(0, i);
    const expected = evaluateTicketDuplicate(result[i], prior);
    assert.strictEqual(result[i].isDuplicate, expected, `Sai lệch cờ isDuplicate tại vị trí ${i}`);
  }
});

runTest('10.4 count = 50, duplicateRate = 1: sinh đúng 50 Ticket, không thiếu dữ liệu', () => {
  const result = generateTickets(sampleUsers, sampleRooms, { count: 50, duplicateRate: 1, seed: 20261111 });
  assert.strictEqual(result.length, 50, 'Phải sinh đúng 50 Ticket không thiếu');
  const originals = result.filter((t) => !t.isDuplicate);
  const dups = result.filter((t) => t.isDuplicate);
  assert.ok(originals.length >= 1, 'Phải có ít nhất 1 Ticket gốc');
  assert.ok(dups.length > 0, 'Phải có duplicate');
  assert.strictEqual(originals.length + dups.length, 50);

  for (let i = 0; i < result.length; i++) {
    const prior = result.slice(0, i);
    const expected = evaluateTicketDuplicate(result[i], prior);
    assert.strictEqual(result[i].isDuplicate, expected, `Sai lệch cờ isDuplicate tại vị trí ${i}`);
  }
});

runTest('10.5 count = 1, duplicateRate = 1: không tạo duplicate không có nguồn (sinh đúng 1 Ticket gốc)', () => {
  const result = generateTickets(sampleUsers, sampleRooms, { count: 1, duplicateRate: 1, seed: 20261111 });
  assert.strictEqual(result.length, 1, 'Phải sinh đúng 1 Ticket');
  assert.strictEqual(result[0].isDuplicate, false, 'Ticket duy nhất không thể là duplicate do không có nguồn');
});

runTest('10.6 Cùng seed và input vẫn hoàn toàn deterministic trong mọi edge cases', () => {
  const r1 = generateTickets(sampleUsers, sampleRooms, { count: 50, duplicateRate: 1, seed: 12345 });
  const r2 = generateTickets(sampleUsers, sampleRooms, { count: 50, duplicateRate: 1, seed: 12345 });
  assert.strictEqual(r1.length, r2.length);
  for (let i = 0; i < r1.length; i++) {
    assert.strictEqual(r1[i].id, r2[i].id);
    assert.strictEqual(r1[i].isDuplicate, r2[i].isDuplicate);
    assert.strictEqual(r1[i].createdAt.getTime(), r2[i].createdAt.getTime());
  }
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M6/M6.1 ĐẠT CHUẨN!`);
console.log('======================================================');

