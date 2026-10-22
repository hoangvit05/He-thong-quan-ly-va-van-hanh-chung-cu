// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN PHÂN HỆ USERS & RESIDENTS
// Phụ trách: Việt Hoàng (Backend Lead)
// Chạy bằng: npx ts-node src/modules/users/users.test.ts
// =========================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { Role, RoomStatus } from '@prisma/client';
import adminUsersRouter, { residentsRouter } from './users.controller';
import rootRouter from '../../app.module';
import {
  validateAdminUsersQuery,
  validateCreateStaffInput,
  validateResidentsQuery,
  validateUserIdParam,
  validateAssignRoomInput,
} from './users.validator';
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
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

/**
 * Helper thực thi HTTP request qua Admin Users Router
 */
function invokeAdminUsersRouter(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
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

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/admin/users${options.url === '/' ? '' : options.url}`,
      headers: options.headers || {},
      user: options.user,
      body: options.body || {},
      query: parsedQuery,
      params: options.params || {},
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
    };

    (adminUsersRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

/**
 * Helper thực thi HTTP request qua Residents Router
 */
function invokeResidentsRouter(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
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

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/apartments/residents${options.url === '/' ? '' : options.url}`,
      headers: options.headers || {},
      user: options.user,
      body: options.body || {},
      query: parsedQuery,
      params: options.params || {},
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
    };

    (residentsRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO USERS MODULE');
console.log('======================================================\n');

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ VALIDATOR CÁC ĐẦU VÀO CỦA PHÂN HỆ USERS
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Users Validator (Đầu vào truy vấn và Payload):');

  // 1.1 validateAdminUsersQuery
  const v1 = validateAdminUsersQuery({});
  assert(v1.isValid && v1.parsed?.page === 1 && v1.parsed?.limit === 20, 'Admin query mặc định: page=1, limit=20');

  const v2 = validateAdminUsersQuery({ role: 'TECHNICIAN', page: '2', limit: '50', search: ' thợ ' });
  assert(
    v2.isValid && v2.parsed?.role === Role.TECHNICIAN && v2.parsed?.page === 2 && v2.parsed?.limit === 50 && v2.parsed?.search === 'thợ',
    'Admin query hợp lệ: nhận đúng role TECHNICIAN, page 2, limit 50, search trim'
  );

  const v3 = validateAdminUsersQuery({ role: 'SUPER_HERO' });
  assert(!v3.isValid && v3.errors.length > 0, 'Chặn role không tồn tại trong enum Prisma');

  const v4 = validateAdminUsersQuery({ page: '-5', limit: '999' });
  assert(!v4.isValid && v4.errors.length === 2, 'Chặn page âm và limit vượt quá 100');

  // 1.2 validateCreateStaffInput
  const s1 = validateCreateStaffInput({
    username: 'bql_hoa',
    password: 'Password123',
    fullName: 'Nguyễn Thị Hoa',
    role: 'BQL',
    phone: '0912345678',
    email: 'hoa@building.vn',
  });
  assert(s1.isValid && s1.parsed?.role === Role.BQL, 'Chấp nhận payload tạo BQL hợp lệ');

  const s2 = validateCreateStaffInput({
    username: 'tech_dung',
    password: 'Password123',
    fullName: 'Trần Văn Dũng',
    role: 'TECHNICIAN',
  });
  assert(s2.isValid && s2.parsed?.role === Role.TECHNICIAN, 'Chấp nhận payload tạo TECHNICIAN hợp lệ không có phone/email');

  const s3 = validateCreateStaffInput({
    username: 'admin_hacker',
    password: 'Password123',
    fullName: 'Hacker',
    role: 'ADMIN', // BỊ CẤM
  });
  assert(!s3.isValid, 'Chặn tuyệt đối tự phong role ADMIN khi tạo nhân viên');

  const s4 = validateCreateStaffInput({
    username: 'resident_new',
    password: 'Password123',
    fullName: 'Cư Dân',
    role: 'RESIDENT', // BỊ CẤM
  });
  assert(!s4.isValid, 'Chặn tuyệt đối tạo role RESIDENT qua API nhân viên');

  const s5 = validateCreateStaffInput({
    username: 'ab', // < 3 ký tự
    password: '123', // < 6 ký tự
    fullName: '',
  });
  assert(!s5.isValid && s5.errors.length >= 3, 'Chặn username ngắn, password yếu, thiếu fullName');

  const s6 = validateCreateStaffInput({
    username: 'user@bad#name',
    password: 'ValidPassword123',
    fullName: 'Test User',
    role: 'BQL',
  });
  assert(!s6.isValid, 'Chặn username chứa ký tự đặc biệt ngoài chữ số và gạch dưới');

  const s7 = validateCreateStaffInput({
    username: 'test_user',
    password: 'ValidPassword123',
    fullName: 'Test User',
    role: 'BQL',
    email: 'not-an-email',
  });
  assert(!s7.isValid, 'Chặn email sai định dạng');

  // 1.3 validateResidentsQuery
  const rq1 = validateResidentsQuery({ roomId: '101', isApproved: 'true', page: '1', limit: '10' });
  assert(rq1.isValid && rq1.parsed?.roomId === 101 && rq1.parsed?.isApproved === true, 'Residents query hợp lệ: roomId=101, isApproved=true');

  const rq2 = validateResidentsQuery({ isApproved: 'invalid_boolean' });
  assert(!rq2.isValid, 'Chặn giá trị isApproved không phải boolean');

  const rq3 = validateResidentsQuery({ roomId: '-1' });
  assert(!rq3.isValid, 'Chặn roomId là số âm');

  // 1.4 validateUserIdParam
  assert(validateUserIdParam('123').isValid && validateUserIdParam('123').userId === 123, 'Param ID hợp lệ');
  assert(!validateUserIdParam('abc').isValid, 'Chặn Param ID là chữ');
  assert(!validateUserIdParam('-5').isValid, 'Chặn Param ID là số âm');
  assert(!validateUserIdParam('').isValid, 'Chặn Param ID rỗng');

  // 1.5 validateAssignRoomInput
  const ar1 = validateAssignRoomInput({ roomId: 101 });
  assert(ar1.isValid && ar1.roomId === 101, 'Assign room input hợp lệ với số nguyên dương');

  const ar2 = validateAssignRoomInput({ roomId: '102' });
  assert(ar2.isValid && ar2.roomId === 102, 'Assign room input chấp nhận chuỗi số nguyên dương');

  const ar3 = validateAssignRoomInput({ roomId: -5 });
  assert(!ar3.isValid, 'Chặn roomId âm khi gán phòng');

  const ar4 = validateAssignRoomInput({ roomId: 0 });
  assert(!ar4.isValid, 'Chặn roomId bằng 0 khi gán phòng');

  const ar5 = validateAssignRoomInput({});
  assert(!ar5.isValid, 'Chặn gán phòng khi thiếu trường roomId');

  const ar6 = validateAssignRoomInput({ roomId: 'abc' });
  assert(!ar6.isValid, 'Chặn gán phòng khi roomId không phải là số');

  // -------------------------------------------------------------------------
  // 2. MOCK PRISMA DATA CHO INTEGRATION EXPRESS ROUTER TESTS
  // -------------------------------------------------------------------------
  const originalFindMany = prisma.user.findMany;
  const originalCount = prisma.user.count;
  const originalCreate = prisma.user.create;
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalRoomFindUnique = prisma.room.findUnique;
  const originalRoomUpdate = prisma.room.update;
  const originalTransaction = (prisma as any).$transaction;
  const originalQueryRaw = (prisma as any).$queryRaw;

  const mockUsersList = [
    {
      id: 1,
      username: 'admin',
      fullName: 'Quản Trị Viên',
      phone: '0901112222',
      email: 'admin@building.vn',
      role: Role.ADMIN,
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-10-01'),
      room: null,
    },
    {
      id: 2,
      username: 'bql_01',
      fullName: 'Ban Quản Lý 01',
      phone: '0903334444',
      email: 'bql01@building.vn',
      role: Role.BQL,
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-10-02'),
      room: null,
    },
    {
      id: 3,
      username: 'tech_01',
      fullName: 'Thợ Điện Nước',
      phone: '0905556666',
      email: 'tech01@building.vn',
      role: Role.TECHNICIAN,
      roomId: null,
      isApproved: true,
      createdAt: new Date('2026-10-03'),
      room: null,
    },
  ];

  const mockResidentsList = [
    {
      id: 10,
      username: 'resident_101',
      fullName: 'Nguyễn Cư Dân 101',
      phone: '0988111222',
      email: 'cudan101@building.vn',
      role: Role.RESIDENT,
      roomId: 1,
      isApproved: true,
      createdAt: new Date('2026-10-05'),
      room: { id: 1, roomNumber: '101', floor: 1, area: 75.0, status: RoomStatus.OCCUPIED },
    },
    {
      id: 11,
      username: 'resident_pending',
      fullName: 'Trần Cư Dân Mới',
      phone: '0988333444',
      email: 'newbie@building.vn',
      role: Role.RESIDENT,
      roomId: 2,
      isApproved: false,
      createdAt: new Date('2026-10-10'),
      room: { id: 2, roomNumber: '102', floor: 1, area: 68.5, status: RoomStatus.VACANT },
    },
    {
      id: 12,
      username: 'resident_no_room',
      fullName: 'Lê Cư Dân Chưa Phòng',
      phone: '0988555666',
      email: 'noroom@building.vn',
      role: Role.RESIDENT,
      roomId: null,
      isApproved: false,
      createdAt: new Date('2026-10-12'),
      room: null,
    },
    {
      id: 13,
      username: 'resident_maint',
      fullName: 'Vũ Cư Dân Phòng Bảo Trì',
      phone: '0988777888',
      email: 'maint@building.vn',
      role: Role.RESIDENT,
      roomId: 3,
      isApproved: false,
      createdAt: new Date('2026-10-15'),
      room: { id: 3, roomNumber: '103', floor: 1, area: 60.0, status: RoomStatus.MAINTENANCE },
    },
  ];

  try {
    (prisma as any).$queryRaw = async () => [];

    // Stub Prisma $transaction
    (prisma as any).$transaction = async (input: any) => {
      if (typeof input === 'function') {
        return input(prisma);
      }
      return Promise.all(input);
    };

    // Stub Prisma User queries
    (prisma.user as any).count = async (args: any) => {
      if (args?.where?.roomId !== undefined) {
        let count = mockResidentsList.filter((r) => r.roomId === args.where.roomId);
        if (args.where.role) count = count.filter((r) => r.role === args.where.role);
        if (args.where.isApproved !== undefined) count = count.filter((r) => r.isApproved === args.where.isApproved);
        if (args.where.NOT?.id) count = count.filter((r) => r.id !== args.where.NOT.id);
        return count.length;
      }
      const role = args?.where?.role;
      if (role === Role.RESIDENT) return mockResidentsList.length;
      if (role === Role.TECHNICIAN) return 1;
      return mockUsersList.length;
    };

    (prisma.user as any).findMany = async (args: any) => {
      const role = args?.where?.role;
      if (role === Role.RESIDENT) {
        let list = [...mockResidentsList];
        if (args?.where?.isApproved !== undefined) {
          list = list.filter((r) => r.isApproved === args.where.isApproved);
        }
        if (args?.where?.roomId !== undefined) {
          list = list.filter((r) => r.roomId === args.where.roomId);
        }
        return list;
      }
      if (role === Role.TECHNICIAN) {
        return mockUsersList.filter((u) => u.role === Role.TECHNICIAN);
      }
      return mockUsersList;
    };

    (prisma.user as any).create = async (args: any) => {
      const { username, password, fullName, role, phone, email, isApproved, roomId } = args.data;

      // Giả lập lỗi P2002 nếu username hoặc email bị trùng
      if (username === 'duplicate_user') {
        const error: any = new Error('Unique constraint failed on the fields: (`username`)');
        error.code = 'P2002';
        error.meta = { target: ['username'] };
        throw error;
      }
      if (email === 'duplicate@building.vn') {
        const error: any = new Error('Unique constraint failed on the fields: (`email`)');
        error.code = 'P2002';
        error.meta = { target: ['email'] };
        throw error;
      }

      return {
        id: 99,
        username,
        fullName,
        role,
        phone: phone || null,
        email: email || null,
        isApproved,
        createdAt: new Date(),
      };
    };

    (prisma.user as any).findUnique = async (args: any) => {
      const id = args?.where?.id;
      if (id === 1) return mockUsersList[0];
      if (id === 10) return mockResidentsList[0];
      if (id === 11) return mockResidentsList[1];
      if (id === 12) return mockResidentsList[2];
      if (id === 13) return mockResidentsList[3];
      return null;
    };

    (prisma.user as any).update = async (args: any) => {
      const id = args?.where?.id;
      const targetResident = mockResidentsList.find((r) => r.id === id);
      if (targetResident) {
        return {
          ...targetResident,
          ...args.data,
        };
      }
      throw new Error('User not found for update');
    };

    (prisma.room as any).findUnique = async (args: any) => {
      if (args?.where?.id === 1) return { id: 1, roomNumber: '101', floor: 1, area: 75.0, status: RoomStatus.OCCUPIED };
      if (args?.where?.id === 2) return { id: 2, roomNumber: '102', floor: 1, area: 68.5, status: RoomStatus.VACANT };
      if (args?.where?.id === 3) return { id: 3, roomNumber: '103', floor: 1, area: 60.0, status: RoomStatus.MAINTENANCE };
      return null;
    };

    (prisma.room as any).update = async (args: any) => {
      return {
        id: args?.where?.id,
        ...args?.data,
      };
    };

    // -------------------------------------------------------------------------
    // 3. KIỂM THỬ XÁC THỰC & PHÂN QUYỀN RBAC (EXPRESS ROUTER INTEGRATION)
    // -------------------------------------------------------------------------
    console.log('\n2. Kiểm thử Xác thực & Phân quyền (RBAC) trên Router:');

    // 3.1 GET /api/admin/users
    const unauthGetAdmin = await invokeAdminUsersRouter({ method: 'GET', url: '/' });
    assert(unauthGetAdmin.statusCode === 401, 'GET /api/admin/users từ chối khi chưa đăng nhập (401 Unauthorized)');

    const techGetAdmin = await invokeAdminUsersRouter({
      method: 'GET',
      url: '/',
      user: { id: 3, role: Role.TECHNICIAN },
    });
    assert(techGetAdmin.statusCode === 403, 'GET /api/admin/users chặn Thợ kỹ thuật (403 Forbidden)');

    const residentGetAdmin = await invokeAdminUsersRouter({
      method: 'GET',
      url: '/',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(residentGetAdmin.statusCode === 403, 'GET /api/admin/users chặn Cư dân (403 Forbidden)');

    // 3.2 POST /api/admin/users
    const bqlCreateStaff = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 2, role: Role.BQL },
      body: { username: 'tech_new', password: 'Password123', fullName: 'Thợ Mới', role: 'TECHNICIAN' },
    });
    assert(bqlCreateStaff.statusCode === 403, 'POST /api/admin/users chặn BQL tự tạo tài khoản (403 Forbidden)');

    const residentCreateStaff = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 10, role: Role.RESIDENT },
      body: { username: 'tech_new', password: 'Password123', fullName: 'Thợ Mới', role: 'TECHNICIAN' },
    });
    assert(residentCreateStaff.statusCode === 403, 'POST /api/admin/users chặn Cư dân gọi (403 Forbidden)');

    // 3.3 GET /api/apartments/residents
    const unauthGetResidents = await invokeResidentsRouter({ method: 'GET', url: '/' });
    assert(unauthGetResidents.statusCode === 401, 'GET /api/apartments/residents từ chối khi chưa đăng nhập (401 Unauthorized)');

    const residentGetResidents = await invokeResidentsRouter({
      method: 'GET',
      url: '/',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(residentGetResidents.statusCode === 403, 'GET /api/apartments/residents chặn Cư dân xem danh sách cư dân khác (403 Forbidden)');

    const techGetResidents = await invokeResidentsRouter({
      method: 'GET',
      url: '/',
      user: { id: 3, role: Role.TECHNICIAN },
    });
    assert(techGetResidents.statusCode === 403, 'GET /api/apartments/residents chặn Thợ kỹ thuật (403 Forbidden)');

    // -------------------------------------------------------------------------
    // 4. KIỂM THỬ NGHIỆP VỤ GET /api/admin/users
    // -------------------------------------------------------------------------
    console.log('\n3. Kiểm thử Nghiệp vụ GET /api/admin/users:');

    // Admin xem danh sách
    const adminGetRes = await invokeAdminUsersRouter({
      method: 'GET',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(adminGetRes.statusCode === 200, 'Admin lấy danh sách tài khoản nội bộ thành công (200 OK)');
    assert(Array.isArray(adminGetRes.body?.data), 'Response data là một mảng danh sách');
    assert(Boolean(adminGetRes.body?.pagination), 'Response có trường phân trang pagination');
    assert(
      adminGetRes.body?.data.every((u: any) => u.password === undefined),
      'BẢO MẬT: Tuyệt đối KHÔNG chứa password hoặc password hash trong danh sách users'
    );

    // BQL gọi GET /api/admin/users bị giới hạn chỉ thấy TECHNICIAN
    const bqlGetRes = await invokeAdminUsersRouter({
      method: 'GET',
      url: '/?role=ADMIN', // BQL cố tình yêu cầu xem ADMIN
      user: { id: 2, role: Role.BQL },
    });
    assert(bqlGetRes.statusCode === 200, 'BQL truy cập GET /api/admin/users thành công (200 OK)');
    assert(
      bqlGetRes.body?.data.every((u: any) => u.role === Role.TECHNICIAN),
      'LEAST PRIVILEGE: BQL bị ép buộc chặt chẽ chỉ xem danh sách TECHNICIAN, phớt lờ query role=ADMIN'
    );

    // -------------------------------------------------------------------------
    // 5. KIỂM THỬ NGHIỆP VỤ POST /api/admin/users (TẠO TÀI KHOẢN NHÂN VIÊN)
    // -------------------------------------------------------------------------
    console.log('\n4. Kiểm thử Nghiệp vụ POST /api/admin/users (Admin tạo nhân viên):');

    // 5.1 Admin tạo BQL thành công
    const createBqlRes = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'bql_minh',
        password: 'Password123@',
        fullName: 'Lê Văn Minh',
        role: 'BQL',
        phone: '0912111333',
        email: 'minh@building.vn',
      },
    });
    assert(createBqlRes.statusCode === 201, 'Admin tạo tài khoản BQL thành công (201 Created)');
    assert(createBqlRes.body?.data?.username === 'bql_minh', 'Trả đúng thông tin username nhân viên mới');
    assert(createBqlRes.body?.data?.isApproved === true, 'Nhân viên do Admin tạo được kích hoạt isApproved=true ngay');
    assert(createBqlRes.body?.data?.password === undefined, 'BẢO MẬT: Response tạo nhân viên KHÔNG chứa password');

    // 5.2 Admin tạo Technician thành công
    const createTechRes = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'tech_tuan',
        password: 'Password123@',
        fullName: 'Phạm Văn Tuấn',
        role: 'TECHNICIAN',
      },
    });
    assert(createTechRes.statusCode === 201, 'Admin tạo tài khoản Thợ kỹ thuật thành công (201 Created)');
    assert(createTechRes.body?.data?.role === Role.TECHNICIAN, 'Đúng vai trò TECHNICIAN');

    // 5.3 Chặn tự cấp role ADMIN
    const createAdminForbidden = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'admin_extra',
        password: 'Password123@',
        fullName: 'Admin Phụ',
        role: 'ADMIN',
      },
    });
    assert(createAdminForbidden.statusCode === 400, 'Từ chối tạo tài khoản với role ADMIN (400 Bad Request)');

    // 5.4 Chặn tự cấp role RESIDENT
    const createResidentForbidden = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'res_extra',
        password: 'Password123@',
        fullName: 'Cư Dân Nhầm',
        role: 'RESIDENT',
      },
    });
    assert(createResidentForbidden.statusCode === 400, 'Từ chối tạo tài khoản với role RESIDENT (400 Bad Request)');

    // 5.5 Bắt lỗi trùng lặp username (409 Conflict)
    const duplicateUserRes = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'duplicate_user',
        password: 'Password123@',
        fullName: 'Người Dùng Trùng',
        role: 'BQL',
      },
    });
    assert(duplicateUserRes.statusCode === 409, 'Bắt lỗi Prisma P2002 username trùng -> Trả về 409 Conflict an toàn');
    assert(duplicateUserRes.body?.message?.includes('Tên đăng nhập đã tồn tại'), 'Thông báo lỗi trùng username rõ ràng');

    // 5.6 Bắt lỗi trùng lặp email (409 Conflict)
    const duplicateEmailRes = await invokeAdminUsersRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: {
        username: 'new_unique_user',
        password: 'Password123@',
        fullName: 'Người Dùng Trùng Email',
        role: 'BQL',
        email: 'duplicate@building.vn',
      },
    });
    assert(duplicateEmailRes.statusCode === 409, 'Bắt lỗi Prisma P2002 email trùng -> Trả về 409 Conflict an toàn');

    // -------------------------------------------------------------------------
    // 6. KIỂM THỬ NGHIỆP VỤ GET /api/apartments/residents
    // -------------------------------------------------------------------------
    console.log('\n5. Kiểm thử Nghiệp vụ GET /api/apartments/residents (Danh sách cư dân):');

    // 6.1 BQL xem danh sách cư dân
    const bqlResidentsRes = await invokeResidentsRouter({
      method: 'GET',
      url: '/',
      user: { id: 2, role: Role.BQL },
    });
    assert(bqlResidentsRes.statusCode === 200, 'BQL lấy danh sách cư dân thành công (200 OK)');
    assert(
      bqlResidentsRes.body?.data.every((r: any) => r.role === Role.RESIDENT),
      'TÁCH BẠCH ROUTER: Endpoint /apartments/residents CHỈ trả về tài khoản RESIDENT'
    );
    assert(
      bqlResidentsRes.body?.data.every((r: any) => r.password === undefined),
      'BẢO MẬT: Tuyệt đối KHÔNG lộ password/hash trong danh sách cư dân'
    );

    // 6.2 Lọc theo phòng không tồn tại -> 404 Not Found
    const notFoundRoomRes = await invokeResidentsRouter({
      method: 'GET',
      url: '/?roomId=9999',
      user: { id: 2, role: Role.BQL },
    });
    assert(notFoundRoomRes.statusCode === 404, 'Tra cứu theo roomId không tồn tại trả về 404 Not Found an toàn');

    // 6.3 Lọc theo trạng thái isApproved=true
    const approvedFilterRes = await invokeResidentsRouter({
      method: 'GET',
      url: '/?isApproved=true',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(approvedFilterRes.statusCode === 200, 'Lọc cư dân đã duyệt thành công (200 OK)');
    assert(
      approvedFilterRes.body?.data.every((r: any) => r.isApproved === true),
      'Bộ lọc isApproved=true lọc chính xác tập dữ liệu'
    );

    // -------------------------------------------------------------------------
    // 7. KIỂM THỬ DUYỆT TÀI KHOẢN CƯ DÂN (CANONICAL & ALIAS)
    // -------------------------------------------------------------------------
    console.log('\n6. Kiểm thử Duyệt cư dân (Canonical & Compatibility Alias):');

    // 7.1 Canonical Endpoint: PUT /api/apartments/residents/:id/approve
    const canonicalApproveRes = await invokeResidentsRouter({
      method: 'PUT',
      url: '/11/approve',
      user: { id: 2, role: Role.BQL },
      params: { id: '11' },
      body: { role: 'ADMIN', password: 'hackedPassword', roomId: 999 }, // Cố ý gửi Mass Assignment
    });
    assert(canonicalApproveRes.statusCode === 200, 'BQL duyệt cư dân mới thành công qua Canonical route (200 OK)');
    assert(canonicalApproveRes.body?.data?.isApproved === true, 'Cư dân được cập nhật isApproved = true');
    assert(canonicalApproveRes.body?.data?.role === Role.RESIDENT, 'CHỐNG MASS ASSIGNMENT: role của user không bị thay đổi');
    assert(canonicalApproveRes.body?.data?.roomId === 2, 'CHỐNG MASS ASSIGNMENT: roomId của user không bị thay đổi');
    assert(canonicalApproveRes.body?.data?.password === undefined, 'BẢO MẬT: Response duyệt không chứa password/hash');

    // 7.2 Compatibility Alias: PUT /api/admin/users/:id/approve
    const aliasApproveRes = await invokeAdminUsersRouter({
      method: 'PUT',
      url: '/11/approve',
      user: { id: 1, role: Role.ADMIN },
      params: { id: '11' },
    });
    assert(aliasApproveRes.statusCode === 200, 'Admin duyệt cư dân qua Compatibility Alias thành công (200 OK)');

    // 7.3 Idempotency: Duyệt lại tài khoản đã được duyệt trước đó
    const idempotentRes = await invokeResidentsRouter({
      method: 'PUT',
      url: '/10/approve', // User 10 đã có isApproved = true
      user: { id: 2, role: Role.BQL },
      params: { id: '10' },
    });
    assert(idempotentRes.statusCode === 200, 'Duyệt lại tài khoản đã duyệt hành xử Idempotent (200 OK)');
    assert(idempotentRes.body?.message?.includes('đã được phê duyệt trước đó'), 'Thông báo rõ ràng tài khoản đã duyệt trước đó');

    // 7.4 Chặn duyệt user không tồn tại -> 404
    const notFoundUserRes = await invokeResidentsRouter({
      method: 'PUT',
      url: '/9999/approve',
      user: { id: 2, role: Role.BQL },
      params: { id: '9999' },
    });
    assert(notFoundUserRes.statusCode === 404, 'Duyệt User không tồn tại trả về 404 Not Found');

    // 7.5 Chặn duyệt tài khoản không phải RESIDENT (ví dụ User 1 là ADMIN) -> 400
    const nonResidentApprove = await invokeResidentsRouter({
      method: 'PUT',
      url: '/1/approve',
      user: { id: 1, role: Role.ADMIN },
      params: { id: '1' },
    });
    assert(nonResidentApprove.statusCode === 400, 'Từ chối duyệt tài khoản không có vai trò RESIDENT (400 Bad Request)');

    // 7.6 Chặn duyệt cư dân chưa gán căn hộ (User 12 có roomId = null) -> 400
    const noRoomApprove = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/approve',
      user: { id: 2, role: Role.BQL },
      params: { id: '12' },
    });
    assert(noRoomApprove.statusCode === 400, 'Từ chối duyệt cư dân chưa được gán vào căn hộ (400 Bad Request)');
    assert(noRoomApprove.body?.message?.includes('chưa được gán vào căn hộ'), 'Thông báo yêu cầu gán phòng trước khi duyệt rõ ràng');

    // 7.7 Chặn Cư dân hoặc Thợ tự duyệt tài khoản
    const residentSelfApprove = await invokeResidentsRouter({
      method: 'PUT',
      url: '/11/approve',
      user: { id: 10, role: Role.RESIDENT },
      params: { id: '11' },
    });
    assert(residentSelfApprove.statusCode === 403, 'Cư dân tự duyệt tài khoản bị chặn tuyệt đối (403 Forbidden)');

    // 7.8 Chặn duyệt cư dân khi căn hộ đang trong trạng thái MAINTENANCE -> 400
    const maintApproveRes = await invokeResidentsRouter({
      method: 'PUT',
      url: '/13/approve',
      user: { id: 2, role: Role.BQL },
      params: { id: '13' },
    });
    assert(maintApproveRes.statusCode === 400, 'Chặn duyệt cư dân khi căn hộ đang bảo trì (400 Bad Request)');
    assert(
      maintApproveRes.body?.message?.includes('bảo trì') || maintApproveRes.body?.message?.includes('MAINTENANCE'),
      'Thông báo rõ ràng phòng đang bảo trì'
    );

    // -------------------------------------------------------------------------
    // 7.B KIỂM THỬ GÁN PHÒNG CHO CƯ DÂN (PUT /api/apartments/residents/:id/room)
    // -------------------------------------------------------------------------
    console.log('\n6.B Kiểm thử Gán phòng cho Cư dân (PUT /api/apartments/residents/:id/room):');

    // 7.B.1 Chưa xác thực -> 401
    const unauthAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      body: { roomId: 2 },
      params: { id: '12' },
    });
    assert(unauthAssign.statusCode === 401, 'Gán phòng: Từ chối khi chưa đăng nhập (401 Unauthorized)');

    // 7.B.2 TECHNICIAN -> 403
    const techAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 3, role: Role.TECHNICIAN },
      body: { roomId: 2 },
      params: { id: '12' },
    });
    assert(techAssign.statusCode === 403, 'Gán phòng: Chặn Thợ kỹ thuật (403 Forbidden)');

    // 7.B.3 RESIDENT -> 403
    const resAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 10, role: Role.RESIDENT },
      body: { roomId: 2 },
      params: { id: '12' },
    });
    assert(resAssign.statusCode === 403, 'Gán phòng: Chặn Cư dân tự gán phòng (403 Forbidden)');

    // 7.B.4 Param ID không hợp lệ -> 400
    const invalidIdAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/abc/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 2 },
      params: { id: 'abc' },
    });
    assert(invalidIdAssign.statusCode === 400, 'Gán phòng: Chặn Param ID là chuỗi chữ (400 Bad Request)');

    // 7.B.5 Payload roomId không hợp lệ -> 400
    const invalidBodyAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: -99 },
      params: { id: '12' },
    });
    assert(invalidBodyAssign.statusCode === 400, 'Gán phòng: Chặn roomId âm (400 Bad Request)');

    // 7.B.6 User không tồn tại -> 404
    const notFoundUserAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/9999/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 2 },
      params: { id: '9999' },
    });
    assert(notFoundUserAssign.statusCode === 404, 'Gán phòng: User không tồn tại trả về 404 Not Found');

    // 7.B.7 User không phải RESIDENT -> 400
    const nonResUserAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/1/room',
      user: { id: 1, role: Role.ADMIN },
      body: { roomId: 2 },
      params: { id: '1' },
    });
    assert(nonResUserAssign.statusCode === 400, 'Gán phòng: Chặn gán phòng cho tài khoản không phải RESIDENT (400 Bad Request)');

    // 7.B.8 Room không tồn tại -> 404
    const notFoundRoomAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 9999 },
      params: { id: '12' },
    });
    assert(notFoundRoomAssign.statusCode === 404, 'Gán phòng: Căn hộ không tồn tại trả về 404 Not Found');

    // 7.B.9 Chặn gán vào phòng MAINTENANCE -> 400
    const maintRoomAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 3 }, // Room 3 đang MAINTENANCE
      params: { id: '12' },
    });
    assert(maintRoomAssign.statusCode === 400, 'Gán phòng: Chặn gán cư dân vào phòng đang bảo trì (400 Bad Request)');

    // 7.B.10 Gán phòng cho cư dân chưa duyệt -> thành công, không tự động duyệt
    const unapprovedAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/12/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 2, isApproved: true, role: 'ADMIN' }, // Cố ý gửi Mass Assignment
      params: { id: '12' },
    });
    assert(unapprovedAssign.statusCode === 200, 'Gán phòng: Gán cho cư dân chưa duyệt thành công (200 OK)');
    assert(unapprovedAssign.body?.data?.roomId === 2, 'Gán phòng: User được cập nhật roomId = 2');
    assert(unapprovedAssign.body?.data?.isApproved === false, 'Gán phòng: KHÔNG tự duyệt cư dân (isApproved vẫn false)');
    assert(unapprovedAssign.body?.data?.role === Role.RESIDENT, 'CHỐNG MASS ASSIGNMENT: role của user không bị thay đổi');

    // 7.B.11 Gán trùng phòng hiện tại -> Idempotent 200 OK
    const sameRoomAssign = await invokeResidentsRouter({
      method: 'PUT',
      url: '/10/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 1 }, // User 10 đã ở phòng 1
      params: { id: '10' },
    });
    assert(sameRoomAssign.statusCode === 200, 'Gán phòng: Gán trùng phòng hiện tại trả về 200 OK Idempotent');

    // 7.B.12 Chuyển phòng cho cư dân đã duyệt -> thành công, đồng bộ trạng thái
    const transferRes = await invokeResidentsRouter({
      method: 'PUT',
      url: '/10/room',
      user: { id: 1, role: Role.ADMIN },
      body: { roomId: 2 },
      params: { id: '10' },
    });
    assert(transferRes.statusCode === 200, 'Gán phòng: Chuyển phòng cư dân đã duyệt thành công (200 OK)');
    assert(transferRes.body?.data?.roomId === 2, 'Gán phòng: Cư dân được chuyển sang roomId = 2');

    // -------------------------------------------------------------------------
    // 8. KIỂM THỬ ROUTER ISOLATION & REGRESSION
    // -------------------------------------------------------------------------
    console.log('\n7. Kiểm thử Phân tách Router (Router Isolation & Regression):');
    assert(
      adminUsersRouter !== residentsRouter,
      'adminUsersRouter và residentsRouter là 2 instance độc lập, giải quyết triệt để lỗi mount trùng'
    );

    // -------------------------------------------------------------------------
    // 9. KIỂM THỬ ROUTE CẤP ỨNG DỤNG / ROOT ROUTER WIRING (/api prefix)
    // -------------------------------------------------------------------------
    console.log('\n8. Kiểm thử Tích hợp Cấp Root Router & Application Wiring (/api prefix):');

    // 8.1 GET /api/admin/users qua Root App
    const rootUnauthAdmin = await invokeRootApp({ method: 'GET', url: '/api/admin/users' });
    assert(
      rootUnauthAdmin.statusCode === 401,
      'Root App: GET /api/admin/users không có Bearer Token nhận HTTP 401 Unauthorized'
    );

    const rootResidentAdmin = await invokeRootApp({
      method: 'GET',
      url: '/api/admin/users',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(
      rootResidentAdmin.statusCode === 403,
      'Root App: GET /api/admin/users với role RESIDENT nhận HTTP 403 Forbidden'
    );

    const rootAdminGetUsers = await invokeRootApp({
      method: 'GET',
      url: '/api/admin/users',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(
      rootAdminGetUsers.statusCode === 200,
      'Root App: GET /api/admin/users với role ADMIN nhận HTTP 200 OK'
    );
    assert(
      Array.isArray(rootAdminGetUsers.body?.data),
      'Root App: GET /api/admin/users trả về mảng danh sách người dùng'
    );
    assert(
      rootAdminGetUsers.body?.pagination?.total !== undefined,
      'Root App: GET /api/admin/users chứa thông tin phân trang'
    );

    const rootBqlGetUsers = await invokeRootApp({
      method: 'GET',
      url: '/api/admin/users',
      user: { id: 2, role: Role.BQL },
    });
    assert(
      rootBqlGetUsers.statusCode === 200,
      'Root App: GET /api/admin/users với role BQL nhận HTTP 200 OK'
    );
    assert(
      Array.isArray(rootBqlGetUsers.body?.data) &&
        rootBqlGetUsers.body?.data.every((u: any) => u.role === Role.TECHNICIAN),
      'Root App: GET /api/admin/users với role BQL chỉ trả về danh sách TECHNICIAN (Least Privilege)'
    );

    // 8.2 POST /api/admin/users qua Root App
    const rootUnauthCreate = await invokeRootApp({
      method: 'POST',
      url: '/api/admin/users',
      body: { username: 'root_user', password: 'Password123!', fullName: 'Root User', role: 'TECHNICIAN' },
    });
    assert(
      rootUnauthCreate.statusCode === 401,
      'Root App: POST /api/admin/users không có Bearer Token nhận HTTP 401 Unauthorized'
    );

    const rootBqlCreate = await invokeRootApp({
      method: 'POST',
      url: '/api/admin/users',
      user: { id: 2, role: Role.BQL },
      body: { username: 'root_user', password: 'Password123!', fullName: 'Root User', role: 'TECHNICIAN' },
    });
    assert(
      rootBqlCreate.statusCode === 403,
      'Root App: POST /api/admin/users với role BQL nhận HTTP 403 Forbidden'
    );

    const rootAdminCreate = await invokeRootApp({
      method: 'POST',
      url: '/api/admin/users',
      user: { id: 1, role: Role.ADMIN },
      body: { username: 'root_tech_01', password: 'Password123!', fullName: 'Kỹ Thuật Viên Mới', role: 'TECHNICIAN' },
    });
    assert(
      rootAdminCreate.statusCode === 201,
      'Root App: POST /api/admin/users với role ADMIN tạo tài khoản thành công (HTTP 201 Created)'
    );
    assert(
      rootAdminCreate.body?.data?.username === 'root_tech_01',
      'Root App: POST /api/admin/users trả về đúng thông tin tài khoản được tạo'
    );

    // 8.3 GET /api/apartments/residents qua Root App
    const rootUnauthResidents = await invokeRootApp({ method: 'GET', url: '/api/apartments/residents' });
    assert(
      rootUnauthResidents.statusCode === 401,
      'Root App: GET /api/apartments/residents không có Bearer Token nhận HTTP 401 Unauthorized'
    );

    const rootTechResidents = await invokeRootApp({
      method: 'GET',
      url: '/api/apartments/residents',
      user: { id: 3, role: Role.TECHNICIAN },
    });
    assert(
      rootTechResidents.statusCode === 403,
      'Root App: GET /api/apartments/residents với role TECHNICIAN nhận HTTP 403 Forbidden'
    );

    const rootBqlResidents = await invokeRootApp({
      method: 'GET',
      url: '/api/apartments/residents',
      user: { id: 2, role: Role.BQL },
    });
    assert(
      rootBqlResidents.statusCode === 200,
      'Root App: GET /api/apartments/residents với role BQL nhận HTTP 200 OK'
    );
    assert(
      Array.isArray(rootBqlResidents.body?.data) &&
        rootBqlResidents.body?.data.every((r: any) => r.role === Role.RESIDENT),
      'Root App: GET /api/apartments/residents trả về đúng danh sách RESIDENT'
    );

    // 8.4 PUT /api/apartments/residents/:id/approve (Canonical Route) qua Root App
    const rootUnauthApprove = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/11/approve',
    });
    assert(
      rootUnauthApprove.statusCode === 401,
      'Root App: PUT /api/apartments/residents/11/approve không có token nhận HTTP 401 Unauthorized'
    );

    const rootResidentApprove = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/11/approve',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(
      rootResidentApprove.statusCode === 403,
      'Root App: PUT /api/apartments/residents/11/approve với role RESIDENT nhận HTTP 403 Forbidden'
    );

    const rootBqlApproveCanonical = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/11/approve',
      user: { id: 2, role: Role.BQL },
    });
    assert(
      rootBqlApproveCanonical.statusCode === 200,
      'Root App (Canonical): PUT /api/apartments/residents/11/approve với BQL nhận HTTP 200 OK'
    );
    assert(
      rootBqlApproveCanonical.body?.data?.isApproved === true,
      'Root App (Canonical): Trả về dữ liệu cư dân đã duyệt isApproved = true'
    );

    // 8.5 PUT /api/admin/users/:id/approve (Compatibility Alias Route) qua Root App
    const rootUnauthAliasApprove = await invokeRootApp({
      method: 'PUT',
      url: '/api/admin/users/11/approve',
    });
    assert(
      rootUnauthAliasApprove.statusCode === 401,
      'Root App: PUT /api/admin/users/11/approve không có token nhận HTTP 401 Unauthorized'
    );

    const rootAdminApproveAlias = await invokeRootApp({
      method: 'PUT',
      url: '/api/admin/users/11/approve',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(
      rootAdminApproveAlias.statusCode === 200,
      'Root App (Alias): PUT /api/admin/users/11/approve với ADMIN nhận HTTP 200 OK'
    );
    assert(
      rootAdminApproveAlias.body?.data?.isApproved === true,
      'Root App (Alias): Duyệt cư dân thành công và có cùng cấu trúc dữ liệu với Canonical route'
    );

    // 8.6 PUT /api/apartments/residents/:id/room qua Root App
    const rootUnauthAssignRoom = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/12/room',
      body: { roomId: 2 },
    });
    assert(
      rootUnauthAssignRoom.statusCode === 401,
      'Root App: PUT /api/apartments/residents/12/room không có token nhận HTTP 401 Unauthorized'
    );

    const rootResidentAssignRoom = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/12/room',
      user: { id: 10, role: Role.RESIDENT },
      body: { roomId: 2 },
    });
    assert(
      rootResidentAssignRoom.statusCode === 403,
      'Root App: PUT /api/apartments/residents/12/room với role RESIDENT nhận HTTP 403 Forbidden'
    );

    const rootBqlAssignRoom = await invokeRootApp({
      method: 'PUT',
      url: '/api/apartments/residents/12/room',
      user: { id: 2, role: Role.BQL },
      body: { roomId: 2 },
    });
    assert(
      rootBqlAssignRoom.statusCode === 200,
      'Root App: PUT /api/apartments/residents/12/room với role BQL nhận HTTP 200 OK'
    );
    assert(
      rootBqlAssignRoom.body?.data?.roomId === 2,
      'Root App: Gán phòng cư dân thành công trả về đúng roomId'
    );

    // 8.7 Non-existent Route
    const rootNotFound = await invokeRootApp({
      method: 'GET',
      url: '/api/admin/users-not-found',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(
      rootNotFound.statusCode === 404,
      'Root App: Route không tồn tại trả về HTTP 404 Not Found'
    );
  } finally {
    // Khôi phục các method gốc của Prisma
    prisma.user.findMany = originalFindMany;
    prisma.user.count = originalCount;
    prisma.user.create = originalCreate;
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    prisma.room.findUnique = originalRoomFindUnique;
    prisma.room.update = originalRoomUpdate;
    (prisma as any).$transaction = originalTransaction;
    (prisma as any).$queryRaw = originalQueryRaw;
  }

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ USERS MODULE: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('❌ Lỗi ngoại lệ trong test suite:', err);
  process.exit(1);
});
