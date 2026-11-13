// =========================================================================
// TRÌNH SINH DỮ LIỆU HÒM THƯ GÓP Ý & PHẢN HỒI (FEEDBACK GENERATOR)
// Phân hệ: backend/dataset/seed/generators/feedback.generator.ts
// Đặc tả: Sinh 30-50 Feedback tương thích Prisma schema, RBAC và vòng đời phản hồi
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import type { GeneratedRoom } from './room.generator';
import type { GeneratedUser } from './user.generator';

export interface GeneratedFeedback {
  id: number;
  residentId: number;
  roomId: number | null;
  title: string;
  content: string;
  reply: string | null;
  isResolved: boolean;
  repliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackGeneratorOptions {
  count?: number;
  seed?: number;
  prng?: PRNG;
  resolvedRate?: number;
  repliedRate?: number;
  commonAreaRate?: number;
}

export interface ReferenceFeedbackTemplate {
  title: string;
  content: string;
}

export interface ReferenceReplyTemplate {
  title: string;
  content: string;
}

/**
 * Cache dữ liệu tham chiếu tiếng Việt trong bộ nhớ tiến trình
 */
let cachedFeedbackTemplates: ReferenceFeedbackTemplate[] | null = null;
let cachedReplyTemplates: ReferenceReplyTemplate[] | null = null;

function loadFeedbackReferenceData(): {
  feedbackTemplates: ReferenceFeedbackTemplate[];
  replyTemplates: ReferenceReplyTemplate[];
} {
  if (!cachedFeedbackTemplates || !cachedReplyTemplates) {
    const refDir = path.resolve(__dirname, '../../reference-data');
    const contentPath = path.join(refDir, 'vietnamese-content.json');
    const contentData = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

    cachedFeedbackTemplates = contentData.feedbacks;
    cachedReplyTemplates = contentData.feedbackReplies;
  }

  return {
    feedbackTemplates: cachedFeedbackTemplates!,
    replyTemplates: cachedReplyTemplates!,
  };
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
 * Sinh danh sách góp ý/phản ánh của cư dân (Feedback)
 * Hoàn toàn in-memory, bảo toàn tính đơn định theo PRNG seed
 */
export function generateFeedbacks(
  users: GeneratedUser[],
  rooms: GeneratedRoom[],
  options: FeedbackGeneratorOptions = {}
): GeneratedFeedback[] {
  // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Danh sách User đầu vào rỗng hoặc không hợp lệ.');
  }
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('Danh sách Room đầu vào rỗng hoặc không hợp lệ.');
  }

  const residents = users.filter((u) => u.role === Role.RESIDENT);
  if (residents.length === 0) {
    throw new Error('Không tìm thấy User nào có vai trò RESIDENT để tạo phản ánh.');
  }

  // 2. Kiểm tra options
  const count = options.count !== undefined ? options.count : 40;
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    throw new Error(`count phải là số nguyên không âm. Nhận được: ${count}`);
  }

  const resolvedRate = options.resolvedRate !== undefined ? options.resolvedRate : 0.65;
  if (!Number.isFinite(resolvedRate) || resolvedRate < 0 || resolvedRate > 1) {
    throw new Error(`resolvedRate phải là số thực trong đoạn [0, 1]. Nhận được: ${resolvedRate}`);
  }

  const repliedRate = options.repliedRate !== undefined ? options.repliedRate : 0.75;
  if (!Number.isFinite(repliedRate) || repliedRate < 0 || repliedRate > 1) {
    throw new Error(`repliedRate phải là số thực trong đoạn [0, 1]. Nhận được: ${repliedRate}`);
  }

  const commonAreaRate = options.commonAreaRate !== undefined ? options.commonAreaRate : 0.2;
  if (!Number.isFinite(commonAreaRate) || commonAreaRate < 0 || commonAreaRate > 1) {
    throw new Error(`commonAreaRate phải là số thực trong đoạn [0, 1]. Nhận được: ${commonAreaRate}`);
  }

  if (count === 0) {
    return [];
  }

  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;
  const prng = options.prng ?? new PRNG(seed);

  const { feedbackTemplates, replyTemplates } = loadFeedbackReferenceData();

  // Tạo ánh xạ room lookup nhanh
  const roomMap = new Map<number, GeneratedRoom>(rooms.map((r) => [r.id, r]));
  const residentsWithRoom = residents.filter((r) => r.roomId !== null && roomMap.has(r.roomId));
  const residentsWithoutRoom = residents.filter((r) => r.roomId === null);

  // Neo thời gian tham chiếu: Tháng 10 năm 2026
  const BASE_YEAR = 2026;
  const BASE_MONTH = 9; // Tháng 10 (0-indexed)

  const feedbacks: GeneratedFeedback[] = [];

  for (let i = 0; i < count; i++) {
    const feedbackId = i + 1;

    // 1. Chọn người tạo: Bắt buộc là RESIDENT
    // Theo feedback.controller.ts:
    // - Nếu resident có roomId, effectiveRoomId LUÔN LUÔN là resident.roomId.
    // - Chỉ resident có roomId = null mới có thể tạo Feedback khu vực chung (roomId = null).
    let chosenResident: GeneratedUser;
    let chosenRoomId: number | null = null;

    const wantCommonArea = prng.next() < commonAreaRate;
    if (wantCommonArea && residentsWithoutRoom.length > 0) {
      chosenResident = prng.pickOne(residentsWithoutRoom);
      chosenRoomId = null;
    } else if (residentsWithRoom.length > 0) {
      chosenResident = prng.pickOne(residentsWithRoom);
      chosenRoomId = chosenResident.roomId;
    } else {
      chosenResident = prng.pickOne(residents);
      chosenRoomId = chosenResident.roomId;
    }

    // 2. Chọn nội dung góp ý từ reference data
    const templateIdx = i % feedbackTemplates.length;
    const template = feedbackTemplates[templateIdx];
    const title = template.title;
    const content = template.content;

    // 3. Thời gian tạo góp ý (trong 25 ngày đầu tháng 10/2026)
    const dayOffset = prng.nextInt(1, 25);
    const hour = prng.nextInt(7, 21);
    const minute = prng.nextInt(0, 59);
    const createdAt = createUTCDate(BASE_YEAR, BASE_MONTH, dayOffset, hour, minute);

    // 4. Trạng thái phản hồi & giải quyết của BQL
    // Tỷ lệ có phản hồi: ~repliedRate (mặc định 75%)
    const hasReply = prng.next() < repliedRate;
    let replyText: string | null = null;
    let repliedAt: Date | null = null;
    let isResolved = false;
    let updatedAt = new Date(createdAt.getTime());

    if (hasReply) {
      // BQL đã trả lời phản ánh
      const replyTemplate = prng.pickOne(replyTemplates);
      replyText = replyTemplate.content;

      // Thời điểm trả lời: sau lúc tạo từ 2 đến 72 giờ
      const replyDelayHours = prng.nextInt(2, 72);
      const replyDelayMinutes = prng.nextInt(0, 59);
      repliedAt = new Date(
        createdAt.getTime() + (replyDelayHours * 60 + replyDelayMinutes) * 60 * 1000
      );
      updatedAt = new Date(repliedAt.getTime());

      // Khi BQL trả lời: đa số là resolved (theo resolvedRate), nhưng vẫn có trường hợp BQL đã trả lời
      // tiếp thu nhưng vấn đề chưa xong nên isResolved = false (ví dụ chờ họp cư dân hoặc mua sắm)
      isResolved = prng.next() < resolvedRate;
    } else {
      // Chưa có phản hồi từ BQL
      replyText = null;
      repliedAt = null;
      // Góp ý chưa có câu trả lời: 90% là chưa giải quyết (false), 10% có thể BQL xử lý ngầm (true)
      isResolved = prng.next() < 0.1;
      if (isResolved) {
        // Nếu BQL đánh dấu giải quyết ngầm không cần gửi text reply
        updatedAt = new Date(createdAt.getTime() + prng.nextInt(12, 48) * 3600 * 1000);
      } else {
        updatedAt = new Date(createdAt.getTime());
      }
    }

    feedbacks.push({
      id: feedbackId,
      residentId: chosenResident.id,
      roomId: chosenRoomId,
      title,
      content,
      reply: replyText,
      isResolved,
      repliedAt,
      createdAt,
      updatedAt,
    });
  }

  // Sắp xếp tăng dần theo createdAt để mô phỏng diễn biến thời gian thực
  feedbacks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Đánh lại ID tuần tự từ 1 đến count sau khi sắp xếp
  for (let i = 0; i < feedbacks.length; i++) {
    feedbacks[i].id = i + 1;
  }

  return feedbacks;
}

