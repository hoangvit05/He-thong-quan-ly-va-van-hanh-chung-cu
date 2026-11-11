// =========================================================================
// TRÌNH SINH DỮ LIỆU SỰ CỐ & PHIẾU BÁO HỎNG (TICKET GENERATOR)
// Phân hệ: backend/dataset/seed/generators/ticket.generator.ts
// Đặc tả: Sinh 150-200 Ticket tuân thủ chặt chẽ Prisma schema, RBAC và thuật toán lọc trùng 24h
// =========================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Role, TicketStatus } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import { PRNG } from '../utils/random';
import type { GeneratedRoom } from './room.generator';
import type { GeneratedUser } from './user.generator';

export interface GeneratedTicket {
  id: number;
  title: string | null;
  category: string;
  description: string;
  mediaUrl: string | null;
  status: TicketStatus;
  roomId: number | null;
  residentId: number;
  technicianId: number | null;
  materials: string | null;
  completedMediaUrl: string | null;
  rating: number | null;
  ratingComment: string | null;
  isDuplicate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TicketGeneratorOptions {
  count?: number;
  seed?: number;
  prng?: PRNG;
  duplicateRate?: number;
  commonAreaRate?: number;
}

export interface ReferenceTicketTemplate {
  category: string;
  title: string;
  description: string;
}

export interface ReferenceCategory {
  id: string;
  name: string;
  description: string;
  examples: string[];
}

/**
 * Cache dữ liệu tham chiếu tiếng Việt trong bộ nhớ tiến trình
 */
let cachedCategories: ReferenceCategory[] | null = null;
let cachedTemplates: ReferenceTicketTemplate[] | null = null;

function loadReferenceData(): {
  categories: ReferenceCategory[];
  templates: ReferenceTicketTemplate[];
  categoryMap: Map<string, ReferenceCategory>;
} {
  if (!cachedCategories || !cachedTemplates) {
    const refDir = path.resolve(__dirname, '../../reference-data');
    const categoriesPath = path.join(refDir, 'ticket-categories.json');
    const contentPath = path.join(refDir, 'vietnamese-content.json');

    const catData = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
    const contentData = JSON.parse(fs.readFileSync(contentPath, 'utf-8'));

    cachedCategories = catData;
    cachedTemplates = contentData.tickets;
  }

  const categoryMap = new Map<string, ReferenceCategory>(
    cachedCategories!.map((c) => [c.id, c])
  );

  return {
    categories: cachedCategories!,
    templates: cachedTemplates!,
    categoryMap,
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
 * Danh mục vật tư thay thế thực tế theo nhóm chuyên môn kỹ thuật
 */
const MATERIALS_BY_CATEGORY: Record<string, string[]> = {
  'Hệ thống điện & chiếu sáng': [
    'Thay bóng LED Duhal 18W, aptomat tép Panasonic 16A, 3m dây điện CADIVI 2.5mm',
    'Thay aptomat tổng chống giật RCBO Schneider 32A',
    'Thay ổ cắm âm tường đôi 3 chấu Panasonic kèm đế âm chịu nhiệt',
    'Thay chấn lưu (driver) đèn LED máng hành lang 24W',
    'Thay công tắc đơn mặt hạt và domino đấu nối dây nguồn',
  ],
  'Cấp thoát nước & vệ sinh': [
    'Thay van góc một chiều inox 304, dây cấp nước mềm chống xoắn 40cm',
    'Thay cụm phao cơ ngắt nước và gioăng cao su két bồn cầu',
    'Thay bộ xả xi-phông chậu rửa bát inox 2 hố kèm ống thoát tràn',
    'Thay gioăng cao su chịu nhiệt củ sen tắm, quấn lại ren cao su non',
    'Thông tắc đường ống cống thoát sàn bằng dây lò xo cơ học',
  ],
  'Hệ thống thang máy': [
    'Thay relay trung gian Schneider 24VDC, bôi trơn ray dẫn hướng',
    'Căn chỉnh công tắc hành trình cửa cabin và cảm biến mành quang an toàn',
    'Thay nút bấm gọi tầng có đèn LED chiếu viền bảng điều khiển sảnh',
    'Siết lại bu lông bệ máy kéo và kiểm tra bổ sung dầu bôi trơn hộp số',
  ],
  'Phòng cháy chữa cháy & cứu nạn': [
    'Thay pin dự phòng 9V cho đầu báo khói quang điện tử độc lập',
    'Thay bóng đèn chỉ dẫn thoát hiểm khẩn cấp LED Exit 3W',
    'Thay cuộn lăng vòi chữa cháy D50 dài 20m kèm van góc vách tường',
    'Căn chỉnh tay co thủy lực đóng tự động cửa thép chống cháy',
  ],
  'Cửa, khóa & nhôm kính': [
    'Thay pin Alkaline 1.5V x 4 viên cho khóa vân tay cửa chính Hafele',
    'Thay cụm bản lề cối inox 304 chịu tải trọng cánh cửa ra vào',
    'Thay bánh xe ray trượt cửa sổ nhôm kính Xingfa hệ 55',
    'Căn chỉnh ổ khóa tay gạt và tra dầu bôi trơn lõi khóa chống kẹt',
  ],
  'Mạng Internet & viễn thông': [
    'Bấm lại đầu mạng RJ45 Cat6 bọc kim chống nhiễu',
    'Hàn nối cáp quang đơn mốt và thay đầu nối nhanh Fast Connector SC/UPC',
    'Kiểm tra lại nguồn adapter 12V-2A cho bộ khuếch đại tín hiệu tầng',
  ],
  'Điều hòa & thông gió': [
    'Vệ sinh lưới lọc bụi, xịt rửa dàn tản nhiệt, nạp bổ sung 250g gas R410A',
    'Thông đường ống dẫn nước ngưng điều hòa và bọc bảo ôn tiêu âm',
    'Thay quạt hút mùi ly tâm thông gió âm trần nhà vệ sinh 25W',
    'Thay tụ khởi động block máy nén điều hòa 35uF',
  ],
  'Chống thấm & kết cấu xây dựng': [
    'Quét keo chống thấm Sikatop Seal 107 hai lớp quanh cổ ống thoát sàn',
    'Bơm keo bọt nở PU trám khe nứt chân tường và sơn lót kháng kiềm dặm vá',
    'Dặm vá lại 2 viên gạch granite 60x60 lát ban công bị bong rộp',
    'Trét bột bả xử lý vết ố vàng trần thạch cao và lăn sơn hoàn thiện',
  ],
};

const DEFAULT_MATERIALS = [
  'Kiểm tra bảo dưỡng định kỳ và siết chặt các tiếp điểm kỹ thuật',
  'Căn chỉnh thông số vận hành và vệ sinh tổng thể cụm thiết bị',
];

/**
 * Nhận xét đánh giá nghiệm thu thực tế theo số sao (1 đến 5 sao)
 */
const RATING_COMMENTS: Record<number, string[]> = {
  5: [
    'Kỹ thuật viên nhiệt tình, xử lý sự cố rất nhanh chóng và dọn dẹp sạch sẽ hiện trường.',
    'Sửa chữa rất chuyên nghiệp, thái độ phục vụ tận tâm, đến đúng giờ hẹn.',
    'Rất hài lòng với chất lượng phục vụ và thái độ lịch sự của thợ kỹ thuật tòa nhà.',
    'Sự cố được khắc phục triệt để, thiết bị hoạt động rất êm và ổn định sau khi sửa.',
    'Kỹ thuật hỗ trợ giải thích rõ nguyên nhân và hướng dẫn sử dụng an toàn. Rất cảm ơn!',
  ],
  4: [
    'Chất lượng sửa chữa tốt, hoàn thành đúng khung giờ đã thông báo.',
    'Kỹ thuật viên hỗ trợ nhiệt tình, thiết bị đã sử dụng bình thường trở lại.',
    'Thao tác tương đối nhanh nhẹn, thu dọn đồ nghề gọn gàng sau khi làm.',
    'Nghiệm thu đạt yêu cầu, thợ làm việc cẩn thận.',
  ],
  3: [
    'Sự cố đã được xử lý xong, tuy nhiên thời gian chờ thợ kỹ thuật qua hơi lâu.',
    'Khắc phục được lỗi nhưng cần theo dõi thêm xem có bị tái phát lại không.',
    'Chất lượng tạm ổn, thợ cần chú ý lau dọn sàn nhà sạch sẽ hơn sau khi sửa.',
  ],
  2: [
    'Thời gian điều phối thợ kỹ thuật chậm trễ, cư dân phải gọi nhắc Ban quản lý nhiều lần.',
    'Thợ đến trễ so với giờ hẹn đã thông báo, thái độ chưa thực sự niềm nở.',
  ],
  1: [
    'Thời gian chờ đợi quá lâu, xử lý sự cố chưa dứt điểm khiến cư dân phải báo lại.',
  ],
};

/**
 * Thuật toán đánh giá phiếu gửi trùng lặp (Duplicate Detection Algorithm)
 * Đối chiếu chính xác theo logic nghiệp vụ của backend controller:
 * - So sánh category.trim() (exact match)
 * - Nằm trong vòng 24 giờ trước thời điểm gửi candidate (candidate.createdAt)
 * - Chỉ xét các phiếu cũ có trạng thái PENDING, ASSIGNED hoặc IN_PROGRESS
 * - Nếu candidate có roomId: đối chiếu cùng roomId
 * - Nếu candidate là khu vực chung (roomId = null): đối chiếu cùng residentId và roomId = null
 */
export function evaluateTicketDuplicate(
  candidate: {
    category: string;
    roomId: number | null;
    residentId: number;
    createdAt: Date;
  },
  existingTickets: GeneratedTicket[]
): boolean {
  const candidateTime = candidate.createdAt.getTime();
  const oneDayAgo = candidateTime - 24 * 60 * 60 * 1000;
  const candidateCategory = candidate.category.trim();

  for (const prev of existingTickets) {
    const prevTime = prev.createdAt.getTime();

    // Phiếu cũ phải xảy ra trước (hoặc cùng lúc) và trong vòng 24 giờ
    if (prevTime > candidateTime || prevTime < oneDayAgo) {
      continue;
    }

    // Chỉ xét các phiếu cũ ở trạng thái PENDING, ASSIGNED, IN_PROGRESS
    if (
      prev.status !== TicketStatus.PENDING &&
      prev.status !== TicketStatus.ASSIGNED &&
      prev.status !== TicketStatus.IN_PROGRESS
    ) {
      continue;
    }

    // So sánh category sau khi trim
    if (prev.category.trim() !== candidateCategory) {
      continue;
    }

    // Đối chiếu theo phạm vi Căn hộ hoặc Khu vực chung
    if (candidate.roomId !== null) {
      if (prev.roomId === candidate.roomId) {
        return true;
      }
    } else {
      if (prev.roomId === null && prev.residentId === candidate.residentId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Sinh danh sách phiếu sự cố kỹ thuật (Tickets) cho khu căn hộ
 * Hoàn toàn in-memory, bảo toàn tính đơn định theo PRNG seed
 */
export function generateTickets(
  users: GeneratedUser[],
  rooms: GeneratedRoom[],
  options: TicketGeneratorOptions = {}
): GeneratedTicket[] {
  // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Danh sách User đầu vào rỗng hoặc không hợp lệ.');
  }
  if (!Array.isArray(rooms) || rooms.length === 0) {
    throw new Error('Danh sách Room đầu vào rỗng hoặc không hợp lệ.');
  }

  const residents = users.filter((u) => u.role === Role.RESIDENT);
  const technicians = users.filter((u) => u.role === Role.TECHNICIAN);
  const managers = users.filter((u) => u.role === Role.BQL || u.role === Role.ADMIN);

  if (residents.length === 0) {
    throw new Error('Không tìm thấy User nào có vai trò RESIDENT để tạo phiếu.');
  }
  if (technicians.length === 0) {
    throw new Error('Không tìm thấy User nào có vai trò TECHNICIAN để gán việc.');
  }

  // 2. Kiểm tra options
  const count = options.count !== undefined ? options.count : 175;
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    throw new Error(`count phải là số nguyên không âm. Nhận được: ${count}`);
  }

  const duplicateRate = options.duplicateRate !== undefined ? options.duplicateRate : 0.06;
  if (!Number.isFinite(duplicateRate) || duplicateRate < 0 || duplicateRate > 1) {
    throw new Error(`duplicateRate phải là số thực trong đoạn [0, 1]. Nhận được: ${duplicateRate}`);
  }

  const commonAreaRate = options.commonAreaRate !== undefined ? options.commonAreaRate : 0.15;
  if (!Number.isFinite(commonAreaRate) || commonAreaRate < 0 || commonAreaRate > 1) {
    throw new Error(`commonAreaRate phải là số thực trong đoạn [0, 1]. Nhận được: ${commonAreaRate}`);
  }

  if (count === 0) {
    return [];
  }

  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;
  const prng = options.prng ?? new PRNG(seed);

  const { templates, categoryMap } = loadReferenceData();

  // Tạo ánh xạ room lookup nhanh
  const roomMap = new Map<number, GeneratedRoom>(rooms.map((r) => [r.id, r]));
  const residentsWithRoom = residents.filter((r) => r.roomId !== null && roomMap.has(r.roomId));

  // Tập hợp cư dân hợp lệ tạo phiếu
  const validCreators = residentsWithRoom.length > 0 ? residentsWithRoom : residents;

  // Xác định số lượng duplicate scenario:
  // - duplicateRate = 0: tuyệt đối không sinh duplicate (0)
  // - duplicateRate > 0: sinh theo tỷ lệ, giữ chính sách tối thiểu 4 vé nếu count >= 50
  // - Giới hạn tối đa ở count - 1 khi count > 0 để bảo đảm luôn có ít nhất 1 Ticket gốc
  let targetDuplicates = 0;
  if (duplicateRate > 0 && count > 1) {
    const rawDup = Math.round(count * duplicateRate);
    const desired = count >= 50 ? Math.max(4, rawDup) : rawDup;
    targetDuplicates = Math.min(count - 1, desired);
  }
  const targetBaseCount = count - targetDuplicates;

  // Neo thời gian tham chiếu: Ngày 25/10/2026 lúc 14:00 UTC (phù hợp với mốc thời gian M4/M5)
  const BASE_YEAR = 2026;
  const BASE_MONTH = 9; // Tháng 10 (0-indexed)

  // Lưu trữ các bản ghi tạm thời để tạo và sắp xếp
  interface RawTicketDraft {
    creatorId: number;
    roomId: number | null;
    category: string;
    template: ReferenceTicketTemplate;
    status: TicketStatus;
    createdAt: Date;
    updatedAt: Date;
    technicianId: number | null;
    materials: string | null;
    rating: number | null;
    ratingComment: string | null;
    isDuplicateCandidate?: boolean;
    revertedFromAssigned?: boolean;
    isCancellation?: boolean;
  }

  const drafts: RawTicketDraft[] = [];

  // -----------------------------------------------------------------------
  // BƯỚC 1: Sinh danh sách vé gốc (Base Tickets)
  // -----------------------------------------------------------------------
  for (let i = 0; i < targetBaseCount; i++) {
    // 1. Phân bổ trạng thái theo trọng số chuẩn cấu hình
    const status = prng.pickWeighted(DATASET_CONFIG.TICKET_STATUS_DISTRIBUTION);

    // 2. Quyết định loại sự cố: Khu vực chung hay theo căn hộ
    const isCommonArea = prng.next() < commonAreaRate;
    let chosenRoomId: number | null = null;
    let creatorId: number;

    if (isCommonArea) {
      chosenRoomId = null;
      // Cư dân hoặc BQL có thể báo sự cố khu vực chung
      if (prng.next() < 0.9 && residents.length > 0) {
        creatorId = prng.pickOne(residents).id;
      } else if (managers.length > 0) {
        creatorId = prng.pickOne(managers).id;
      } else {
        creatorId = prng.pickOne(residents).id;
      }
    } else {
      // Sự cố thuộc căn hộ cụ thể
      const resident = prng.pickOne(validCreators);
      creatorId = resident.id;
      chosenRoomId = resident.roomId!;
    }

    // 3. Chọn nội dung từ thư viện tiếng Việt
    const template = prng.pickOne(templates);
    const catMeta = categoryMap.get(template.category);
    const categoryName = catMeta ? catMeta.name : template.category;

    // 4. Sinh mốc thời gian tạo phiếu (trong vòng 30 ngày)
    const dayOffset = prng.nextInt(1, 25);
    const hour = prng.nextInt(7, 21);
    const minute = prng.nextInt(0, 59);
    const createdAt = createUTCDate(BASE_YEAR, BASE_MONTH, dayOffset, hour, minute);

    // 5. Xác định kỹ thuật viên và vòng đời xử lý
    let technicianId: number | null = null;
    let materials: string | null = null;
    let rating: number | null = null;
    let ratingComment: string | null = null;
    let updatedAt = new Date(createdAt.getTime());
    let revertedFromAssigned = false;
    let isCancellation = false;

    if (status === TicketStatus.PENDING) {
      // 90% PENDING không có thợ, 10% kịch bản BQL thu hồi gán việc (ASSIGNED -> PENDING) giữ thợ cũ
      if (prng.next() < 0.1) {
        technicianId = prng.pickOne(technicians).id;
        revertedFromAssigned = true;
        updatedAt = new Date(createdAt.getTime() + prng.nextInt(15, 120) * 60 * 1000);
      } else {
        technicianId = null;
        updatedAt = new Date(createdAt.getTime());
      }
    } else if (status === TicketStatus.ASSIGNED) {
      // ASSIGNED bắt buộc phải có TECHNICIAN
      technicianId = prng.pickOne(technicians).id;
      updatedAt = new Date(createdAt.getTime() + prng.nextInt(15, 180) * 60 * 1000);
    } else if (status === TicketStatus.IN_PROGRESS) {
      // IN_PROGRESS bắt buộc phải có TECHNICIAN, có thể có vật tư
      technicianId = prng.pickOne(technicians).id;
      updatedAt = new Date(createdAt.getTime() + prng.nextInt(60, 360) * 60 * 1000);
      if (prng.next() < 0.55) {
        const catMaterials = MATERIALS_BY_CATEGORY[categoryName] || DEFAULT_MATERIALS;
        materials = prng.pickOne(catMaterials);
      }
    } else if (status === TicketStatus.COMPLETED) {
      // COMPLETED bắt buộc phải có TECHNICIAN, vật tư đã kê khai, chưa chấm điểm (chờ nghiệm thu)
      technicianId = prng.pickOne(technicians).id;
      updatedAt = new Date(createdAt.getTime() + prng.nextInt(120, 720) * 60 * 1000);
      if (prng.next() < 0.75) {
        const catMaterials = MATERIALS_BY_CATEGORY[categoryName] || DEFAULT_MATERIALS;
        materials = prng.pickOne(catMaterials);
      }
    } else if (status === TicketStatus.CLOSED) {
      // CLOSED: ~80% là nghiệm thu hoàn tất từ COMPLETED (có đánh giá), ~20% là hủy phiếu
      const isAccepted = prng.next() < 0.8;
      if (isAccepted) {
        technicianId = prng.pickOne(technicians).id;
        updatedAt = new Date(createdAt.getTime() + prng.nextInt(240, 1440) * 60 * 1000);
        if (prng.next() < 0.75) {
          const catMaterials = MATERIALS_BY_CATEGORY[categoryName] || DEFAULT_MATERIALS;
          materials = prng.pickOne(catMaterials);
        }
        // Đánh giá 1 - 5 sao
        const starRoll = prng.next();
        let star = 5;
        if (starRoll < 0.5) star = 5;
        else if (starRoll < 0.82) star = 4;
        else if (starRoll < 0.94) star = 3;
        else if (starRoll < 0.98) star = 2;
        else star = 1;

        rating = star;
        // 70% có nhận xét chi tiết
        if (prng.next() < 0.7) {
          const commentList = RATING_COMMENTS[star] || RATING_COMMENTS[5];
          ratingComment = prng.pickOne(commentList);
        }
      } else {
        // Hủy phiếu (từ PENDING hoặc ASSIGNED)
        isCancellation = true;
        const cancelledFromPending = prng.next() < 0.6;
        if (cancelledFromPending) {
          technicianId = null; // Cư dân tự hủy khi chưa gán thợ
        } else {
          technicianId = prng.pickOne(technicians).id; // BQL hủy sau khi đã giao việc
        }
        updatedAt = new Date(createdAt.getTime() + prng.nextInt(30, 240) * 60 * 1000);
        materials = null;
        rating = null;
        ratingComment = null;
      }
    }

    drafts.push({
      creatorId,
      roomId: chosenRoomId,
      category: categoryName,
      template,
      status,
      createdAt,
      updatedAt,
      technicianId,
      materials,
      rating,
      ratingComment,
      revertedFromAssigned,
      isCancellation,
    });
  }

  // -----------------------------------------------------------------------
  // BƯỚC 2: Sinh danh sách vé trùng lặp thực tế (Duplicate Scenarios)
  // -----------------------------------------------------------------------
  // Bảo đảm luôn có ít nhất một Ticket gốc thuộc trạng thái PENDING, ASSIGNED hoặc IN_PROGRESS nếu cần sinh duplicate
  if (targetDuplicates > 0 && drafts.length > 0) {
    const hasEligible = drafts.some(
      (d) =>
        d.status === TicketStatus.PENDING ||
        d.status === TicketStatus.ASSIGNED ||
        d.status === TicketStatus.IN_PROGRESS
    );
    if (!hasEligible) {
      drafts[0].status = TicketStatus.PENDING;
      drafts[0].technicianId = null;
      drafts[0].materials = null;
      drafts[0].rating = null;
      drafts[0].ratingComment = null;
      drafts[0].updatedAt = new Date(drafts[0].createdAt.getTime());
    }
  }

  // Tìm các vé gốc đủ điều kiện làm nguồn duplicate:
  // - Trạng thái: PENDING, ASSIGNED, IN_PROGRESS
  const eligibleSources = drafts.filter(
    (d) =>
      d.status === TicketStatus.PENDING ||
      d.status === TicketStatus.ASSIGNED ||
      d.status === TicketStatus.IN_PROGRESS
  );

  if (targetDuplicates > 0 && eligibleSources.length === 0) {
    throw new Error('Không thể sinh vé trùng lặp do thiếu Ticket gốc hợp lệ.');
  }

  const roomSources = eligibleSources.filter((d) => d.roomId !== null);
  const commonSources = eligibleSources.filter((d) => d.roomId === null);

  for (let dIdx = 0; dIdx < targetDuplicates; dIdx++) {
    // Luân phiên tạo duplicate cho Căn hộ và Khu vực chung
    const isCommonDup = dIdx % 2 === 1 && commonSources.length > 0;
    let source: RawTicketDraft;

    if (isCommonDup && commonSources.length > 0) {
      source = prng.pickOne(commonSources);
    } else if (roomSources.length > 0) {
      source = prng.pickOne(roomSources);
    } else if (eligibleSources.length > 0) {
      source = prng.pickOne(eligibleSources);
    } else {
      throw new Error('Không tìm thấy Ticket gốc hợp lệ để nhân bản duplicate.');
    }

    // Mốc thời gian gửi vé trùng: Sau vé gốc từ 1 đến 18 giờ (chắc chắn < 24 giờ)
    const hoursAfter = prng.nextInt(1, 18);
    const minutesAfter = prng.nextInt(5, 55);
    const dupCreatedAt = new Date(
      source.createdAt.getTime() + (hoursAfter * 60 + minutesAfter) * 60 * 1000
    );

    // Người tạo vé trùng:
    let dupCreatorId: number;
    let dupRoomId: number | null;

    if (source.roomId !== null) {
      // Cùng căn hộ: Có thể do chính cư dân đó hoặc cư dân khác cùng phòng gửi thêm
      dupRoomId = source.roomId;
      const coResidents = validCreators.filter((r) => r.roomId === source.roomId);
      dupCreatorId = coResidents.length > 0 ? prng.pickOne(coResidents).id : source.creatorId;
    } else {
      // Khu vực chung: BẮT BUỘC cùng residentId và roomId = null theo thuật toán backend
      dupRoomId = null;
      dupCreatorId = source.creatorId;
    }

    // Vé trùng lặp luôn bắt đầu ở trạng thái PENDING
    const dupStatus = prng.next() < 0.8 ? TicketStatus.PENDING : TicketStatus.CLOSED;
    let dupTechId: number | null = null;
    let dupMaterials: string | null = null;
    let dupRating: number | null = null;
    let dupRatingComment: string | null = null;
    let dupUpdatedAt = new Date(dupCreatedAt.getTime());

    if (dupStatus === TicketStatus.CLOSED) {
      // Trường hợp BQL đóng/hủy nhanh vé trùng
      dupUpdatedAt = new Date(dupCreatedAt.getTime() + prng.nextInt(15, 60) * 60 * 1000);
    }

    drafts.push({
      creatorId: dupCreatorId,
      roomId: dupRoomId,
      category: source.category, // BẮT BUỘC giữ nguyên category để thỏa mãn exact match
      template: source.template,
      status: dupStatus,
      createdAt: dupCreatedAt,
      updatedAt: dupUpdatedAt,
      technicianId: dupTechId,
      materials: dupMaterials,
      rating: dupRating,
      ratingComment: dupRatingComment,
      isDuplicateCandidate: true,
    });
  }

  // -----------------------------------------------------------------------
  // BƯỚC 3: Sắp xếp theo trình tự thời gian và Đánh giá cờ isDuplicate
  // -----------------------------------------------------------------------
  // Sắp xếp tăng dần theo createdAt để mô phỏng chính xác tiến trình các sự cố phát sinh theo thời gian thực
  drafts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const result: GeneratedTicket[] = [];
  let ticketIdCounter = 1;

  for (const draft of drafts) {
    const ticketId = ticketIdCounter++;

    // Tiêu đề: Lấy từ template, nếu là phòng cụ thể thì giữ nguyên tiêu đề thực tế từ bộ dữ liệu
    let title = draft.template.title;

    // Khi duplicateRate === 0: Chắc chắn không có bất kỳ vé nào bị vô tình trùng lặp
    if (duplicateRate === 0) {
      if (
        evaluateTicketDuplicate(
          {
            category: draft.category,
            roomId: draft.roomId,
            residentId: draft.creatorId,
            createdAt: draft.createdAt,
          },
          result
        )
      ) {
        // Tìm template/category khác chưa có sự cố trong vòng 24h đối với phòng hoặc cư dân này
        for (const altTemplate of templates) {
          const altCatMeta = categoryMap.get(altTemplate.category);
          const altCatName = altCatMeta ? altCatMeta.name : altTemplate.category;
          if (
            !evaluateTicketDuplicate(
              {
                category: altCatName,
                roomId: draft.roomId,
                residentId: draft.creatorId,
                createdAt: draft.createdAt,
              },
              result
            )
          ) {
            draft.category = altCatName;
            draft.template = altTemplate;
            title = altTemplate.title;
            break;
          }
        }
      }
    }

    // Đánh giá cờ isDuplicate bằng thuật toán chuẩn xác của controller đối chiếu với các vé đã sinh trước đó
    const isDuplicate = evaluateTicketDuplicate(
      {
        category: draft.category,
        roomId: draft.roomId,
        residentId: draft.creatorId,
        createdAt: draft.createdAt,
      },
      result
    );

    result.push({
      id: ticketId,
      title,
      category: draft.category,
      description: draft.template.description,
      mediaUrl: null, // Không tạo ảnh giả Cloudinary; tuân thủ nghiêm ngặt chính sách MediaAsset
      status: draft.status,
      roomId: draft.roomId,
      residentId: draft.creatorId,
      technicianId: draft.technicianId,
      materials: draft.materials,
      completedMediaUrl: null, // Không tạo media nghiệm thu giả
      rating: draft.rating,
      ratingComment: draft.ratingComment,
      isDuplicate,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    });
  }

  if (result.length !== count) {
    throw new Error(`Không thể sinh đủ số lượng Ticket yêu cầu (${result.length}/${count}).`);
  }

  return result;
}

