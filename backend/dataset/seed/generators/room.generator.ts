// =========================================================================
// TRÌNH SINH DỮ LIỆU CĂN HỘ (ROOM GENERATOR)
// Phân hệ: backend/dataset/seed/generators/room.generator.ts
// Đặc tả: Sinh đúng 100 Room, tương thích Prisma schema, đơn định theo PRNG seed
// =========================================================================

import { RoomStatus } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';

export interface GeneratedRoom {
  id: number;
  roomNumber: string;
  floor: number;
  area: number;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomGeneratorOptions {
  count?: number;
  seed?: number;
  prng?: PRNG;
}

/**
 * Sinh danh sách các căn hộ chung cư hoàn toàn độc lập với database
 */
export function generateRooms(options: RoomGeneratorOptions = {}): GeneratedRoom[] {
  const count = options.count ?? DATASET_CONFIG.TARGET_COUNTS.ROOMS;
  const prng = options.prng ?? new PRNG(options.seed ?? DATASET_CONFIG.RANDOM_SEED);

  if (count <= 0) {
    return [];
  }

  // Khởi tạo phân bổ trạng thái: bảo đảm có đủ OCCUPIED, VACANT, MAINTENANCE
  const statuses: RoomStatus[] = [];
  if (count >= 3) {
    statuses.push(RoomStatus.OCCUPIED, RoomStatus.VACANT, RoomStatus.MAINTENANCE);
    for (let i = 3; i < count; i++) {
      statuses.push(prng.pickWeighted(DATASET_CONFIG.ROOM_STATUS_REFERENCE));
    }
  } else {
    for (let i = 0; i < count; i++) {
      statuses.push(prng.pickWeighted(DATASET_CONFIG.ROOM_STATUS_REFERENCE));
    }
  }

  const shuffledStatuses = prng.shuffle(statuses);

  const rooms: GeneratedRoom[] = [];
  const floorsCount = 10;
  const unitsPerFloor = Math.ceil(count / floorsCount);

  // Mốc thời gian tạo cơ sở: khoảng 6 tháng trước thời điểm hiện tại
  const baseTime = new Date('2026-05-01T00:00:00.000Z').getTime();

  for (let i = 0; i < count; i++) {
    const floor = Math.floor(i / unitsPerFloor) + 1;
    const unit = (i % unitsPerFloor) + 1;
    const roomNumber = `${floor}${unit < 10 ? '0' + unit : unit}`;

    // Diện tích từ 50.0 m2 đến 120.0 m2, làm tròn 1 chữ số thập phân
    const area = prng.nextFloat(50.0, 120.0, 1);
    const status = shuffledStatuses[i];

    // Ngày tạo và cập nhật đơn định
    const createdOffsetMs = prng.nextInt(0, 30) * 86400000;
    const updatedOffsetMs = prng.nextInt(0, 30) * 86400000;
    const createdAt = new Date(baseTime + createdOffsetMs);
    const updatedAt = new Date(createdAt.getTime() + updatedOffsetMs);

    rooms.push({
      id: i + 1,
      roomNumber,
      floor,
      area,
      status,
      createdAt,
      updatedAt,
    });
  }

  return rooms;
}

