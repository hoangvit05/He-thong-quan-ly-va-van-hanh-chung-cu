// =========================================================================
// KIỂM THỬ XÁC MINH ROOM & USER GENERATORS (MILESTONE 4 TESTS)
// =========================================================================

import assert from 'assert';
import { RoomStatus, Role } from '@prisma/client';
import { generateRooms } from '../seed/generators/room.generator';
import { generateUsers } from '../seed/generators/user.generator';
import { DEFAULT_DEMO_PASSWORD, verifyPasswordSync } from '../seed/utils/password';

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
console.log('🧪 KIỂM ĐỊNH ROOM GENERATOR (MILESTONE 4)');
console.log('======================================================');

// 1. Sinh đúng 100 Room
runTest('Room Test 1: Sinh đúng 100 Room theo target config', () => {
  const rooms = generateRooms();
  assert.strictEqual(rooms.length, 100, `Số lượng phòng phải bằng 100 (nhận ${rooms.length})`);
});

// 2. roomNumber không trùng
runTest('Room Test 2: Mọi roomNumber là duy nhất và có định dạng chuẩn', () => {
  const rooms = generateRooms();
  const roomNumbers = rooms.map((r) => r.roomNumber);
  const uniqueNumbers = new Set(roomNumbers);
  assert.strictEqual(uniqueNumbers.size, rooms.length, 'Phát hiện số phòng bị trùng lặp');
  for (const r of rooms) {
    assert.match(r.roomNumber, /^\d{3,4}$/, `roomNumber không hợp lệ: ${r.roomNumber}`);
    assert.strictEqual(typeof r.floor, 'number');
    assert.ok(r.floor >= 1 && r.floor <= 10, `Tầng ngoài khoảng 1-10: ${r.floor}`);
  }
});

// 3. area luôn hữu hạn và lớn hơn 0
runTest('Room Test 3: Diện tích (area) luôn hữu hạn và > 0', () => {
  const rooms = generateRooms();
  for (const r of rooms) {
    assert.strictEqual(typeof r.area, 'number');
    assert.ok(Number.isFinite(r.area), `Diện tích không hữu hạn: ${r.area}`);
    assert.ok(r.area > 0, `Diện tích phải > 0: ${r.area}`);
    assert.ok(r.area >= 45 && r.area <= 130, `Diện tích bất thường ngoài [45, 130]: ${r.area}`);
  }
});

// 4. Status đều thuộc enum hợp lệ
runTest('Room Test 4: Toàn bộ status thuộc RoomStatus enum', () => {
  const rooms = generateRooms();
  const validStatuses = new Set([RoomStatus.OCCUPIED, RoomStatus.VACANT, RoomStatus.MAINTENANCE]);
  for (const r of rooms) {
    assert.ok(validStatuses.has(r.status), `Trạng thái không hợp lệ: ${r.status}`);
  }
});

// 5. Có đủ VACANT, OCCUPIED và MAINTENANCE
runTest('Room Test 5: Có đầy đủ cả 3 trạng thái OCCUPIED, VACANT, MAINTENANCE', () => {
  const rooms = generateRooms();
  const occupiedCount = rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length;
  const vacantCount = rooms.filter((r) => r.status === RoomStatus.VACANT).length;
  const maintenanceCount = rooms.filter((r) => r.status === RoomStatus.MAINTENANCE).length;

  assert.ok(occupiedCount > 0, 'Phải có ít nhất 1 phòng OCCUPIED');
  assert.ok(vacantCount > 0, 'Phải có ít nhất 1 phòng VACANT');
  assert.ok(maintenanceCount > 0, 'Phải có ít nhất 1 phòng MAINTENANCE');
});

// 6. Cùng seed cho kết quả giống nhau
runTest('Room Test 6: Cùng seed tạo ra kết quả hoàn toàn giống nhau 100%', () => {
  const roomsA = generateRooms({ seed: 20261111 });
  const roomsB = generateRooms({ seed: 20261111 });
  assert.deepStrictEqual(roomsA, roomsB, 'Hai lượt sinh cùng seed phải giống nhau từng trường');
});

// 7. Khác seed có khả năng cho kết quả khác
runTest('Room Test 7: Khác seed tạo ra kết quả khác nhau', () => {
  const roomsA = generateRooms({ seed: 11111111 });
  const roomsB = generateRooms({ seed: 99999999 });
  // Kiểm tra khác biệt diện tích hoặc trạng thái
  const areasA = roomsA.map((r) => r.area);
  const areasB = roomsB.map((r) => r.area);
  assert.notDeepStrictEqual(areasA, areasB, 'Khác seed phải tạo ra dữ liệu diện tích khác nhau');
});

console.log('======================================================');
console.log('🧪 KIỂM ĐỊNH USER GENERATOR (MILESTONE 4)');
console.log('======================================================');

const defaultRooms = generateRooms({ seed: 20261111 });
const defaultUsers = generateUsers(defaultRooms, { seed: 20261111 });

// 1. Có đúng 1 ADMIN
runTest('User Test 1: Có đúng 1 ADMIN', () => {
  const admins = defaultUsers.filter((u) => u.role === Role.ADMIN);
  assert.strictEqual(admins.length, 1, `Phải có đúng 1 ADMIN (nhận ${admins.length})`);
});

// 2. Có đúng 2 BQL
runTest('User Test 2: Có đúng 2 BQL', () => {
  const bqlList = defaultUsers.filter((u) => u.role === Role.BQL);
  assert.strictEqual(bqlList.length, 2, `Phải có đúng 2 BQL (nhận ${bqlList.length})`);
});

// 3. Có đúng 5 TECHNICIAN
runTest('User Test 3: Có đúng 5 TECHNICIAN', () => {
  const techs = defaultUsers.filter((u) => u.role === Role.TECHNICIAN);
  assert.strictEqual(techs.length, 5, `Phải có đúng 5 TECHNICIAN (nhận ${techs.length})`);
});

// 4. Có 100–150 RESIDENT
runTest('User Test 4: Số lượng RESIDENT nằm trong khoảng [100, 150]', () => {
  const residents = defaultUsers.filter((u) => u.role === Role.RESIDENT);
  assert.ok(
    residents.length >= 100 && residents.length <= 150,
    `Số lượng RESIDENT (${residents.length}) phải nằm trong [100, 150]`
  );
});

// 5. Tất cả username duy nhất
runTest('User Test 5: Toàn bộ username là duy nhất', () => {
  const usernames = defaultUsers.map((u) => u.username);
  const uniqueUsernames = new Set(usernames);
  assert.strictEqual(uniqueUsernames.size, defaultUsers.length, 'Phát hiện username bị trùng lặp');
});

// 6. Tất cả email duy nhất
runTest('User Test 6: Toàn bộ email là duy nhất', () => {
  const emails = defaultUsers.map((u) => u.email).filter(Boolean);
  const uniqueEmails = new Set(emails);
  assert.strictEqual(uniqueEmails.size, emails.length, 'Phát hiện email bị trùng lặp');
});

// 7. Staff luôn có roomId null
runTest('User Test 7: Nhân sự tòa nhà (ADMIN, BQL, TECHNICIAN) bắt buộc có roomId = null', () => {
  const staff = defaultUsers.filter((u) => u.role !== Role.RESIDENT);
  assert.strictEqual(staff.length, 8, 'Tổng nhân sự phải bằng 1 + 2 + 5 = 8');
  for (const s of staff) {
    assert.strictEqual(s.roomId, null, `Nhân sự ${s.username} (${s.role}) không được có roomId`);
    assert.strictEqual(s.isApproved, true, `Nhân sự ${s.username} phải có isApproved = true`);
  }
});

// 8. Resident có roomId hợp lệ
runTest('User Test 8: Toàn bộ RESIDENT có roomId hợp lệ tham chiếu tới Room', () => {
  const validRoomIds = new Set(defaultRooms.map((r) => r.id));
  const residents = defaultUsers.filter((u) => u.role === Role.RESIDENT);
  for (const res of residents) {
    assert.ok(res.roomId !== null, `Cư dân ${res.username} thiếu roomId`);
    assert.ok(validRoomIds.has(res.roomId!), `Cư dân ${res.username} có roomId không tồn tại: ${res.roomId}`);
  }
});

// 9. Không gán resident vào Room VACANT/MAINTENANCE
runTest('User Test 9: Tuyệt đối không gán cư dân vào phòng VACANT hoặc MAINTENANCE', () => {
  const roomStatusMap = new Map<number, RoomStatus>();
  for (const r of defaultRooms) {
    roomStatusMap.set(r.id, r.status);
  }

  const residents = defaultUsers.filter((u) => u.role === Role.RESIDENT);
  for (const res of residents) {
    const status = roomStatusMap.get(res.roomId!);
    assert.strictEqual(
      status,
      RoomStatus.OCCUPIED,
      `Cư dân ${res.username} bị gán vào phòng ${res.roomId} có trạng thái ${status} (chỉ cho phép OCCUPIED)`
    );
  }
});

// 10. Một Room có thể có nhiều Resident
runTest('User Test 10: Tồn tại ít nhất một phòng có từ 2 cư dân trở lên', () => {
  const residents = defaultUsers.filter((u) => u.role === Role.RESIDENT);
  const roomCountMap = new Map<number, number>();
  for (const res of residents) {
    roomCountMap.set(res.roomId!, (roomCountMap.get(res.roomId!) || 0) + 1);
  }

  let multiResidentRooms = 0;
  for (const [, count] of roomCountMap.entries()) {
    if (count >= 2) {
      multiResidentRooms++;
    }
  }
  assert.ok(multiResidentRooms > 0, `Phải có ít nhất 1 phòng có nhiều cư dân (tìm thấy ${multiResidentRooms})`);
});

// 11. Password hash được bcryptjs xác minh thành công
runTest('User Test 11: Mật khẩu băm Bcrypt được bcryptjs xác minh thành công', () => {
  for (const u of defaultUsers) {
    const isValid = verifyPasswordSync(DEFAULT_DEMO_PASSWORD, u.password);
    assert.strictEqual(isValid, true, `Mật khẩu của ${u.username} không khớp với mật khẩu demo mặc định`);
  }
});

// 12. Không có plaintext password trong output record
runTest('User Test 12: Không chứa mật khẩu dạng plaintext trong bản ghi', () => {
  for (const u of defaultUsers) {
    assert.notStrictEqual(u.password, DEFAULT_DEMO_PASSWORD, `User ${u.username} chứa mật khẩu plaintext`);
    assert.ok(
      u.password.startsWith('$2a$') || u.password.startsWith('$2b$'),
      `Chuỗi băm của ${u.username} không phải chuẩn Bcrypt ($2a$ hoặc $2b$)`
    );
    assert.strictEqual(u.password.length, 60, `Độ dài chuỗi băm Bcrypt phải bằng 60 ký tự (nhận ${u.password.length})`);
  }
});

// 13. Cùng seed và cùng input tạo ra cùng dữ liệu nghiệp vụ
runTest('User Test 13: Cùng seed và cùng input rooms tạo ra kết quả giống nhau', () => {
  const cachedHash = defaultUsers[0].password;
  const usersA = generateUsers(defaultRooms, { seed: 12345, passwordHash: cachedHash });
  const usersB = generateUsers(defaultRooms, { seed: 12345, passwordHash: cachedHash });
  assert.deepStrictEqual(usersA, usersB, 'Hai lượt sinh cùng seed phải giống nhau hoàn toàn');
});

// 14. Khác seed có khả năng tạo ra dữ liệu khác
runTest('User Test 14: Khác seed tạo ra kết quả phân bổ cư dân và họ tên khác nhau', () => {
  const cachedHash = defaultUsers[0].password;
  const usersA = generateUsers(defaultRooms, { seed: 11111, passwordHash: cachedHash });
  const usersB = generateUsers(defaultRooms, { seed: 99999, passwordHash: cachedHash });

  const namesA = usersA.map((u) => u.fullName);
  const namesB = usersB.map((u) => u.fullName);
  assert.notDeepStrictEqual(namesA, namesB, 'Khác seed phải tạo ra danh sách họ tên khác nhau');
});

console.log('======================================================');
console.log('🧪 KIỂM ĐỊNH TÍCH HỢP IN-MEMORY (INTEGRATION TESTS)');
console.log('======================================================');

// Integration Test: Serialize JSON & Foreign Key Consistency
runTest('Integration Test: Mọi record serialize thành công JSON và toàn vẹn khóa ngoại', () => {
  const rooms = generateRooms();
  const users = generateUsers(rooms);

  // 1. Kiểm tra serialize JSON
  const roomsJson = JSON.stringify(rooms);
  const usersJson = JSON.stringify(users);
  assert.ok(roomsJson.length > 0 && typeof roomsJson === 'string');
  assert.ok(usersJson.length > 0 && typeof usersJson === 'string');

  const parsedRooms = JSON.parse(roomsJson);
  const parsedUsers = JSON.parse(usersJson);
  assert.strictEqual(parsedRooms.length, rooms.length);
  assert.strictEqual(parsedUsers.length, users.length);

  // 2. Toàn vẹn khóa ngoại roomId
  const roomIdSet = new Set(rooms.map((r) => r.id));
  for (const u of users) {
    if (u.role === Role.RESIDENT) {
      assert.ok(u.roomId !== null, `Cư dân ${u.username} không có roomId`);
      assert.ok(roomIdSet.has(u.roomId!), `Cư dân ${u.username} tham chiếu roomId không tồn tại: ${u.roomId}`);
    } else {
      assert.strictEqual(u.roomId, null, `Nhân sự ${u.username} không được có roomId`);
    }
  }
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M4 ĐẠT CHUẨN!`);
console.log('======================================================');

