// =========================================================================
// TRÌNH SINH DỮ LIỆU NGƯỜI DÙNG & TÀI KHOẢN (USER GENERATOR)
// Phân hệ: backend/dataset/seed/generators/user.generator.ts
// Đặc tả: Sinh 1 ADMIN, 2 BQL, 5 TECHNICIAN, 100-150 RESIDENT, phân quyền RBAC
// =========================================================================

import { Role, RoomStatus } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import { DEFAULT_DEMO_PASSWORD, hashPasswordSync } from '../utils/password';
import { GeneratedRoom } from './room.generator';

export interface GeneratedUser {
  id: number;
  username: string;
  password: string; // Chuỗi băm Bcrypt chuẩn ($2a$ hoặc $2b$)
  fullName: string;
  phone: string | null;
  email: string | null;
  role: Role;
  roomId: number | null;
  isApproved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserGeneratorOptions {
  seed?: number;
  prng?: PRNG;
  residentCount?: number;
  passwordHash?: string;
}

// Từ điển họ và tên tiếng Việt đa dạng để sinh tên cư dân tự nhiên
const VIETNAMESE_SURNAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
  'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn'
];

const VIETNAMESE_MIDDLE_NAMES = [
  'Văn', 'Thị', 'Hữu', 'Đức', 'Quang', 'Minh', 'Thanh', 'Đình', 'Thu',
  'Hải', 'Ngọc', 'Xuân', 'Kim', 'Bảo', 'Anh', 'Khánh', 'Gia', 'Hồng'
];

const VIETNAMESE_GIVEN_NAMES = [
  'An', 'Bình', 'Cường', 'Dũng', 'Giang', 'Hà', 'Hạnh', 'Hùng', 'Hương',
  'Huy', 'Khánh', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Phong',
  'Phúc', 'Quân', 'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Tùng', 'Vy', 'Yến'
];

/**
 * Sinh danh sách người dùng toàn hệ thống (Admin, BQL, Thợ kỹ thuật, Cư dân)
 */
export function generateUsers(
  rooms: GeneratedRoom[],
  options: UserGeneratorOptions = {}
): GeneratedUser[] {
  const prng = options.prng ?? new PRNG(options.seed ?? DATASET_CONFIG.RANDOM_SEED);

  // Xác định số lượng cư dân trong khoảng [100, 150]
  const targetMin = DATASET_CONFIG.TARGET_COUNTS.USERS.RESIDENT_MIN;
  const targetMax = DATASET_CONFIG.TARGET_COUNTS.USERS.RESIDENT_MAX;
  const residentCount = Math.min(
    targetMax,
    Math.max(targetMin, options.residentCount ?? 120)
  );

  // Lọc danh sách các căn hộ đang có người ở (OCCUPIED)
  const occupiedRooms = rooms.filter((r) => r.status === RoomStatus.OCCUPIED);
  if (occupiedRooms.length === 0) {
    throw new Error('Không tìm thấy căn hộ nào ở trạng thái OCCUPIED để gán cư dân.');
  }

  // Băm mật khẩu mặc định (hoặc dùng hash được truyền vào để tối ưu hiệu năng)
  const passwordHash = options.passwordHash ?? hashPasswordSync(DEFAULT_DEMO_PASSWORD);

  const users: GeneratedUser[] = [];
  let currentUserId = 1;

  // 1. Sinh tài khoản Quản trị viên (ADMIN: 1)
  users.push({
    id: currentUserId++,
    username: 'admin',
    password: passwordHash,
    fullName: 'Quản Trị Viên Hệ Thống',
    phone: null,
    email: 'admin@chungcu.internal',
    role: Role.ADMIN,
    roomId: null,
    isApproved: true,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  // 2. Sinh tài khoản Ban quản lý (BQL: 2)
  const bqlNames = ['Nguyễn Thị Thanh Mai', 'Trần Văn Hưng'];
  for (let i = 0; i < DATASET_CONFIG.TARGET_COUNTS.USERS.BQL; i++) {
    const idx = i + 1;
    const padIdx = idx < 10 ? `0${idx}` : `${idx}`;
    users.push({
      id: currentUserId++,
      username: `bql_${padIdx}`,
      password: passwordHash,
      fullName: bqlNames[i] ?? `Cán Bộ BQL ${padIdx}`,
      phone: null,
      email: `bql_${padIdx}@chungcu.internal`,
      role: Role.BQL,
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
  }

  // 3. Sinh tài khoản Thợ kỹ thuật (TECHNICIAN: 5)
  const techNames = [
    'Lê Văn Kỹ Thuật',
    'Phạm Hữu Điện',
    'Vũ Minh Nước',
    'Hoàng Đình Thang',
    'Đỗ Quang Lạnh',
  ];
  for (let i = 0; i < DATASET_CONFIG.TARGET_COUNTS.USERS.TECHNICIAN; i++) {
    const idx = i + 1;
    const padIdx = idx < 10 ? `0${idx}` : `${idx}`;
    users.push({
      id: currentUserId++,
      username: `technician_${padIdx}`,
      password: passwordHash,
      fullName: techNames[i] ?? `Kỹ Thuật Viên ${padIdx}`,
      phone: null,
      email: `tech_${padIdx}@chungcu.internal`,
      role: Role.TECHNICIAN,
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    });
  }

  // 4. Sinh tài khoản Cư dân (RESIDENT: 100-150)
  // Đảm bảo:
  // - Mỗi phòng OCCUPIED đều có cư dân
  // - Có phòng có từ 2 cư dân trở lên (hộ gia đình)
  // - Tuyệt đối không gán vào phòng VACANT hoặc MAINTENANCE
  const roomResidentCount = new Map<number, number>();

  // Gán lượt đầu: mỗi phòng OCCUPIED nhận 1 cư dân
  const assignedRoomSequence: GeneratedRoom[] = [];
  for (const r of occupiedRooms) {
    if (assignedRoomSequence.length < residentCount) {
      assignedRoomSequence.push(r);
    }
  }

  // Gán lượt sau: các cư dân còn lại được phân bổ ngẫu nhiên vào các phòng OCCUPIED
  while (assignedRoomSequence.length < residentCount) {
    const randomOccupiedRoom = prng.pickOne(occupiedRooms);
    assignedRoomSequence.push(randomOccupiedRoom);
  }

  for (let i = 0; i < residentCount; i++) {
    const room = assignedRoomSequence[i];
    const unitIndex = (roomResidentCount.get(room.id) || 0) + 1;
    roomResidentCount.set(room.id, unitIndex);

    const surname = prng.pickOne(VIETNAMESE_SURNAMES);
    const middleName = prng.pickOne(VIETNAMESE_MIDDLE_NAMES);
    const givenName = prng.pickOne(VIETNAMESE_GIVEN_NAMES);
    const fullName = `${surname} ${middleName} ${givenName}`;

    const username = `cudan_${room.roomNumber}_${unitIndex}`;
    const email = `cudan_${room.roomNumber}_${unitIndex}@example.invalid`;

    // Cư dân hầu hết đã duyệt (~95%), một số ít mới tạo chờ duyệt (~5%)
    const isApproved = prng.next() < 0.95;

    const createdOffsetMs = prng.nextInt(1, 15) * 86400000;
    const updatedOffsetMs = prng.nextInt(0, 30) * 86400000;
    const createdAt = new Date(room.createdAt.getTime() + createdOffsetMs);
    const updatedAt = new Date(createdAt.getTime() + updatedOffsetMs);

    users.push({
      id: currentUserId++,
      username,
      password: passwordHash,
      fullName,
      phone: null,
      email,
      role: Role.RESIDENT,
      roomId: room.id,
      isApproved,
      createdAt,
      updatedAt,
    });
  }

  return users;
}

