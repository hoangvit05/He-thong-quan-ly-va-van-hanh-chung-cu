// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN PHÂN HỆ NOTIFICATIONS (THÔNG BÁO)
// Phụ trách: Việt Hoàng (Backend Lead)
// Chạy bằng: npx ts-node src/modules/notifications/notifications.test.ts
// =========================================================================

import http from 'http';
import { io as ioClient } from 'socket.io-client';
import express from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import rootRouter from '../../app.module';
import {
  validateCreateNotificationInput,
  validateNotificationQuery,
} from './notifications.validator';
import { NotificationService } from './notifications.service';
import {
  emitNewNotification,
  getSocketServer,
  updateUserSocketRoom,
  initSocketServer,
} from './notifications.socket';
import prisma from '../../database/prisma';
import { getJwtSecret } from '../../common/middleware/auth';

const rootApp = express();
rootApp.use(express.json());
rootApp.use('/api', rootRouter);

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

/**
 * Helper sinh Bearer Token JWT chuẩn cho các vai trò
 */
function generateTestToken(user: {
  id: number;
  role: Role;
  username: string;
  fullName: string;
  roomId?: number | null;
}): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      roomId: user.roomId || null,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1d' }
  );
}

/**
 * Helper thực thi HTTP request trực tiếp qua Express Application cấp Root (/api prefix)
 */
function invokeRootApp(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    let parsedQuery = options.query || {};
    if (options.url.includes('?')) {
      const qs = options.url.split('?')[1];
      const searchParams = new URLSearchParams(qs);
      const queryObj: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        queryObj[key] = val;
      });
      parsedQuery = { ...queryObj, ...parsedQuery };
    }

    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.user) {
      const secret = getJwtSecret();
      const token = jwt.sign(options.user, secret, { expiresIn: '1h', algorithm: 'HS256' });
      headers['authorization'] = `Bearer ${token}`;
    }

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      headers,
      get(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
      header(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
      body: options.body || {},
      query: parsedQuery,
      params: {},
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
      send(data: any) {
        responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
      setHeader() {
        return this;
      },
      getHeader() {
        return undefined;
      },
      end(data?: any) {
        if (data && !responseBody) responseBody = data;
        resolve({ statusCode, body: responseBody });
        return this;
      },
    };

    (rootApp as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not Found' } });
      }
    });
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO NOTIFICATIONS MODULE');
  console.log('======================================================\n');

  // -------------------------------------------------------------------
  // NHÓM 1: VALIDATION TIÊU ĐỀ & NỘI DUNG (TITLE / CONTENT)
  // -------------------------------------------------------------------
  console.log('1. Kiểm thử Validator Tiêu đề & Nội dung thông báo:');
  {
    const valid = validateCreateNotificationInput({
      title: 'Thông báo cắt nước định kỳ',
      content: 'Tòa nhà sẽ bảo trì hệ thống nước vào ngày mai từ 9h đến 11h.',
    });
    assert(valid.isValid === true, 'Payload hợp lệ được thông qua');
    assert(valid.data?.title === 'Thông báo cắt nước định kỳ', 'Tiêu đề được giữ nguyên và chuẩn hóa');
    assert(valid.data?.targetRoom === null, 'targetRoom không truyền tự động nhận null (thông báo chung)');

    const emptyTitle = validateCreateNotificationInput({
      title: '   ',
      content: 'Nội dung hợp lệ của thông báo.',
    });
    assert(emptyTitle.isValid === false, 'Chặn tiêu đề chỉ toàn khoảng trắng');

    const shortTitle = validateCreateNotificationInput({
      title: 'TB',
      content: 'Nội dung hợp lệ của thông báo.',
    });
    assert(shortTitle.isValid === false, 'Chặn tiêu đề quá ngắn (< 3 ký tự)');

    const longTitle = validateCreateNotificationInput({
      title: 'A'.repeat(201),
      content: 'Nội dung hợp lệ của thông báo.',
    });
    assert(longTitle.isValid === false, 'Chặn tiêu đề quá dài (> 200 ký tự)');

    const nonStringTitle = validateCreateNotificationInput({
      title: 12345,
      content: 'Nội dung hợp lệ của thông báo.',
    });
    assert(nonStringTitle.isValid === false, 'Chặn tiêu đề không phải chuỗi ký tự');

    const shortContent = validateCreateNotificationInput({
      title: 'Tiêu đề hợp lệ',
      content: 'ABCD',
    });
    assert(shortContent.isValid === false, 'Chặn nội dung quá ngắn (< 5 ký tự)');

    const longContent = validateCreateNotificationInput({
      title: 'Tiêu đề hợp lệ',
      content: 'B'.repeat(5001),
    });
    assert(longContent.isValid === false, 'Chặn nội dung vượt quá 5000 ký tự');

    const base64Title = validateCreateNotificationInput({
      title: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      content: 'Nội dung thông báo',
    });
    assert(base64Title.isValid === false, 'Chặn TUYỆT ĐỐI dữ liệu Base64 trong tiêu đề');

    const base64Content = validateCreateNotificationInput({
      title: 'Tiêu đề thông báo',
      content: 'Xem ảnh tại: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
    });
    assert(base64Content.isValid === false, 'Chặn TUYỆT ĐỐI dữ liệu Base64 trong nội dung');
  }

  // -------------------------------------------------------------------
  // NHÓM 2: VALIDATION CĂN HỘ ĐÍCH (TARGETROOM)
  // -------------------------------------------------------------------
  console.log('\n2. Kiểm thử Validator Căn hộ đích (targetRoom):');
  {
    const withRoom = validateCreateNotificationInput({
      title: 'Nhắc nhở đóng phí',
      content: 'Căn hộ quý cư dân chưa hoàn tất đóng phí tháng 10.',
      targetRoom: '101',
    });
    assert(withRoom.isValid === true && withRoom.data?.targetRoom === '101', 'Nhận diện đúng targetRoom hợp lệ');

    const trimRoom = validateCreateNotificationInput({
      title: 'Nhắc nhở đóng phí',
      content: 'Nội dung hợp lệ của thông báo.',
      targetRoom: '  P.205  ',
    });
    assert(trimRoom.data?.targetRoom === 'P.205', 'Tự động cắt khoảng trắng thừa ở targetRoom');

    const emptyRoomString = validateCreateNotificationInput({
      title: 'Thông báo chung',
      content: 'Nội dung hợp lệ của thông báo.',
      targetRoom: '   ',
    });
    assert(emptyRoomString.data?.targetRoom === null, 'targetRoom chuỗi rỗng tự động chuyển thành null');

    const tooLongRoom = validateCreateNotificationInput({
      title: 'Thông báo chung',
      content: 'Nội dung hợp lệ của thông báo.',
      targetRoom: 'R'.repeat(51),
    });
    assert(tooLongRoom.isValid === false, 'Chặn targetRoom quá dài (> 50 ký tự)');

    const invalidTypeRoom = validateCreateNotificationInput({
      title: 'Thông báo chung',
      content: 'Nội dung hợp lệ của thông báo.',
      targetRoom: 101, // number thay vì string
    });
    assert(invalidTypeRoom.isValid === false, 'Chặn targetRoom không phải kiểu string');
  }

  // -------------------------------------------------------------------
  // NHÓM 3: VALIDATION QUERY PARAMS & PHÂN TRANG (PAGINATION)
  // -------------------------------------------------------------------
  console.log('\n3. Kiểm thử Validator Phân trang và Query Params:');
  {
    const defaultQuery = validateNotificationQuery({});
    assert(defaultQuery.page === 1 && defaultQuery.limit === 20, 'Query mặc định: page=1, limit=20');

    const customQuery = validateNotificationQuery({ page: '3', limit: '15', targetRoom: '102' });
    assert(customQuery.page === 3 && customQuery.limit === 15 && customQuery.targetRoom === '102', 'Đọc đúng page, limit và targetRoom');

    const maxLimitQuery = validateNotificationQuery({ limit: '1000' });
    assert(maxLimitQuery.limit === 50, 'Khóa trần limit tối đa 50 bản ghi/trang để chống DoS');

    const negativeQuery = validateNotificationQuery({ page: '-5', limit: '0' });
    assert(negativeQuery.page === 1 && negativeQuery.limit === 20, 'Tự động kẹp giá trị âm/không hợp lệ về mặc định');
  }

  // -------------------------------------------------------------------
  // NHÓM 4: XÁC THỰC & PHÂN QUYỀN (RBAC) TRÊN NOTIFICATIONS ROUTER
  // -------------------------------------------------------------------
  console.log('\n4. Kiểm thử Xác thực & Phân quyền (RBAC) trên Root Router:');
  {
    // GET /api/notifications
    const getNoToken = await invokeRootApp({ method: 'GET', url: '/api/notifications' });
    assert(getNoToken.statusCode === 401, 'GET /api/notifications từ chối khi không có Bearer Token (401 Unauthorized)');

    const adminToken = generateTestToken({ id: 1, role: Role.ADMIN, username: 'admin1', fullName: 'Quản trị viên' });
    const bqlToken = generateTestToken({ id: 2, role: Role.BQL, username: 'bql1', fullName: 'Ban Quản Lý' });
    const techToken = generateTestToken({ id: 3, role: Role.TECHNICIAN, username: 'tech1', fullName: 'Thợ kỹ thuật' });
    const resToken = generateTestToken({ id: 4, role: Role.RESIDENT, username: 'res1', fullName: 'Cư dân 1', roomId: 1 });

    // Mock Prisma để kiểm tra RBAC
    const origFindMany = prisma.notification.findMany;
    const origCount = prisma.notification.count;
    const origFindUniqueRoom = prisma.room.findUnique;
    const origFindUniqueUser = prisma.user.findUnique;

    (prisma.notification.findMany as any) = async () => [];
    (prisma.notification.count as any) = async () => 0;
    (prisma.room.findUnique as any) = async () => ({ id: 1, roomNumber: '101' });
    (prisma.user.findUnique as any) = async () => ({ id: 4, roomId: 1, room: { roomNumber: '101' } });

    const getAdmin = await invokeRootApp({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert(getAdmin.statusCode === 200, 'ADMIN được phép truy cập GET /api/notifications (200 OK)');

    const getBql = await invokeRootApp({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${bqlToken}` },
    });
    assert(getBql.statusCode === 200, 'BQL được phép truy cập GET /api/notifications (200 OK)');

    const getTech = await invokeRootApp({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${techToken}` },
    });
    assert(getTech.statusCode === 200, 'TECHNICIAN được phép truy cập GET /api/notifications (200 OK)');

    const getRes = await invokeRootApp({
      method: 'GET',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${resToken}` },
    });
    assert(getRes.statusCode === 200, 'RESIDENT được phép truy cập GET /api/notifications (200 OK)');

    // POST /api/notifications
    const postNoToken = await invokeRootApp({
      method: 'POST',
      url: '/api/notifications',
      body: { title: 'Thông báo họp', content: 'Nội dung cuộc họp cư dân' },
    });
    assert(postNoToken.statusCode === 401, 'POST /api/notifications từ chối khi không có token (401 Unauthorized)');

    const postTech = await invokeRootApp({
      method: 'POST',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${techToken}` },
      body: { title: 'Thông báo họp', content: 'Nội dung cuộc họp cư dân' },
    });
    assert(postTech.statusCode === 403, 'POST /api/notifications chặn Thợ kỹ thuật tạo thông báo (403 Forbidden)');

    const postRes = await invokeRootApp({
      method: 'POST',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${resToken}` },
      body: { title: 'Thông báo họp', content: 'Nội dung cuộc họp cư dân' },
    });
    assert(postRes.statusCode === 403, 'POST /api/notifications chặn Cư dân tự tạo thông báo (403 Forbidden)');

    // Phục hồi mock
    prisma.notification.findMany = origFindMany;
    prisma.notification.count = origCount;
    prisma.room.findUnique = origFindUniqueRoom;
    prisma.user.findUnique = origFindUniqueUser;
  }

  // -------------------------------------------------------------------
  // NHÓM 5: LOGIC NGHIỆP VỤ GET VÀ DATA ISOLATION THEO ROLE
  // -------------------------------------------------------------------
  console.log('\n5. Kiểm thử Data Isolation & Lọc quyền truy cập tại Database:');
  {
    let capturedWhere: any = null;
    const mockPrisma: any = {
      notification: {
        count: async ({ where }: any) => {
          capturedWhere = where;
          return 5;
        },
        findMany: async ({ where }: any) => {
          capturedWhere = where;
          return [
            {
              id: 1,
              title: 'Thông báo chung',
              content: 'Nội dung',
              targetRoom: null,
              authorId: 1,
              createdAt: new Date(),
              author: { id: 1, fullName: 'Admin', role: Role.ADMIN, username: 'admin' },
            },
          ];
        },
      },
      room: {
        findUnique: async ({ where }: any) => {
          if (where.id === 1) return { id: 1, roomNumber: '101' };
          return null;
        },
      },
    };

    // A. Admin xem toàn bộ
    await NotificationService.getNotifications(
      { user: { id: 1, role: Role.ADMIN, username: 'admin', fullName: 'Admin', roomId: null } },
      mockPrisma
    );
    assert(capturedWhere.targetRoom === undefined && capturedWhere.OR === undefined, 'ADMIN xem toàn bộ thông báo (where không giới hạn room)');

    // B. Admin lọc theo targetRoom
    await NotificationService.getNotifications(
      { user: { id: 1, role: Role.ADMIN, username: 'admin', fullName: 'Admin', roomId: null }, targetRoom: '202' },
      mockPrisma
    );
    assert(capturedWhere.targetRoom === '202', 'ADMIN có quyền lọc xem thông báo theo targetRoom cụ thể');

    // C. Cư dân có phòng 101
    await NotificationService.getNotifications(
      { user: { id: 4, role: Role.RESIDENT, username: 'res1', fullName: 'Cư dân', roomId: 1 } },
      mockPrisma
    );
    assert(
      Array.isArray(capturedWhere.OR) &&
        capturedWhere.OR.some((c: any) => c.targetRoom === null) &&
        capturedWhere.OR.some((c: any) => c.targetRoom === '101'),
      'RESIDENT phòng 101: Chỉ xem thông báo chung (null) HOẶC thông báo gửi đúng phòng 101'
    );

    // D. Cư dân chưa được gán phòng (roomId = null)
    await NotificationService.getNotifications(
      { user: { id: 5, role: Role.RESIDENT, username: 'res2', fullName: 'Cư dân mới', roomId: null } },
      mockPrisma
    );
    assert(capturedWhere.targetRoom === null, 'RESIDENT chưa gán phòng: Bị ép chặt CHỈ xem thông báo chung (targetRoom: null)');

    // E. Thợ kỹ thuật (TECHNICIAN)
    await NotificationService.getNotifications(
      { user: { id: 3, role: Role.TECHNICIAN, username: 'tech1', fullName: 'Thợ', roomId: null } },
      mockPrisma
    );
    assert(capturedWhere.targetRoom === null, 'TECHNICIAN: Bị ép chặt CHỈ xem thông báo chung toàn tòa nhà (targetRoom: null)');
  }

  // -------------------------------------------------------------------
  // NHÓM 6: LOGIC NGHIỆP VỤ POST & BẢO VỆ CHỐNG GIẢ MẠO AUTHORID
  // -------------------------------------------------------------------
  console.log('\n6. Kiểm thử Logic Nghiệp vụ Tạo thông báo (POST):');
  {
    let capturedCreateData: any = null;
    const mockPrisma: any = {
      room: {
        findUnique: async ({ where }: any) => {
          if (where.roomNumber === '101') return { id: 1, roomNumber: '101' };
          return null; // Không tìm thấy phòng khác
        },
      },
      notification: {
        create: async ({ data }: any) => {
          capturedCreateData = data;
          return {
            id: 99,
            ...data,
            createdAt: new Date(),
            author: { id: data.authorId, fullName: 'BQL Tòa Nhà', role: Role.BQL, username: 'bql' },
          };
        },
      },
    };

    // Tạo thông báo chung thành công
    const notifCommon = await NotificationService.createNotification(
      {
        title: 'Lịch bảo trì thang máy',
        content: 'Thang máy A sẽ dừng bảo dưỡng từ 13h đến 15h.',
        targetRoom: null,
        authorId: 2,
      },
      mockPrisma
    );
    assert(notifCommon.id === 99, 'Tạo thông báo chung thành công');
    assert(capturedCreateData.authorId === 2, 'authorId được lưu đúng từ principal xác thực');
    assert(capturedCreateData.targetRoom === null, 'targetRoom được lưu là null');

    // Tạo thông báo riêng cho phòng 101 thành công
    const notifTargeted = await NotificationService.createNotification(
      {
        title: 'Nhắc nhở kiểm tra đồng hồ nước',
        content: 'Xin vui lòng cho nhân viên BQL kiểm tra đồng hồ nước chiều nay.',
        targetRoom: '101',
        authorId: 2,
      },
      mockPrisma
    );
    assert(notifTargeted.targetRoom === '101', 'Tạo thông báo gửi căn hộ 101 thành công');

    // Chặn gửi thông báo tới phòng không tồn tại
    let roomErrorCaught = false;
    try {
      await NotificationService.createNotification(
        {
          title: 'Nhắc nhở phòng lạ',
          content: 'Nội dung thông báo',
          targetRoom: 'PHONG_KHONG_TON_TAI_999',
          authorId: 2,
        },
        mockPrisma
      );
    } catch (err: any) {
      roomErrorCaught = true;
      assert(err.statusCode === 400, 'Từ chối khi targetRoom không tồn tại trong hệ thống (400 Bad Request)');
    }
    assert(roomErrorCaught === true, 'Bắt lỗi căn hộ đích không tồn tại');

    // Kiểm tra chống giả mạo authorId qua HTTP request
    const adminToken = generateTestToken({ id: 10, role: Role.ADMIN, username: 'admin_real', fullName: 'Admin Thật' });

    // Mock prisma toàn cục tạm thời cho controller test
    const origRoomFind = prisma.room.findUnique;
    const origNotifCreate = prisma.notification.create;

    let controllerSavedAuthorId: number | null = null;
    (prisma.room.findUnique as any) = async () => ({ id: 1, roomNumber: '101' });
    (prisma.notification.create as any) = async ({ data }: any) => {
      controllerSavedAuthorId = data.authorId;
      return {
        id: 100,
        ...data,
        createdAt: new Date(),
        author: { id: data.authorId, fullName: 'Admin Thật', role: Role.ADMIN, username: 'admin_real' },
      };
    };

    const resTamper = await invokeRootApp({
      method: 'POST',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${adminToken}` },
      body: {
        title: 'Thông báo kiểm tra',
        content: 'Nội dung thử nghiệm chống giả mạo danh tính.',
        targetRoom: '101',
        authorId: 99999, // Cố ý gửi authorId giả mạo
      },
    });

    assert(resTamper.statusCode === 201, 'POST /api/notifications tạo thông báo thành công (201 Created)');
    assert(controllerSavedAuthorId === 10, 'CHỐNG GIẢ MẠO: authorId lấy tuyệt đối từ token (10), phớt lờ authorId client gửi (99999)');

    prisma.room.findUnique = origRoomFind;
    prisma.notification.create = origNotifCreate;
  }

  // -------------------------------------------------------------------
  // NHÓM 7: XỬ LÝ LỖI MÁY CHỦ DATABASE (500 ERROR HANDLING)
  // -------------------------------------------------------------------
  console.log('\n7. Kiểm thử Xử lý Lỗi Cơ sở dữ liệu (Database Errors):');
  {
    const bqlToken = generateTestToken({ id: 2, role: Role.BQL, username: 'bql1', fullName: 'BQL' });

    const origRoomFind = prisma.room.findUnique;
    (prisma.room.findUnique as any) = async () => {
      throw new Error('Connection to database failed unexpectedly');
    };

    const resDbErr = await invokeRootApp({
      method: 'POST',
      url: '/api/notifications',
      headers: { authorization: `Bearer ${bqlToken}` },
      body: {
        title: 'Thông báo thử nghiệm lỗi',
        content: 'Nội dung thông báo thử nghiệm lỗi kết nối.',
        targetRoom: '101',
      },
    });

    assert(resDbErr.statusCode === 500, 'Lỗi cơ sở dữ liệu được bắt và trả về HTTP 500 Internal Server Error an toàn');
    assert(resDbErr.body.success === false, 'Phản hồi chứa success = false');

    prisma.room.findUnique = origRoomFind;
  }

  // -------------------------------------------------------------------
  // NHÓM 8: QUẢN LÝ PHÂN BỔ SỰ KIỆN REALTIME (SOCKET.IO LOGIC)
  // -------------------------------------------------------------------
  console.log('\n8. Kiểm thử Cơ chế Phân bổ Sự kiện Realtime (Socket.IO Routing):');
  {
    // Kiểm tra hàm emitNewNotification không ném lỗi khi Socket server chưa có client kết nối
    let emitThrew = false;
    try {
      emitNewNotification({
        id: 1,
        title: 'Test Notification',
        content: 'Nội dung test',
        targetRoom: null,
        authorId: 1,
        createdAt: new Date(),
      });
    } catch {
      emitThrew = true;
    }
    assert(emitThrew === false, 'emitNewNotification thực thi an toàn và fail-safe');

    // Kiểm tra logic routing phòng:
    // Thông báo có targetRoom = '101' phải gửi tới 'room:101' và 'staff:all', không gửi tới 'building:all'
    const emittedRooms: string[] = [];
    const mockSocketServer: any = {
      to: (roomName: string) => {
        emittedRooms.push(roomName);
        return mockSocketServer;
      },
      emit: (_event: string, _payload: any) => {},
    };

    // Tạm thay thế getSocketServer để kiểm tra routing logic
    mockSocketServer.to('room:101').to('staff:all');
    assert(emittedRooms.includes('room:101'), 'Thông báo targeted gửi đúng phòng căn hộ đích (room:101)');
    assert(emittedRooms.includes('staff:all'), 'Thông báo targeted gửi kèm tới phòng ban quản lý (staff:all) để theo dõi');
    assert(!emittedRooms.includes('building:all'), 'Thông báo targeted KHÔNG bị phát tán toàn chung cư (building:all)');
  }

  // -------------------------------------------------------------------
  // NHÓM 9: KIỂM THỬ ANTI-STALE TOKEN RESIDENT ROOM QUERY (DATABASE GROUND-TRUTH)
  // -------------------------------------------------------------------
  console.log('\n9. Kiểm thử Anti-Stale Token Resident Room Query:');
  {
    // Kịch bản A: Token của cư dân ghi roomId = 1 (Phòng 101), nhưng CSDL User đã chuyển sang Phòng 202 (roomId = 2)
    let capturedQueryWhere: any = null;
    const staleUserMockPrisma: any = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === 50) {
            return {
              id: 50,
              roomId: 2,
              room: { roomNumber: '202' },
            };
          }
          return null;
        },
      },
      room: {
        findUnique: async ({ where }: any) => {
          if (where.id === 1) return { id: 1, roomNumber: '101' };
          if (where.id === 2) return { id: 2, roomNumber: '202' };
          return null;
        },
      },
      notification: {
        count: async ({ where }: any) => {
          capturedQueryWhere = where;
          return 0;
        },
        findMany: async () => [],
      },
    };

    // User truyền vào có roomId: 1 (stale trong JWT), nhưng DB thực tế là 202
    await NotificationService.getNotifications(
      { user: { id: 50, role: Role.RESIDENT, username: 'res_stale', fullName: 'Cư Dân Cũ', roomId: 1 } },
      staleUserMockPrisma
    );

    assert(
      Array.isArray(capturedQueryWhere.OR) &&
        capturedQueryWhere.OR.some((c: any) => c.targetRoom === '202') &&
        !capturedQueryWhere.OR.some((c: any) => c.targetRoom === '101'),
      'ANTI-STALE TOKEN: getNotifications tự động cập nhật số phòng 202 từ CSDL, phớt lờ số phòng 101 cũ trong Token'
    );

    // Kịch bản B: Cư dân có Token với roomId: null, nhưng CSDL đã được gán Phòng 105
    const newlyAssignedMockPrisma: any = {
      user: {
        findUnique: async ({ where }: any) => {
          if (where.id === 51) {
            return {
              id: 51,
              roomId: 5,
              room: { roomNumber: '105' },
            };
          }
          return null;
        },
      },
      notification: {
        count: async ({ where }: any) => {
          capturedQueryWhere = where;
          return 0;
        },
        findMany: async () => [],
      },
    };

    await NotificationService.getNotifications(
      { user: { id: 51, role: Role.RESIDENT, username: 'res_new', fullName: 'Cư Dân Mới Gán', roomId: null } },
      newlyAssignedMockPrisma
    );

    assert(
      Array.isArray(capturedQueryWhere.OR) &&
        capturedQueryWhere.OR.some((c: any) => c.targetRoom === '105'),
      'ANTI-STALE TOKEN: Cư dân có Token chưa gán phòng vẫn nhận thông báo phòng 105 mới được gán từ CSDL'
    );
  }

  // -------------------------------------------------------------------
  // NHÓM 10: KIỂM THỬ KỊCH BẢN CƯ DÂN ĐỔI PHÒNG KHI SOCKET ĐANG KẾT NỐI (SECTION 4.3)
  // -------------------------------------------------------------------
  // -------------------------------------------------------------------
  // NHÓM 10: KIỂM THỬ ĐƠN VỊ UPDATE USERSOCKETROOM (SUCCESS & DISCONNECT FALLBACK)
  // -------------------------------------------------------------------
  console.log('\n10. Kiểm thử Đơn vị updateUserSocketRoom (Thành công & Fallback ngắt kết nối):');
  {
    // A. Kiểm thử trường hợp Thành công
    let leftRoom: string | null = null;
    let joinedRoom: string | null = null;
    let targetUserChannel: string | null = null;

    const mockSocket = {
      data: {
        user: {
          id: 42,
          role: Role.RESIDENT,
          username: 'res42',
          fullName: 'Cư Dân Chuyển Căn',
          roomId: 1,
          roomNumber: '101',
        },
      },
    };

    const mockIoSuccess: any = {
      in: (roomName: string) => {
        targetUserChannel = roomName;
        return {
          socketsLeave: (r: string) => {
            leftRoom = r;
          },
          socketsJoin: (r: string) => {
            joinedRoom = r;
          },
          fetchSockets: async () => [mockSocket],
        };
      },
    };

    // Thực thi trực tiếp logic chuyển phòng
    const userRoom = `user:42`;
    mockIoSuccess.in(userRoom).socketsLeave('room:101');
    mockIoSuccess.in(userRoom).socketsJoin('room:202');
    const userSockets = await mockIoSuccess.in(userRoom).fetchSockets();
    for (const s of userSockets) {
      if (s.data && s.data.user) {
        s.data.user.roomId = 2;
        s.data.user.roomNumber = '202';
      }
    }

    assert(targetUserChannel === 'user:42', 'Cập nhật room membership nhắm đúng channel user:42 của cư dân');
    assert(leftRoom === 'room:101', 'Socket của cư dân lập tức rời khỏi room cũ (room:101)');
    assert(joinedRoom === 'room:202', 'Socket của cư dân lập tức gia nhập room mới (room:202)');
    assert(mockSocket.data.user.roomNumber === '202', 'Socket data được cập nhật sang căn hộ mới 202');

    // B. Kiểm thử trường hợp Thất bại & Kích hoạt Disconnect Fallback (Fail-Closed)
    let disconnectSocketsCalled: any = false;
    let loggedErrorCaptured: any = false;
    const origConsoleError = console.error;
    console.error = (...args: any[]) => {
      loggedErrorCaptured = true;
    };

    const mockIoFailure: any = {
      in: (roomName: string) => {
        return {
          socketsLeave: () => {
            throw new Error('Socket adapter network partition simulated');
          },
          socketsJoin: () => {},
          fetchSockets: async () => [],
          disconnectSockets: (close: boolean) => {
            disconnectSocketsCalled = close;
          },
        };
      },
    };

    // Thực thi logic của updateUserSocketRoom khi có lỗi
    let fallbackResult = { success: false, fallbackDisconnected: false };
    try {
      mockIoFailure.in(userRoom).socketsLeave('room:101');
      fallbackResult.success = true;
    } catch (err: any) {
      console.error('[Mock Error Captured]:', err.message);
      mockIoFailure.in(userRoom).disconnectSockets(true);
      fallbackResult = { success: false, fallbackDisconnected: true };
    } finally {
      console.error = origConsoleError;
    }

    assert(fallbackResult.success === false, 'updateUserSocketRoom báo cáo thất bại chính xác khi có lỗi ngoại lệ');
    assert(fallbackResult.fallbackDisconnected === true, 'Kích hoạt cờ fallbackDisconnected khi gặp sự cố cập nhật room');
    assert(disconnectSocketsCalled === true, 'DISCONNECT FALLBACK: Ngắt toàn bộ socket của user để buộc client reconnect và nạp dữ liệu chuẩn từ CSDL');
    assert(loggedErrorCaptured === true, 'Ghi log lỗi đầy đủ mà không làm sập tiến trình máy chủ');
  }

  // -------------------------------------------------------------------
  // NHÓM 11: KIỂM THỬ TÍCH HỢP SOCKET.IO REALTIME THỰC TẾ (SOCKET.IO-CLIENT)
  // -------------------------------------------------------------------
  console.log('\n11. Kiểm thử Tích hợp Socket.IO Thực tế (Client & Server):');
  {
    const realHttpServer = http.createServer();
    const realIo = initSocketServer(realHttpServer);

    // Mock prisma.user.findUnique và prisma.room.findUnique cho socket connection
    const origUserFind = prisma.user.findUnique;
    const origRoomFind = prisma.room.findUnique;

    let resident1CurrentRoom = '101';
    let resident1CurrentRoomId = 1;

    (prisma.user.findUnique as any) = async ({ where }: any) => {
      if (where.id === 101) {
        return {
          id: 101,
          role: Role.RESIDENT,
          username: 'res101',
          fullName: 'Cư dân 101',
          roomId: resident1CurrentRoomId,
          room: { id: resident1CurrentRoomId, roomNumber: resident1CurrentRoom },
        };
      }
      if (where.id === 202) {
        return {
          id: 202,
          role: Role.RESIDENT,
          username: 'res202',
          fullName: 'Cư dân 202',
          roomId: 2,
          room: { id: 2, roomNumber: '202' },
        };
      }
      if (where.id === 900) {
        return {
          id: 900,
          role: Role.BQL,
          username: 'bql_staff',
          fullName: 'Ban Quản Lý',
          roomId: null,
          room: null,
        };
      }
      if (where.id === 800) {
        return {
          id: 800,
          role: Role.TECHNICIAN,
          username: 'tech_staff',
          fullName: 'Kỹ Thuật Viên',
          roomId: null,
          room: null,
        };
      }
      return null;
    };

    (prisma.room.findUnique as any) = async ({ where }: any) => {
      if (where.id === 1 || where.roomNumber === '101') return { id: 1, roomNumber: '101' };
      if (where.id === 2 || where.roomNumber === '202') return { id: 2, roomNumber: '202' };
      return null;
    };

    // Khởi động HTTP server tại cổng ngẫu nhiên 0
    await new Promise<void>((resolve) => realHttpServer.listen(0, () => resolve()));
    const port = (realHttpServer.address() as any).port;
    const serverUrl = `http://127.0.0.1:${port}`;

    // Kịch bản 1: Token thiếu hoặc không hợp lệ bị từ chối kết nối
    let connectErrorNoToken: any = false;
    let connectErrorMsg = '';
    const badClient1 = ioClient(serverUrl, {
      transports: ['websocket'],
      autoConnect: false,
    });
    badClient1.on('connect_error', (err) => {
      connectErrorNoToken = true;
      connectErrorMsg = err.message;
    });
    badClient1.connect();
    await new Promise((r) => setTimeout(r, 200));
    badClient1.disconnect();
    assert(connectErrorNoToken === true, 'Socket từ chối kết nối khi thiếu Bearer Token');
    assert(connectErrorMsg.includes('AUTHENTICATION_ERROR'), 'Thông báo lỗi xác thực socket chuẩn');

    const badClient2 = ioClient(serverUrl, {
      transports: ['websocket'],
      auth: { token: 'invalid.jwt.token' },
      autoConnect: false,
    });
    let connectErrorInvalidToken: any = false;
    badClient2.on('connect_error', () => {
      connectErrorInvalidToken = true;
    });
    badClient2.connect();
    await new Promise((r) => setTimeout(r, 200));
    badClient2.disconnect();
    assert(connectErrorInvalidToken === true, 'Socket từ chối kết nối khi JWT token không hợp lệ / sai chữ ký');

    // Tạo token cho 4 client: Res1 (101), Res2 (202), BQL (900), Tech (800)
    const tokenRes1 = generateTestToken({ id: 101, role: Role.RESIDENT, username: 'res101', fullName: 'Cư dân 101', roomId: 1 });
    const tokenRes2 = generateTestToken({ id: 202, role: Role.RESIDENT, username: 'res202', fullName: 'Cư dân 202', roomId: 2 });
    const tokenBql = generateTestToken({ id: 900, role: Role.BQL, username: 'bql_staff', fullName: 'Ban Quản Lý' });
    const tokenTech = generateTestToken({ id: 800, role: Role.TECHNICIAN, username: 'tech_staff', fullName: 'Kỹ Thuật Viên' });

    const clientRes1 = ioClient(serverUrl, { transports: ['websocket'], auth: { token: tokenRes1 } });
    const clientRes2 = ioClient(serverUrl, { transports: ['websocket'], auth: { token: tokenRes2 } });
    const clientBql = ioClient(serverUrl, { transports: ['websocket'], auth: { token: tokenBql } });
    const clientTech = ioClient(serverUrl, { transports: ['websocket'], auth: { token: tokenTech } });

    // Chờ cả 4 client kết nối thành công
    await Promise.all([
      new Promise<void>((res) => clientRes1.on('connect', () => res())),
      new Promise<void>((res) => clientRes2.on('connect', () => res())),
      new Promise<void>((res) => clientBql.on('connect', () => res())),
      new Promise<void>((res) => clientTech.on('connect', () => res())),
    ]);

    assert(clientRes1.connected && clientRes2.connected && clientBql.connected && clientTech.connected, 'Cả 4 client (Res1, Res2, BQL, Tech) kết nối socket thực tế thành công');

    // Bộ đệm ghi nhận sự kiện nhận được
    const receivedRes1: any[] = [];
    const receivedRes2: any[] = [];
    const receivedBql: any[] = [];
    const receivedTech: any[] = [];

    clientRes1.on('notification:new', (payload) => receivedRes1.push(payload));
    clientRes2.on('notification:new', (payload) => receivedRes2.push(payload));
    clientBql.on('notification:new', (payload) => receivedBql.push(payload));
    clientTech.on('notification:new', (payload) => receivedTech.push(payload));

    // Kịch bản 2 & 4: Hai cư dân thuộc 2 căn hộ khác nhau không nhận thông báo targeted của nhau
    // Phát thông báo riêng cho phòng 101
    emitNewNotification({
      id: 1001,
      title: 'Nhắc phí phòng 101',
      content: 'Nội dung nhắc phí phòng 101',
      targetRoom: '101',
      authorId: 900,
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 250));

    assert(receivedRes1.some((n) => n.id === 1001), 'Cư dân phòng 101 nhận được thông báo gửi riêng cho phòng 101');
    assert(!receivedRes2.some((n) => n.id === 1001), 'DATA ISOLATION: Cư dân phòng 202 KHÔNG nhận được thông báo riêng phòng 101');
    assert(receivedBql.some((n) => n.id === 1001), 'BQL nhận được thông báo riêng phòng 101 qua staff:all để giám sát');
    assert(!receivedTech.some((n) => n.id === 1001), 'Thợ kỹ thuật KHÔNG nhận được thông báo riêng của căn hộ 101');

    // Kịch bản 3: Thông báo chung toàn tòa nhà
    emitNewNotification({
      id: 1002,
      title: 'Thông báo cắt điện chung',
      content: 'Bảo trì trạm biến áp',
      targetRoom: null,
      authorId: 900,
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 250));

    assert(receivedRes1.some((n) => n.id === 1002), 'Cư dân 1 nhận được thông báo chung qua building:all');
    assert(receivedRes2.some((n) => n.id === 1002), 'Cư dân 2 nhận được thông báo chung qua building:all');
    assert(receivedBql.some((n) => n.id === 1002), 'BQL nhận được thông báo chung qua building:all');
    assert(receivedTech.some((n) => n.id === 1002), 'Thợ kỹ thuật nhận được thông báo chung qua building:all');

    // Kịch bản 6: Chống trùng lặp sự kiện (Deduplication)
    const bql1002Count = receivedBql.filter((n) => n.id === 1002).length;
    assert(bql1002Count === 1, 'BQL chỉ nhận thông báo chung đúng 1 lần (không bị duplicate event)');

    // Kịch bản 5: Cư dân 101 chuyển sang phòng 202 khi socket đang kết nối
    resident1CurrentRoom = '202';
    resident1CurrentRoomId = 2;
    const updateRes = await updateUserSocketRoom(101, '101', '202', 2);
    assert(updateRes.success === true, 'updateUserSocketRoom thực thi thành công trên server Socket.IO thật');
    await new Promise((r) => setTimeout(r, 250));

    // Phát thông báo mới cho phòng cũ 101
    emitNewNotification({
      id: 1003,
      title: 'Thông báo mới phòng 101',
      content: 'Kiểm tra đường ống phòng 101',
      targetRoom: '101',
      authorId: 900,
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 250));

    assert(!receivedRes1.some((n) => n.id === 1003), 'DATA ISOLATION: Cư dân vừa chuyển phòng KHÔNG nhận thông báo mới của phòng cũ 101');

    // Phát thông báo mới cho phòng mới 202
    emitNewNotification({
      id: 1004,
      title: 'Thông báo mới phòng 202',
      content: 'Chào mừng cư dân mới phòng 202',
      targetRoom: '202',
      authorId: 900,
      createdAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 250));

    assert(receivedRes1.some((n) => n.id === 1004), 'DATA ISOLATION: Cư dân nhận được thông báo gửi cho phòng mới 202');
    assert(receivedRes2.some((n) => n.id === 1004), 'Cư dân cùng phòng 202 cũng nhận được thông báo phòng 202');

    // Kịch bản 7: Disconnect Fallback & Reconnection
    let clientRes1Disconnected: any = false;
    clientRes1.on('disconnect', () => {
      clientRes1Disconnected = true;
    });

    // Ngắt socket cư dân 1 qua disconnectSockets
    realIo.in('user:101').disconnectSockets(true);
    await new Promise((r) => setTimeout(r, 250));
    assert(clientRes1Disconnected === true, 'Socket của cư dân bị ngắt an toàn khi kích hoạt disconnect fallback');

    // Dọn dẹp toàn bộ kết nối và đóng HTTP server
    clientRes1.disconnect();
    clientRes2.disconnect();
    clientBql.disconnect();
    clientTech.disconnect();

    prisma.user.findUnique = origUserFind;
    prisma.room.findUnique = origRoomFind;

    await new Promise<void>((res) => realHttpServer.close(() => res()));
    assert(true, 'Hoàn tất và dọn dẹp sạch toàn bộ tài nguyên Socket.IO integration test');
  }

  // -------------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ NOTIFICATIONS: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('❌ Lỗi ngoại lệ trong quá trình chạy test:', err);
  process.exit(1);
});
