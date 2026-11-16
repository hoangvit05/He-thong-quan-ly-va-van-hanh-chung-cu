// =========================================================================
// ĐIỀU PHỐI SEED DATASET VÀO CƠ SỞ DỮ LIỆU POSTGRESQL (SEED ORCHESTRATION)
// Phân hệ: backend/dataset/seed/index.ts
// Đặc tả: Milestone 9 – Prisma Seed Orchestration & Database Safety Guard
// =========================================================================

import path from 'path';
import dotenv from 'dotenv';
import { Role } from '@prisma/client';
import defaultPrisma from '../../src/database/prisma';
import { DATASET_CONFIG } from '../config/dataset.config';
import { PRNG } from './utils/random';
import { DEFAULT_DEMO_PASSWORD, hashPasswordSync } from './utils/password';

// Nạp các Generators theo đúng thứ tự phụ thuộc
import { generateRooms, GeneratedRoom } from './generators/room.generator';
import { generateUsers, GeneratedUser } from './generators/user.generator';
import { generateTickets, GeneratedTicket } from './generators/ticket.generator';
import { generateInvoicesAndPayments, GeneratedInvoice } from './generators/invoice.generator';
import { GeneratedPayment } from './generators/payment.generator';
import { generateFeedbacks, GeneratedFeedback } from './generators/feedback.generator';
import { generateNotifications, GeneratedNotification } from './generators/notification.generator';
import { generateMediaAssets, GeneratedMediaAsset } from './generators/media-asset.generator';

// Nạp các hàm kiểm tra tính toàn vẹn (Checks)
import { checkCounts } from '../validation/checks/counts.check';
import { checkFinancialIntegrity } from '../validation/checks/financial.check';
import { checkTicketIntegrity } from '../validation/checks/ticket.check';
import { checkMediaIntegrity } from '../validation/checks/media.check';
import { checkRelationalIntegrity } from '../validation/checks/relational.check';

// Nạp biến môi trường từ .env cục bộ nếu chưa có
dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

/**
 * Cấu trúc toàn bộ tập dữ liệu được sinh ra trong bộ nhớ
 */
export interface EntireDataset {
  rooms: GeneratedRoom[];
  users: GeneratedUser[];
  invoices: GeneratedInvoice[];
  payments: GeneratedPayment[];
  tickets: GeneratedTicket[];
  feedbacks: GeneratedFeedback[];
  notifications: GeneratedNotification[];
  mediaAssets: GeneratedMediaAsset[];
}

/**
 * Tùy chọn cấu hình cho Seed Orchestrator
 */
export interface SeedOrchestrationOptions {
  prismaClient?: any;
  seed?: number;
  skipPrismaDisconnect?: boolean;
  logger?: (msg: string) => void;
  databaseUrl?: string;
  passwordHash?: string;
}

/**
 * Kết quả thực thi nạp dữ liệu vào database
 */
export interface SeedExecutionResult {
  success: boolean;
  counts: {
    rooms: number;
    users: number;
    invoices: number;
    payments: number;
    tickets: number;
    feedbacks: number;
    notifications: number;
    mediaAssets: number;
  };
  durationMs: number;
}

/**
 * Khung tóm tắt trạng thái pipeline (Tương thích Milestone 2)
 */
export interface SeedPipelineSummary {
  status: 'READY';
  milestone: string;
  config: typeof DATASET_CONFIG;
}

/**
 * 1. BẢO VỆ CƠ SỞ DỮ LIỆU & CHẶN PRODUCTION (DATABASE SAFETY GUARD - FAIL-CLOSED)
 *
 * Tiêu chí kiểm soát an toàn nghiêm ngặt:
 * - Chặn tuyệt đối khi NODE_ENV === 'production'
 * - Bắt buộc có cờ xác nhận ALLOW_DATASET_SEED=true
 * - Bắt buộc DATABASE_URL hợp lệ và có thể parse
 * - Phát hiện và từ chối từ khóa Production trong Hostname và Database Name
 * - Từ chối database trên Cloud nếu không có nhãn dev/test/demo/sandbox
 * - Từ chối database target không xác định được tính an toàn
 * - Tuyệt đối không log DATABASE_URL chứa thông tin đăng nhập
 */
export function assertSafeDatabaseEnvironment(customDatabaseUrl?: string): void {
  // 1. Kiểm tra cờ cấu hình hệ thống
  if (!DATASET_CONFIG.SAFETY.REJECT_PRODUCTION) {
    throw new Error('[FATAL DATABASE SAFETY ERROR] Cấu hình hệ thống bắt buộc phải kích hoạt REJECT_PRODUCTION.');
  }

  // 2. Chặn NODE_ENV=production
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    throw new Error('[FATAL DATABASE SAFETY ERROR] Tuyệt đối từ chối chạy seed dữ liệu trên môi trường PRODUCTION!');
  }

  // 3. Kiểm tra biến opt-in bắt buộc
  const optIn = process.env[DATASET_CONFIG.SAFETY.REQUIRED_OPT_IN_ENV];
  if (optIn !== 'true') {
    throw new Error(
      `[FATAL DATABASE SAFETY ERROR] Thao tác bị từ chối: Biến môi trường ${DATASET_CONFIG.SAFETY.REQUIRED_OPT_IN_ENV} phải có giá trị 'true' để xác nhận thực thi seed.`
    );
  }

  // 4. Kiểm tra sự tồn tại của DATABASE_URL
  const rawDbUrl = customDatabaseUrl ?? process.env.DATABASE_URL;
  if (!rawDbUrl || typeof rawDbUrl !== 'string' || !rawDbUrl.trim()) {
    throw new Error('[FATAL DATABASE SAFETY ERROR] Biến môi trường DATABASE_URL thiếu hoặc không hợp lệ.');
  }

  // 5. Phân tích cú pháp DATABASE_URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawDbUrl);
  } catch {
    throw new Error('[FATAL DATABASE SAFETY ERROR] DATABASE_URL không thể phân tích cú pháp hợp lệ.');
  }

  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
    throw new Error('[FATAL DATABASE SAFETY ERROR] Giao thức DATABASE_URL không hợp lệ. Chỉ chấp nhận postgresql: hoặc postgres:.');
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const dbName = parsedUrl.pathname.replace(/^\//, '').split('?')[0].trim().toLowerCase();

  if (!dbName) {
    throw new Error('[FATAL DATABASE SAFETY ERROR] DATABASE_URL không chứa tên database mục tiêu.');
  }

  // 6. Phát hiện dấu hiệu Production (Fail-Closed)
  const prodKeywords = ['prod', 'production', 'live', 'main', 'master'];
  for (const kw of prodKeywords) {
    const regex = new RegExp(`(^|[._-])${kw}([._-]|$)`, 'i');
    if (regex.test(hostname) || hostname === kw) {
      throw new Error(
        `[FATAL DATABASE SAFETY ERROR] Phát hiện dấu hiệu Production trong hostname ('${kw}'). Tuyệt đối từ chối thực thi kể cả khi có ALLOW_DATASET_SEED=true!`
      );
    }
    if (regex.test(dbName) || dbName === kw) {
      throw new Error(
        `[FATAL DATABASE SAFETY ERROR] Phát hiện dấu hiệu Production trong tên database ('${kw}'). Tuyệt đối từ chối thực thi kể cả khi có ALLOW_DATASET_SEED=true!`
      );
    }
  }

  // 7. Kiểm tra các dịch vụ Cloud Database phổ biến
  const cloudProdDomains = [
    'rds.amazonaws.com',
    'cloud.google.com',
    'azure.com',
    'neon.tech',
    'supabase.co',
    'railway.app',
    'render.com',
  ];
  for (const domain of cloudProdDomains) {
    if (hostname.endsWith(domain)) {
      const hasSafeCloudLabel =
        dbName.includes('dev') ||
        dbName.includes('test') ||
        dbName.includes('demo') ||
        dbName.includes('sandbox');
      if (!hasSafeCloudLabel) {
        throw new Error(
          `[FATAL DATABASE SAFETY ERROR] Database trên Cloud (${domain}) không xác định được mức độ an toàn (thiếu nhãn dev/test/demo/sandbox). Từ chối theo chính sách Fail-Closed!`
        );
      }
    }
  }

  // 8. Xác minh database mục tiêu có căn cứ an toàn rõ ràng
  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === 'host.docker.internal';

  const hasSafeIndicator =
    dbName.includes('dev') ||
    dbName.includes('test') ||
    dbName.includes('demo') ||
    dbName.includes('sandbox') ||
    dbName.includes('apartment_db') ||
    dbName === 'postgres';

  if (!isLocalHost && !hasSafeIndicator) {
    throw new Error(
      '[FATAL DATABASE SAFETY ERROR] Không đủ thông tin xác định database target là an toàn (không thuộc localhost và không có nhãn dev/test/demo/sandbox). Từ chối theo chính sách Fail-Closed!'
    );
  }
}

/**
 * 2. SINH TOÀN BỘ DATASET ĐƠN ĐỊNH THEO THỨ TỰ PHỤ THUỘC (IN-MEMORY GENERATION)
 *
 * Thứ tự chuẩn phụ thuộc quan hệ:
 * 1. Room (Master data căn hộ)
 * 2. User (Người dùng, liên kết roomId)
 * 3. Ticket (Phiếu sự cố, liên kết roomId, residentId, technicianId)
 * 4. Invoice & Payment (Sinh đồng bộ từ generateInvoicesAndPayments)
 * 5. Feedback (Góp ý cư dân, liên kết residentId, roomId)
 * 6. Notification (Thông báo tòa nhà, liên kết authorId, targetRoom)
 * 7. MediaAsset (Zero-Asset: luôn trả về [])
 */
export function generateEntireDataset(
  options: {
    seed?: number;
    passwordHash?: string;
    onGeneratorStep?: (generatorName: string) => void;
  } = {}
): EntireDataset {
  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;
  const notifyStep = options.onGeneratorStep ?? (() => {});

  // Pre-hash password một lần duy nhất bằng bcryptjs để đảm bảo tính đơn định
  const passwordHash = options.passwordHash ?? hashPasswordSync(DEFAULT_DEMO_PASSWORD);

  // 1. Room
  notifyStep('room');
  const rooms = generateRooms({ seed });

  // 2. User
  notifyStep('user');
  const users = generateUsers(rooms, { seed, passwordHash });

  // 3. Ticket
  notifyStep('ticket');
  const tickets = generateTickets(users, rooms, { seed });

  // 4. Invoice & Payment (kết hợp đồng bộ)
  notifyStep('invoice_payment');
  const { invoices, payments } = generateInvoicesAndPayments(rooms, { seed });

  // 5. Feedback
  notifyStep('feedback');
  const feedbacks = generateFeedbacks(users, rooms, { seed });

  // 6. Notification
  notifyStep('notification');
  const notifications = generateNotifications(users, rooms, { seed });

  // 7. MediaAsset (Chính sách Zero-Asset cứng)
  notifyStep('media_asset');
  const mediaAssets = generateMediaAssets(users, tickets, { seed });

  return {
    rooms,
    users,
    invoices,
    payments,
    tickets,
    feedbacks,
    notifications,
    mediaAssets,
  };
}

/**
 * 3. KIỂM ĐỊNH TÍNH TOÀN VẸN DATASET TRƯỚC KHI GHI (PRE-WRITE VALIDATION)
 *
 * Kiểm tra 100% các tiêu chí nghiệp vụ và khóa ngoại trước khi chạm vào cơ sở dữ liệu.
 */
export function validateDatasetBeforeWrite(dataset: EntireDataset): void {
  // 1. Kiểm tra quy mô số lượng bản ghi (Counts check)
  const countsCheck = checkCounts({
    rooms: dataset.rooms.length,
    users: {
      total: dataset.users.length,
      admin: dataset.users.filter((u) => u.role === Role.ADMIN).length,
      bql: dataset.users.filter((u) => u.role === Role.BQL).length,
      technician: dataset.users.filter((u) => u.role === Role.TECHNICIAN).length,
      resident: dataset.users.filter((u) => u.role === Role.RESIDENT).length,
    },
    tickets: dataset.tickets.length,
    invoices: dataset.invoices.length,
    payments: dataset.payments.length,
    feedbacks: dataset.feedbacks.length,
    notifications: dataset.notifications.length,
    mediaAssets: dataset.mediaAssets.length,
  });

  if (!countsCheck.passed) {
    throw new Error(`[Pre-write Validation Failed] ${countsCheck.message}`);
  }

  // 2. Kiểm tra chính sách MediaAsset (Bắt buộc = 0)
  if (dataset.mediaAssets.length > 0) {
    throw new Error(
      `[Pre-write Validation Failed] Vi phạm chính sách Zero-Asset: mediaAssets phải bằng 0 nhưng có ${dataset.mediaAssets.length} bản ghi.`
    );
  }

  // 3. Kiểm tra tính duy nhất của các trường unique
  const roomNumbers = new Set<string>();
  for (const r of dataset.rooms) {
    if (roomNumbers.has(r.roomNumber)) {
      throw new Error(`[Pre-write Validation Failed] roomNumber bị trùng lặp: ${r.roomNumber}`);
    }
    roomNumbers.add(r.roomNumber);
  }

  const usernames = new Set<string>();
  const emails = new Set<string>();
  for (const u of dataset.users) {
    if (usernames.has(u.username)) {
      throw new Error(`[Pre-write Validation Failed] username bị trùng lặp: ${u.username}`);
    }
    usernames.add(u.username);
    if (u.email) {
      if (emails.has(u.email)) {
        throw new Error(`[Pre-write Validation Failed] email bị trùng lặp: ${u.email}`);
      }
      emails.add(u.email);
    }
  }

  const roomMonths = new Set<string>();
  for (const inv of dataset.invoices) {
    const key = `${inv.roomId}_${inv.month}`;
    if (roomMonths.has(key)) {
      throw new Error(`[Pre-write Validation Failed] Cặp [roomId, month] bị trùng lặp: ${key}`);
    }
    roomMonths.add(key);
  }

  // 4. Kiểm tra quan hệ khóa ngoại trong bộ nhớ
  const roomMap = new Map<number, GeneratedRoom>(dataset.rooms.map((r) => [r.id, r]));
  const userMap = new Map<number, GeneratedUser>(dataset.users.map((u) => [u.id, u]));
  const invoiceMap = new Map<number, GeneratedInvoice>(dataset.invoices.map((i) => [i.id, i]));

  // User relations
  for (const u of dataset.users) {
    if (u.role === Role.ADMIN || u.role === Role.BQL || u.role === Role.TECHNICIAN) {
      if (u.roomId !== null) {
        throw new Error(`[Pre-write Validation Failed] Nhân sự ${u.username} (${u.role}) không được phép có roomId.`);
      }
    } else if (u.roomId !== null) {
      if (!roomMap.has(u.roomId)) {
        throw new Error(`[Pre-write Validation Failed] Cư dân ${u.username} tham chiếu roomId ${u.roomId} không tồn tại.`);
      }
    }
  }

  // Invoice relations
  for (const inv of dataset.invoices) {
    if (!roomMap.has(inv.roomId)) {
      throw new Error(`[Pre-write Validation Failed] Hóa đơn #${inv.id} tham chiếu roomId ${inv.roomId} không tồn tại.`);
    }
  }

  // Payment relations & Overpayment check
  const paymentsByInvoice = new Map<number, GeneratedPayment[]>();
  for (const p of dataset.payments) {
    if (!invoiceMap.has(p.invoiceId)) {
      throw new Error(`[Pre-write Validation Failed] Giao dịch #${p.id} tham chiếu invoiceId ${p.invoiceId} không tồn tại.`);
    }
    const list = paymentsByInvoice.get(p.invoiceId) ?? [];
    list.push(p);
    paymentsByInvoice.set(p.invoiceId, list);
  }

  // Financial consistency check
  for (const inv of dataset.invoices) {
    const invPayments = paymentsByInvoice.get(inv.id) ?? [];
    let sumPaid = 0;
    for (const p of invPayments) {
      sumPaid += Number(p.amount.toString());
    }
    const total = Number(inv.totalAmount.toString());
    const paid = Number(inv.paidAmount.toString());

    if (Math.abs(sumPaid - paid) > 0.01) {
      throw new Error(
        `[Pre-write Validation Failed] Hóa đơn #${inv.id} có paidAmount (${paid}) không khớp tổng Payment (${sumPaid}).`
      );
    }

    if (paid > total + 0.01) {
      throw new Error(`[Pre-write Validation Failed] Hóa đơn #${inv.id} bị overpayment (${paid} > ${total}).`);
    }

    if (Math.abs(paid - total) <= 0.01 && inv.status !== 'PAID') {
      throw new Error(`[Pre-write Validation Failed] Hóa đơn #${inv.id} đã trả đủ nhưng status = ${inv.status} (phải là PAID).`);
    } else if (paid > 0 && paid < total - 0.01 && inv.status !== 'PARTIALLY_PAID') {
      throw new Error(
        `[Pre-write Validation Failed] Hóa đơn #${inv.id} trả một phần nhưng status = ${inv.status} (phải là PARTIALLY_PAID).`
      );
    } else if (paid === 0 && inv.status !== 'UNPAID') {
      throw new Error(`[Pre-write Validation Failed] Hóa đơn #${inv.id} chưa trả nhưng status = ${inv.status} (phải là UNPAID).`);
    }
  }

  // Feedback relations & room ownership
  for (const f of dataset.feedbacks) {
    const resident = userMap.get(f.residentId);
    if (!resident || resident.role !== Role.RESIDENT) {
      throw new Error(`[Pre-write Validation Failed] Feedback #${f.id} người tạo không phải RESIDENT.`);
    }
    if (f.roomId !== resident.roomId) {
      throw new Error(
        `[Pre-write Validation Failed] Feedback #${f.id} có roomId (${f.roomId}) không khớp với resident.roomId (${resident.roomId}).`
      );
    }
  }

  // Ticket relations & technician role
  for (const t of dataset.tickets) {
    const creator = userMap.get(t.residentId);
    if (!creator || (creator.role !== Role.RESIDENT && creator.role !== Role.BQL && creator.role !== Role.ADMIN)) {
      throw new Error(`[Pre-write Validation Failed] Ticket #${t.id} người tạo không phải RESIDENT hoặc BQL/ADMIN.`);
    }
    if (t.technicianId !== null) {
      const tech = userMap.get(t.technicianId);
      if (!tech || tech.role !== Role.TECHNICIAN) {
        throw new Error(`[Pre-write Validation Failed] Ticket #${t.id} technicianId ${t.technicianId} không phải TECHNICIAN.`);
      }
    }
    if (t.roomId !== null && !roomMap.has(t.roomId)) {
      throw new Error(`[Pre-write Validation Failed] Ticket #${t.id} tham chiếu roomId ${t.roomId} không tồn tại.`);
    }
  }

  // Notification relations
  for (const n of dataset.notifications) {
    if (n.authorId !== null) {
      const author = userMap.get(n.authorId);
      if (!author || (author.role !== Role.ADMIN && author.role !== Role.BQL)) {
        throw new Error(`[Pre-write Validation Failed] Notification #${n.id} authorId ${n.authorId} không phải ADMIN hoặc BQL.`);
      }
    }
    if (n.targetRoom !== null && !roomNumbers.has(n.targetRoom)) {
      throw new Error(`[Pre-write Validation Failed] Notification #${n.id} targetRoom '${n.targetRoom}' không tồn tại trong danh sách Room.`);
    }
  }
}

/**
 * 4. THỰC THI SEED VÀO DATABASE (PRISMA TRANSACTION & ID MAPPING)
 *
 * Chiến lược ghi dữ liệu:
 * - Bao trọn toàn bộ quá trình ghi trong Prisma Interactive Transaction ($transaction)
 * - Thứ tự ghi đảm bảo khóa ngoại: Room -> User -> Invoice -> Payment -> Ticket -> Feedback -> Notification
 * - Ánh xạ ID thực tế từ database sau khi upsert/insert entity cha sang entity con
 * - Idempotent an toàn: Không dùng generator ID bừa bãi; đối chiếu bản ghi qua unique keys hoặc natural composite keys
 * - Cấm tuyệt đối: deleteMany, delete, TRUNCATE, schema migration
 * - Rollback toàn diện khi có lỗi tại bất kỳ giai đoạn nào
 * - Luôn đóng kết nối Prisma ($disconnect) trong finally
 */
export async function executeSeed(options: SeedOrchestrationOptions = {}): Promise<SeedExecutionResult> {
  const startTime = Date.now();
  const logger = options.logger ?? console.log;

  // 1. Kiểm tra an toàn database (Fail-Closed)
  assertSafeDatabaseEnvironment(options.databaseUrl);

  const seed = options.seed ?? DATASET_CONFIG.RANDOM_SEED;

  // 2. Sinh toàn bộ dữ liệu đơn định trong bộ nhớ
  logger(`[Seed] Bắt đầu sinh dataset với seed = ${seed}...`);
  const dataset = generateEntireDataset({ seed, passwordHash: options.passwordHash });

  // 3. Kiểm định toàn vẹn dữ liệu trước khi ghi database
  logger('[Seed] Kiểm định dữ liệu trước khi ghi (Pre-write Validation)...');
  validateDatasetBeforeWrite(dataset);
  logger('  ✅ Dữ liệu sinh ra thỏa mãn 100% các tiêu chuẩn kiểm định.');

  // 4. Lấy Prisma Client
  const client: any = options.prismaClient ?? defaultPrisma;

  // 5. Ghi dữ liệu vào database trong một transaction an toàn
  logger('[Seed] Khởi tạo transaction ghi dữ liệu vào database...');
  let currentStage = 'INIT';

  try {
    await client.$transaction(
      async (tx: any) => {
        // Giai đoạn 1: Room (Master Data)
        currentStage = 'ROOM';
        const roomIdMap = new Map<number, number>();

        for (const r of dataset.rooms) {
          const dbRoom = await tx.room.upsert({
            where: { roomNumber: r.roomNumber },
            create: {
              roomNumber: r.roomNumber,
              floor: r.floor,
              area: r.area,
              status: r.status,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            },
            update: {
              floor: r.floor,
              area: r.area,
              status: r.status,
              updatedAt: r.updatedAt,
            },
          });
          roomIdMap.set(r.id, dbRoom.id);
        }

        // Giai đoạn 2: User (Ánh xạ roomId thực tế từ database)
        currentStage = 'USER';
        const userIdMap = new Map<number, number>();

        for (const u of dataset.users) {
          const mappedRoomId = u.roomId ? roomIdMap.get(u.roomId) ?? null : null;
          const dbUser = await tx.user.upsert({
            where: { username: u.username },
            create: {
              username: u.username,
              password: u.password,
              fullName: u.fullName,
              phone: u.phone,
              email: u.email,
              role: u.role,
              roomId: mappedRoomId,
              isApproved: u.isApproved,
              createdAt: u.createdAt,
              updatedAt: u.updatedAt,
            },
            update: {
              password: u.password,
              fullName: u.fullName,
              phone: u.phone,
              email: u.email,
              role: u.role,
              roomId: mappedRoomId,
              isApproved: u.isApproved,
              updatedAt: u.updatedAt,
            },
          });
          userIdMap.set(u.id, dbUser.id);
        }

        // Giai đoạn 3: Invoice (Ánh xạ roomId thực tế; unique [roomId, month])
        currentStage = 'INVOICE';
        const invoiceIdMap = new Map<number, number>();

        for (const inv of dataset.invoices) {
          const mappedRoomId = roomIdMap.get(inv.roomId)!;
          const dbInvoice = await tx.invoice.upsert({
            where: {
              roomId_month: {
                roomId: mappedRoomId,
                month: inv.month,
              },
            },
            create: {
              roomId: mappedRoomId,
              month: inv.month,
              managementFee: inv.managementFee,
              parkingFee: inv.parkingFee,
              waterFee: inv.waterFee,
              otherFee: inv.otherFee,
              totalAmount: inv.totalAmount,
              paidAmount: inv.paidAmount,
              dueDate: inv.dueDate,
              status: inv.status,
              createdAt: inv.createdAt,
              updatedAt: inv.updatedAt,
            },
            update: {
              managementFee: inv.managementFee,
              parkingFee: inv.parkingFee,
              waterFee: inv.waterFee,
              otherFee: inv.otherFee,
              totalAmount: inv.totalAmount,
              paidAmount: inv.paidAmount,
              dueDate: inv.dueDate,
              status: inv.status,
              updatedAt: inv.updatedAt,
            },
          });
          invoiceIdMap.set(inv.id, dbInvoice.id);
        }

        // Giai đoạn 4: Payment (Ánh xạ invoiceId thực tế; nhận diện bằng transactionCode hoặc note + amount)
        currentStage = 'PAYMENT';
        for (const p of dataset.payments) {
          const mappedInvoiceId = invoiceIdMap.get(p.invoiceId)!;

          let existingPayment: any = null;
          if (p.transactionCode) {
            existingPayment = await tx.payment.findFirst({
              where: {
                invoiceId: mappedInvoiceId,
                transactionCode: p.transactionCode,
              },
            });
          } else {
            existingPayment = await tx.payment.findFirst({
              where: {
                invoiceId: mappedInvoiceId,
                amount: p.amount,
                note: p.note,
              },
            });
          }

          if (existingPayment) {
            await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                amount: p.amount,
                paymentMethod: p.paymentMethod,
                transactionCode: p.transactionCode,
                note: p.note,
                paidAt: p.paidAt,
              },
            });
          } else {
            await tx.payment.create({
              data: {
                invoiceId: mappedInvoiceId,
                amount: p.amount,
                paymentMethod: p.paymentMethod,
                transactionCode: p.transactionCode,
                note: p.note,
                paidAt: p.paidAt,
              },
            });
          }
        }

        // Giai đoạn 5: Ticket (Ánh xạ residentId, technicianId, roomId thực tế)
        currentStage = 'TICKET';
        for (const t of dataset.tickets) {
          const mappedResidentId = userIdMap.get(t.residentId)!;
          const mappedTechnicianId = t.technicianId ? userIdMap.get(t.technicianId) ?? null : null;
          const mappedRoomId = t.roomId ? roomIdMap.get(t.roomId) ?? null : null;

          const existingTicket = await tx.ticket.findFirst({
            where: {
              residentId: mappedResidentId,
              category: t.category,
              createdAt: t.createdAt,
            },
          });

          if (existingTicket) {
            await tx.ticket.update({
              where: { id: existingTicket.id },
              data: {
                title: t.title,
                description: t.description,
                mediaUrl: t.mediaUrl,
                status: t.status,
                roomId: mappedRoomId,
                technicianId: mappedTechnicianId,
                materials: t.materials,
                completedMediaUrl: t.completedMediaUrl,
                rating: t.rating,
                ratingComment: t.ratingComment,
                isDuplicate: t.isDuplicate,
                updatedAt: t.updatedAt,
              },
            });
          } else {
            await tx.ticket.create({
              data: {
                title: t.title,
                category: t.category,
                description: t.description,
                mediaUrl: t.mediaUrl,
                status: t.status,
                roomId: mappedRoomId,
                residentId: mappedResidentId,
                technicianId: mappedTechnicianId,
                materials: t.materials,
                completedMediaUrl: t.completedMediaUrl,
                rating: t.rating,
                ratingComment: t.ratingComment,
                isDuplicate: t.isDuplicate,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
              },
            });
          }
        }

        // Giai đoạn 6: Feedback (Ánh xạ residentId, roomId thực tế)
        currentStage = 'FEEDBACK';
        for (const f of dataset.feedbacks) {
          const mappedResidentId = userIdMap.get(f.residentId)!;
          const mappedRoomId = f.roomId ? roomIdMap.get(f.roomId) ?? null : null;

          const existingFeedback = await tx.feedback.findFirst({
            where: {
              residentId: mappedResidentId,
              title: f.title,
              createdAt: f.createdAt,
            },
          });

          if (existingFeedback) {
            await tx.feedback.update({
              where: { id: existingFeedback.id },
              data: {
                roomId: mappedRoomId,
                content: f.content,
                reply: f.reply,
                isResolved: f.isResolved,
                repliedAt: f.repliedAt,
                updatedAt: f.updatedAt,
              },
            });
          } else {
            await tx.feedback.create({
              data: {
                residentId: mappedResidentId,
                roomId: mappedRoomId,
                title: f.title,
                content: f.content,
                reply: f.reply,
                isResolved: f.isResolved,
                repliedAt: f.repliedAt,
                createdAt: f.createdAt,
                updatedAt: f.updatedAt,
              },
            });
          }
        }

        // Giai đoạn 7: Notification (Ánh xạ authorId thực tế; targetRoom giữ nguyên chuỗi roomNumber)
        currentStage = 'NOTIFICATION';
        for (const n of dataset.notifications) {
          const mappedAuthorId = n.authorId ? userIdMap.get(n.authorId) ?? null : null;

          const existingNotif = await tx.notification.findFirst({
            where: {
              title: n.title,
              createdAt: n.createdAt,
            },
          });

          if (existingNotif) {
            await tx.notification.update({
              where: { id: existingNotif.id },
              data: {
                content: n.content,
                targetRoom: n.targetRoom,
                authorId: mappedAuthorId,
              },
            });
          } else {
            await tx.notification.create({
              data: {
                title: n.title,
                content: n.content,
                targetRoom: n.targetRoom,
                authorId: mappedAuthorId,
                createdAt: n.createdAt,
              },
            });
          }
        }

        // Giai đoạn 8: MediaAsset (Bảo toàn Zero-Asset: 0 record)
        currentStage = 'MEDIA_ASSET';
        if (dataset.mediaAssets.length > 0) {
          throw new Error('Vi phạm chính sách Zero-Asset: Tuyệt đối không tạo bản ghi MediaAsset giả mạo vào database.');
        }
      },
      { timeout: 60000, maxWait: 10000 }
    );
  } catch (err: any) {
    logger(`[Seed Error] Ghi dữ liệu thất bại tại giai đoạn [${currentStage}]: ${err.message}`);
    throw err;
  } finally {
    if (!options.skipPrismaDisconnect && typeof client.$disconnect === 'function') {
      await client.$disconnect();
    }
  }

  const durationMs = Date.now() - startTime;
  logger(`[Seed Success] Hoàn tất nạp dataset thành công trong ${durationMs}ms.`);

  return {
    success: true,
    counts: {
      rooms: dataset.rooms.length,
      users: dataset.users.length,
      invoices: dataset.invoices.length,
      payments: dataset.payments.length,
      tickets: dataset.tickets.length,
      feedbacks: dataset.feedbacks.length,
      notifications: dataset.notifications.length,
      mediaAssets: dataset.mediaAssets.length,
    },
    durationMs,
  };
}

/**
 * Lấy kế hoạch tiến trình nạp dữ liệu (Tương thích Milestone 2)
 */
export function getSeedPipelinePlan(): SeedPipelineSummary {
  assertSafeDatabaseEnvironment();

  return {
    status: 'READY',
    milestone: 'Milestone 9 - Seed Orchestration Complete',
    config: DATASET_CONFIG,
  };
}

// Thực thi CLI trực tiếp khi được gọi bằng `npx ts-node dataset/seed/index.ts`
if (require.main === module) {
  console.log('======================================================');
  console.log('🚀  KHỞI ĐỘNG TIẾN TRÌNH SEED DATASET (MILESTONE 9)');
  console.log('======================================================');
  executeSeed()
    .then((result) => {
      console.log('======================================================');
      console.log('🎉  NẠP DATASET THÀNH CÔNG VÀO DATABASE!');
      console.log(`- Room:         ${result.counts.rooms}`);
      console.log(`- User:         ${result.counts.users}`);
      console.log(`- Invoice:      ${result.counts.invoices}`);
      console.log(`- Payment:      ${result.counts.payments}`);
      console.log(`- Ticket:       ${result.counts.tickets}`);
      console.log(`- Feedback:     ${result.counts.feedbacks}`);
      console.log(`- Notification: ${result.counts.notifications}`);
      console.log(`- MediaAsset:   ${result.counts.mediaAssets}`);
      console.log(`- Thời gian:    ${result.durationMs}ms`);
      console.log('======================================================');
    })
    .catch((err) => {
      console.error('======================================================');
      console.error('❌  TIẾN TRÌNH SEED THẤT BẠI!');
      console.error(err.message || err);
      console.error('======================================================');
      process.exit(1);
    });
}
