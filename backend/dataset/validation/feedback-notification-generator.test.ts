// =========================================================================
// KIỂM THỬ XÁC MINH FEEDBACK & NOTIFICATION GENERATORS (MILESTONE 7 TESTS)
// Phân hệ: backend/dataset/validation/feedback-notification-generator.test.ts
// Đặc tả: Kiểm định toàn diện phân hệ Hòm thư góp ý và Thông báo tòa nhà
// =========================================================================

import assert from 'assert';
import { Role } from '@prisma/client';
import { generateRooms, GeneratedRoom } from '../seed/generators/room.generator';
import { generateUsers, GeneratedUser } from '../seed/generators/user.generator';
import {
  generateFeedbacks,
  GeneratedFeedback,
} from '../seed/generators/feedback.generator';
import {
  generateNotifications,
  GeneratedNotification,
} from '../seed/generators/notification.generator';
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
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH FEEDBACK & NOTIFICATION GENERATORS (M7)');
console.log('======================================================');

// Chuẩn bị dữ liệu mẫu từ M4
const sampleRooms: GeneratedRoom[] = generateRooms({ count: 100, seed: 20261111 });
const sampleUsers: GeneratedUser[] = generateUsers(sampleRooms, { seed: 20261111 });

const roomMap = new Map<number, GeneratedRoom>(sampleRooms.map((r) => [r.id, r]));
const userMap = new Map<number, GeneratedUser>(sampleUsers.map((u) => [u.id, u]));
const roomNumbers = new Set<string>(sampleRooms.map((r) => r.roomNumber));

// Sinh dữ liệu mặc định để kiểm định
const feedbacks: GeneratedFeedback[] = generateFeedbacks(sampleUsers, sampleRooms, { seed: 20261111 });
const notifications: GeneratedNotification[] = generateNotifications(sampleUsers, sampleRooms, { seed: 20261111 });

// =========================================================================
// 1. KIỂM THỬ SỐ LƯỢNG & QUY MÔ TARGET
// =========================================================================
console.log('--- 1. Kiểm thử Số lượng & Quy mô Target ---');

runTest('1.1 Số lượng Feedback nằm trong khoảng target [30, 50]', () => {
  assert.ok(
    feedbacks.length >= DATASET_CONFIG.TARGET_COUNTS.FEEDBACKS.MIN &&
      feedbacks.length <= DATASET_CONFIG.TARGET_COUNTS.FEEDBACKS.MAX,
    `Số lượng Feedback (${feedbacks.length}) phải nằm trong [${DATASET_CONFIG.TARGET_COUNTS.FEEDBACKS.MIN}, ${DATASET_CONFIG.TARGET_COUNTS.FEEDBACKS.MAX}]`
  );
  assert.strictEqual(feedbacks.length, 40, 'Mặc định sinh đúng 40 Feedback');
});

runTest('1.2 Số lượng Notification nằm trong khoảng target [20, 30]', () => {
  assert.ok(
    notifications.length >= DATASET_CONFIG.TARGET_COUNTS.NOTIFICATIONS.MIN &&
      notifications.length <= DATASET_CONFIG.TARGET_COUNTS.NOTIFICATIONS.MAX,
    `Số lượng Notification (${notifications.length}) phải nằm trong [${DATASET_CONFIG.TARGET_COUNTS.NOTIFICATIONS.MIN}, ${DATASET_CONFIG.TARGET_COUNTS.NOTIFICATIONS.MAX}]`
  );
  assert.strictEqual(notifications.length, 25, 'Mặc định sinh đúng 25 Notification');
});

runTest('1.3 ID của Feedback và Notification tăng dần từ 1 và không bị trùng lặp', () => {
  const fIds = feedbacks.map((f) => f.id);
  const nIds = notifications.map((n) => n.id);
  assert.strictEqual(new Set(fIds).size, feedbacks.length, 'ID Feedback không được trùng');
  assert.strictEqual(new Set(nIds).size, notifications.length, 'ID Notification không được trùng');
  for (let i = 0; i < feedbacks.length; i++) {
    assert.strictEqual(feedbacks[i].id, i + 1);
  }
  for (let i = 0; i < notifications.length; i++) {
    assert.strictEqual(notifications[i].id, i + 1);
  }
});

// =========================================================================
// 2. KIỂM THỬ RÀNG BUỘC NGHIỆP VỤ FEEDBACK
// =========================================================================
console.log('--- 2. Kiểm thử Nghiệp vụ Feedback ---');

runTest('2.1 Người tạo Feedback (residentId) 100% bắt buộc là RESIDENT', () => {
  for (const f of feedbacks) {
    const creator = userMap.get(f.residentId);
    assert.ok(creator, `Feedback ${f.id} có residentId ${f.residentId} không tồn tại`);
    assert.strictEqual(
      creator.role,
      Role.RESIDENT,
      `Feedback ${f.id} người tạo có vai trò ${creator.role}, không phải RESIDENT`
    );
  }
});

runTest('2.2 Ràng buộc phòng của Feedback: Feedback luôn kế thừa đúng roomId của Resident', () => {
  for (const f of feedbacks) {
    const resident = userMap.get(f.residentId);
    assert.ok(resident, `Resident ${f.residentId} phải tồn tại`);
    assert.strictEqual(
      f.roomId,
      resident.roomId,
      `Feedback ${f.id} có roomId (${f.roomId}) không khớp với resident.roomId (${resident.roomId})`
    );
    if (f.roomId !== null) {
      assert.ok(roomMap.has(f.roomId), `Feedback ${f.id} tham chiếu roomId ${f.roomId} không tồn tại`);
    }
  }

  // Nếu toàn bộ resident đầu vào đều có phòng (như dataset M4 hiện tại), số Feedback chung phải bằng 0
  const allResidentsHaveRoom = sampleUsers
    .filter((u) => u.role === Role.RESIDENT)
    .every((u) => u.roomId !== null);

  if (allResidentsHaveRoom) {
    const commonAreaFeedbacks = feedbacks.filter((f) => f.roomId === null);
    assert.strictEqual(
      commonAreaFeedbacks.length,
      0,
      `Khi 100% Resident có phòng, số Feedback khu vực chung (roomId = null) phải là 0, nhận được: ${commonAreaFeedbacks.length}`
    );
  }
});

runTest('2.2.1 Hỗ trợ Feedback khu vực chung khi có Resident không thuộc căn hộ nào (roomId = null)', () => {
  const customUsers: GeneratedUser[] = [
    {
      id: 991,
      username: 'noroom_a',
      role: Role.RESIDENT,
      fullName: 'Cư dân Chưa Gán Phòng A',
      email: 'no.room.a@example.invalid',
      phone: null,
      password: 'hash',
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    {
      id: 992,
      username: 'hasroom_b',
      role: Role.RESIDENT,
      fullName: 'Cư dân Đã Có Phòng B',
      email: 'has.room.b@example.invalid',
      phone: null,
      password: 'hash',
      roomId: sampleRooms[0].id,
      isApproved: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ];

  const mixedFeedbacks = generateFeedbacks(customUsers, sampleRooms, {
    count: 20,
    seed: 42,
    commonAreaRate: 0.5,
  });

  let nullCount = 0;
  let roomCount = 0;
  for (const f of mixedFeedbacks) {
    if (f.residentId === 991) {
      assert.strictEqual(f.roomId, null, 'Resident không phòng chỉ có thể tạo feedback roomId = null');
      nullCount++;
    } else if (f.residentId === 992) {
      assert.strictEqual(f.roomId, sampleRooms[0].id, 'Resident có phòng luôn sinh feedback đúng roomId');
      roomCount++;
    }
  }

  assert.ok(nullCount > 0, 'Phải có feedback khu vực chung từ resident roomId = null');
  assert.ok(roomCount > 0, 'Phải có feedback phòng từ resident có roomId');
});

runTest('2.3 Tính đồng bộ thời gian phản hồi: khi có reply thì repliedAt hợp lệ (>= createdAt)', () => {
  for (const f of feedbacks) {
    if (f.reply !== null) {
      assert.ok(f.repliedAt instanceof Date, `Feedback ${f.id} có reply nhưng thiếu repliedAt`);
      assert.ok(
        !isNaN(f.repliedAt.getTime()),
        `Feedback ${f.id} repliedAt là thời gian không hợp lệ`
      );
      assert.ok(
        f.repliedAt.getTime() >= f.createdAt.getTime(),
        `Feedback ${f.id} repliedAt trước createdAt: ${f.repliedAt.toISOString()} < ${f.createdAt.toISOString()}`
      );
      assert.ok(
        f.updatedAt.getTime() >= f.repliedAt.getTime(),
        `Feedback ${f.id} updatedAt trước repliedAt`
      );
    } else {
      assert.strictEqual(f.repliedAt, null, `Feedback ${f.id} không có reply thì repliedAt phải là null`);
    }
  }
});

runTest('2.4 Xử lý isResolved đa dạng và phản ánh đúng nghiệp vụ backend', () => {
  const resolvedList = feedbacks.filter((f) => f.isResolved);
  const unresolvedList = feedbacks.filter((f) => !f.isResolved);

  assert.ok(resolvedList.length > 0, 'Phải có phản ánh đã giải quyết (isResolved = true)');
  assert.ok(unresolvedList.length > 0, 'Phải có phản ánh chưa giải quyết (isResolved = false)');

  // Kiểm tra trường hợp đặc biệt: BQL đã phản hồi nhưng chưa đánh dấu giải quyết xong (isResolved = false kèm reply)
  const repliedUnresolved = feedbacks.filter((f) => f.reply !== null && !f.isResolved);
  assert.ok(
    repliedUnresolved.length > 0,
    'Phải tồn tại phản ánh BQL đã trả lời nhưng chưa giải quyết xong (reply !== null && isResolved = false)'
  );

  // Kiểm tra trường hợp: BQL đã phản hồi và đã giải quyết (reply !== null && isResolved = true)
  const repliedResolved = feedbacks.filter((f) => f.reply !== null && f.isResolved);
  assert.ok(
    repliedResolved.length > 0,
    'Phải tồn tại phản ánh BQL đã trả lời và giải quyết hoàn tất (reply !== null && isResolved = true)'
  );
});

runTest('2.5 Tiêu đề và nội dung Feedback nằm trong giới hạn ký tự validator', () => {
  for (const f of feedbacks) {
    assert.ok(f.title && f.title.trim().length >= 3 && f.title.trim().length <= 200);
    assert.ok(f.content && f.content.trim().length >= 5 && f.content.trim().length <= 2000);
    if (f.reply !== null) {
      assert.ok(f.reply.trim().length >= 2 && f.reply.trim().length <= 2000);
    }
  }
});

// =========================================================================
// 3. KIỂM THỬ RÀNG BUỘC NGHIỆP VỤ NOTIFICATION
// =========================================================================
console.log('--- 3. Kiểm thử Nghiệp vụ Notification ---');

runTest('3.1 authorId của Notification tham chiếu đúng tài khoản ADMIN hoặc BQL', () => {
  for (const n of notifications) {
    if (n.authorId !== null) {
      const author = userMap.get(n.authorId);
      assert.ok(author, `Notification ${n.id} có authorId ${n.authorId} không tồn tại`);
      assert.ok(
        author.role === Role.ADMIN || author.role === Role.BQL,
        `Notification ${n.id} người đăng có vai trò ${author.role}, không phải ADMIN/BQL`
      );
    }
  }
});

runTest('3.2 targetRoom bắt buộc là roomNumber (String), TUYỆT ĐỐI không phải roomId số nguyên', () => {
  for (const n of notifications) {
    if (n.targetRoom !== null) {
      assert.strictEqual(typeof n.targetRoom, 'string', `targetRoom phải là string`);
      assert.ok(
        roomNumbers.has(n.targetRoom),
        `Notification ${n.id} targetRoom [${n.targetRoom}] không khớp với bất kỳ roomNumber nào trong tòa nhà`
      );
      // Đảm bảo không bị nhầm lẫn truyền id nguyên bản như "1", "2" nếu roomNumber thực tế là "101", "102"
      assert.ok(
        n.targetRoom.length >= 3,
        `targetRoom [${n.targetRoom}] có dấu hiệu là roomId chứ không phải roomNumber thực tế`
      );
    }
  }
});

runTest('3.3 Có đầy đủ cả thông báo chung (targetRoom = null) và thông báo riêng (targetRoom !== null)', () => {
  const generalNotifs = notifications.filter((n) => n.targetRoom === null);
  const specificNotifs = notifications.filter((n) => n.targetRoom !== null);

  assert.ok(generalNotifs.length > 0, 'Phải có thông báo chung toàn tòa nhà (targetRoom = null)');
  assert.ok(specificNotifs.length > 0, 'Phải có thông báo gửi riêng theo phòng (targetRoom !== null)');
});

runTest('3.4 Notification không chứa trường updatedAt (chuẩn Prisma schema)', () => {
  for (const n of notifications) {
    assert.strictEqual((n as any).updatedAt, undefined, 'Notification model không có trường updatedAt');
    assert.ok(n.createdAt instanceof Date && !isNaN(n.createdAt.getTime()));
  }
});

// =========================================================================
// 4. KIỂM THỬ TÍNH ĐƠN ĐỊNH & KHÔNG RÒ RỈ DỮ LIỆU NHẠY CẢM (PII)
// =========================================================================
console.log('--- 4. Kiểm thử Tính đơn định & An toàn dữ liệu ---');

runTest('4.1 Cùng seed và input tạo kết quả 100% giống nhau (Deterministic)', () => {
  const f2 = generateFeedbacks(sampleUsers, sampleRooms, { seed: 20261111 });
  const n2 = generateNotifications(sampleUsers, sampleRooms, { seed: 20261111 });

  assert.strictEqual(f2.length, feedbacks.length);
  assert.strictEqual(n2.length, notifications.length);

  for (let i = 0; i < feedbacks.length; i++) {
    assert.strictEqual(f2[i].id, feedbacks[i].id);
    assert.strictEqual(f2[i].title, feedbacks[i].title);
    assert.strictEqual(f2[i].isResolved, feedbacks[i].isResolved);
    assert.strictEqual(f2[i].createdAt.getTime(), feedbacks[i].createdAt.getTime());
  }

  for (let i = 0; i < notifications.length; i++) {
    assert.strictEqual(n2[i].id, notifications[i].id);
    assert.strictEqual(n2[i].title, notifications[i].title);
    assert.strictEqual(n2[i].targetRoom, notifications[i].targetRoom);
    assert.strictEqual(n2[i].createdAt.getTime(), notifications[i].createdAt.getTime());
  }
});

runTest('4.2 Khác seed tạo kết quả và thời gian phân bổ khác nhau', () => {
  const fDiff = generateFeedbacks(sampleUsers, sampleRooms, { seed: 987654321 });
  const nDiff = generateNotifications(sampleUsers, sampleRooms, { seed: 987654321 });

  let diffF = 0;
  for (let i = 0; i < Math.min(feedbacks.length, fDiff.length); i++) {
    if (feedbacks[i].createdAt.getTime() !== fDiff[i].createdAt.getTime()) diffF++;
  }
  assert.ok(diffF > 5, 'Khác seed phải tạo Feedback khác nhau');

  let diffN = 0;
  for (let i = 0; i < Math.min(notifications.length, nDiff.length); i++) {
    if (notifications[i].createdAt.getTime() !== nDiff[i].createdAt.getTime()) diffN++;
  }
  assert.ok(diffN > 3, 'Khác seed phải tạo Notification khác nhau');
});

runTest('4.3 Không chứa số điện thoại cá nhân thật hoặc email cá nhân trong nội dung thông báo/góp ý', () => {
  const phoneRegex = /(?:\+84|0[3|5|7|8|9])\d{8}/;
  const realEmailRegex = /[a-zA-Z0-9._%+-]+@(?!example\.invalid)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  for (const f of feedbacks) {
    assert.ok(!phoneRegex.test(f.title), `Feedback title chứa SĐT: ${f.title}`);
    assert.ok(!phoneRegex.test(f.content), `Feedback content chứa SĐT: ${f.content}`);
    if (f.reply) {
      assert.ok(!phoneRegex.test(f.reply), `Feedback reply chứa SĐT: ${f.reply}`);
    }
    assert.ok(!realEmailRegex.test(f.content), `Feedback content chứa email thật: ${f.content}`);
  }

  for (const n of notifications) {
    assert.ok(!phoneRegex.test(n.title), `Notification title chứa SĐT: ${n.title}`);
    assert.ok(!phoneRegex.test(n.content), `Notification content chứa SĐT: ${n.content}`);
    assert.ok(!realEmailRegex.test(n.content), `Notification content chứa email thật: ${n.content}`);
  }
});

// =========================================================================
// 5. KIỂM THỬ XỬ LÝ NGOẠI LỆ & RÀNG BUỘC ĐẦU VÀO (INPUT VALIDATION)
// =========================================================================
console.log('--- 5. Kiểm thử Ngoại lệ & Ràng buộc Đầu vào ---');

runTest('5.1 Danh sách User hoặc Room rỗng phải ném lỗi rõ ràng', () => {
  assert.throws(() => generateFeedbacks([], sampleRooms), /Danh sách User đầu vào rỗng/);
  assert.throws(() => generateFeedbacks(sampleUsers, []), /Danh sách Room đầu vào rỗng/);
  assert.throws(() => generateNotifications([], sampleRooms), /Danh sách User đầu vào rỗng/);
  assert.throws(() => generateNotifications(sampleUsers, []), /Danh sách Room đầu vào rỗng/);
});

runTest('5.2 Thiếu vai trò bắt buộc (RESIDENT cho Feedback, ADMIN/BQL cho Notification) phải ném lỗi', () => {
  const noResidents = sampleUsers.filter((u) => u.role !== Role.RESIDENT);
  assert.throws(() => generateFeedbacks(noResidents, sampleRooms), /Không tìm thấy User nào có vai trò RESIDENT/);

  const noManagers = sampleUsers.filter((u) => u.role !== Role.ADMIN && u.role !== Role.BQL);
  assert.throws(() => generateNotifications(noManagers, sampleRooms), /Không tìm thấy User nào có vai trò ADMIN hoặc BQL/);
});

runTest('5.3 Tham số count không hợp lệ (NaN, số âm, số thực) phải ném lỗi', () => {
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { count: NaN }), /count phải là số nguyên không âm/);
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { count: -5 }), /count phải là số nguyên không âm/);
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { count: 10.5 }), /count phải là số nguyên không âm/);

  assert.throws(() => generateNotifications(sampleUsers, sampleRooms, { count: NaN }), /count phải là số nguyên không âm/);
  assert.throws(() => generateNotifications(sampleUsers, sampleRooms, { count: -3 }), /count phải là số nguyên không âm/);
  assert.throws(() => generateNotifications(sampleUsers, sampleRooms, { count: 5.2 }), /count phải là số nguyên không âm/);
});

runTest('5.4 Tham số tỷ lệ ngoài [0, 1] phải ném lỗi rõ ràng', () => {
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { resolvedRate: -0.1 }), /resolvedRate phải là số thực trong đoạn \[0, 1\]/);
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { resolvedRate: 1.2 }), /resolvedRate phải là số thực trong đoạn \[0, 1\]/);
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { repliedRate: -0.5 }), /repliedRate phải là số thực trong đoạn \[0, 1\]/);
  assert.throws(() => generateFeedbacks(sampleUsers, sampleRooms, { commonAreaRate: 2.0 }), /commonAreaRate phải là số thực trong đoạn \[0, 1\]/);

  assert.throws(() => generateNotifications(sampleUsers, sampleRooms, { roomSpecificRate: -0.1 }), /roomSpecificRate phải là số thực trong đoạn \[0, 1\]/);
  assert.throws(() => generateNotifications(sampleUsers, sampleRooms, { roomSpecificRate: 1.5 }), /roomSpecificRate phải là số thực trong đoạn \[0, 1\]/);
});

runTest('5.5 Khi count = 0 trả về mảng rỗng []', () => {
  assert.strictEqual(generateFeedbacks(sampleUsers, sampleRooms, { count: 0 }).length, 0);
  assert.strictEqual(generateNotifications(sampleUsers, sampleRooms, { count: 0 }).length, 0);
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M7 ĐẠT CHUẨN!`);
console.log('======================================================');

