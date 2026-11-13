// =========================================================================
// TRÌNH SINH DỮ LIỆU THÔNG BÁO TÒA NHÀ (NOTIFICATION GENERATOR)
// Phân hệ: backend/dataset/seed/generators/notification.generator.ts
// Đặc tả: Sinh 20-30 Notification tương thích Prisma schema và notifications.service.ts
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import type { GeneratedRoom } from './room.generator';
import type { GeneratedUser } from './user.generator';

export interface GeneratedNotification {
  id: number;
  title: string;
  content: string;
  targetRoom: string | null;
  authorId: number | null;
  createdAt: Date;
}

export interface NotificationGeneratorOptions {
  count?: number;
  seed?: number;
  prng?: PRNG;
  roomSpecificRate?: number;
}

export interface ReferenceAnnouncementTemplate {
  topic: string;
  title: string;
  content: string;
}

/**
 * Cache dữ liệu thông báo mẫu trong bộ nhớ tiến trình
 */
let cachedAnnouncementTemplates: ReferenceAnnouncementTemplate[] | null = null;

function loadAnnouncementReferenceData(): ReferenceAnnouncementTemplate[] {
  if (!cachedAnnouncementTemplates) {
    const refDir = path.resolve(__dirname, '../../reference-data');
    const contentPath = path.join(refDir, 'vietnamese-content.json');
    const contentData = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));
    cachedAnnouncementTemplates = contentData.announcements;
  }
  return cachedAnnouncementTemplates!;
}

/**
 * Tạo đối tượng Date UTC bảo toàn chính xác năm (kể cả năm 0001-0099)
 */
function createUTCDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  const d = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
  d.setUTCFullYear(year);
  return d;
}

/**
 * Sinh danh sách thông báo toàn tòa nhà và thông báo riêng từng căn hộ
 * Hoàn toàn in-memory, bảo toàn tính đơn định theo PRNG seed
 */
export function generateNotifications(
  users: GeneratedUser[],
  rooms: GeneratedRoom[],
  options: NotificationGeneratorOptions = {}
): GeneratedNotification[] {
  // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Danh sách User đầu vào rỗng hoặc không hợp lệ.');
  }
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('Danh sách Room đầu vào rỗng hoặc không hợp lệ.');
  }

  const managers = users.filter((u) => u.role === Role.ADMIN || u.role === Role.BQL);
  if (managers.length === 0) {
    throw new Error('Không tìm thấy User nào có vai trò ADMIN hoặc BQL để tạo thông báo.');
  }

  // 2. Kiểm tra options
  const count = options.count !== undefined ? options.count : 25;
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    throw new Error(`count phải là số nguyên không âm. Nhận được: ${count}`);
  }

  const roomSpecificRate = options.roomSpecificRate !== undefined ? options.roomSpecificRate : 0.24;
  if (!Number.isFinite(roomSpecificRate) || roomSpecificRate < 0 || roomSpecificRate > 1) {
    throw new Error(`roomSpecificRate phải là số thực trong đoạn [0, 1]. Nhận được: ${roomSpecificRate}`);
  }

  if (count === 0) {
    return [];
  }

  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;
  const prng = options.prng ?? new PRNG(seed);

  const announcements = loadAnnouncementReferenceData();

  // Neo thời gian tham chiếu: Tháng 10 năm 2026
  const BASE_YEAR = 2026;
  const BASE_MONTH = 9; // Tháng 10 (0-indexed)

  const notifications: GeneratedNotification[] = [];

  for (let i = 0; i < count; i++) {
    const notifId = i + 1;

    // 1. Người đăng thông báo: Thuộc BQL hoặc ADMIN (đa số BQL, có thể có Admin)
    const author = prng.pickOne(managers);
    const authorId = author.id;

    // 2. Quyết định phạm vi gửi: Thông báo chung toàn tòa (null) hoặc đích danh phòng (roomNumber)
    const isRoomSpecific = prng.next() < roomSpecificRate;
    let targetRoom: string | null = null;

    if (isRoomSpecific) {
      // BẮT BUỘC dùng roomNumber (String, ví dụ "101", "205"), TUYỆT ĐỐI không dùng roomId số nguyên
      const targetRoomObj = prng.pickOne(rooms);
      targetRoom = targetRoomObj.roomNumber;
    } else {
      targetRoom = null;
    }

    // 3. Chọn nội dung thông báo từ reference data
    const templateIdx = i % announcements.length;
    const template = announcements[templateIdx];

    let title = template.title;
    let content = template.content;

    // Nếu là thông báo đích danh phòng, cá nhân hóa tiêu đề để dữ liệu chân thực
    if (targetRoom) {
      title = `[Phòng ${targetRoom}] ${template.title}`;
      content = `Kính gửi Quý cư dân căn hộ ${targetRoom},\n${template.content}`;
    }

    // 4. Thời gian phát thông báo (trong 25 ngày đầu tháng 10/2026)
    const dayOffset = prng.nextInt(1, 25);
    const hour = prng.nextInt(7, 20);
    const minute = prng.nextInt(0, 59);
    const createdAt = createUTCDate(BASE_YEAR, BASE_MONTH, dayOffset, hour, minute);

    notifications.push({
      id: notifId,
      title,
      content,
      targetRoom,
      authorId,
      createdAt,
    });
  }

  // Sắp xếp tăng dần theo createdAt để thể hiện dòng thời gian tự nhiên
  notifications.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Đánh lại ID tuần tự từ 1 đến count sau khi sắp xếp
  for (let i = 0; i < notifications.length; i++) {
    notifications[i].id = i + 1;
  }

  return notifications;
}

