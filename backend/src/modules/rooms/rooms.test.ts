// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN PHÂN HỆ ROOMS (CĂN HỘ)
// Phụ trách: Việt Hoàng (Backend Lead)
// Chạy bằng: npx ts-node src/modules/rooms/rooms.test.ts
// =========================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { Role, RoomStatus } from '@prisma/client';
import roomsRouter from './rooms.controller';
import rootRouter from '../../app.module';
import {
  validateRoomsQuery,
  validateCreateRoomInput,
  validateUpdateRoomInput,
  validateRoomIdParam,
} from './rooms.validator';
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
 * Helper thực thi HTTP request qua Rooms Router
 */
function invokeRoomsRouter(options: {
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

    const headers: Record<string, string> = { ...(options.headers || {}) };
    if (options.user) {
      const secret = getJwtSecret();
      const token = jwt.sign(options.user, secret, { expiresIn: '1h', algorithm: 'HS256' });
      headers['authorization'] = `Bearer ${token}`;
    }

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/rooms${options.url === '/' ? '' : options.url}`,
      headers,
      user: options.user,
      body: options.body || {},
      query: parsedQuery,
      params: options.params || {},
      get(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
      header(headerName: string) {
        return headers[headerName.toLowerCase()] || headers[headerName];
      },
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
    };

    (roomsRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO ROOMS MODULE');
console.log('======================================================\n');

async function runRoomsTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ VALIDATOR CÁC ĐẦU VÀO CỦA PHÂN HỆ ROOMS
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Rooms Validator (Query & Body Payloads):');

  // 1.1 validateRoomsQuery
  const q1 = validateRoomsQuery({});
  assert(q1.isValid && q1.parsed?.page === 1 && q1.parsed?.limit === 20, 'Query mặc định: page=1, limit=20');

  const q2 = validateRoomsQuery({ page: '2', limit: '50', search: ' 101 ', floor: '5', status: 'VACANT' });
  assert(
    q2.isValid &&
      q2.parsed?.page === 2 &&
      q2.parsed?.limit === 50 &&
      q2.parsed?.search === '101' &&
      q2.parsed?.floor === 5 &&
      q2.parsed?.status === RoomStatus.VACANT,
    'Query hợp lệ với search trim, floor số nguyên, status enum'
  );

  const q3 = validateRoomsQuery({ page: '-1', limit: '0' });
  assert(!q3.isValid && q3.errors.length >= 2, 'Chặn page âm và limit <= 0');

  const q4 = validateRoomsQuery({ limit: '200' });
  assert(!q4.isValid, 'Chặn limit vượt trần 100');

  const q5 = validateRoomsQuery({ floor: 'tang_ba' });
  assert(!q5.isValid, 'Chặn floor là chuỗi chữ không phải số');

  const q6 = validateRoomsQuery({ status: 'INVALID_STATUS' });
  assert(!q6.isValid, 'Chặn status không thuộc enum RoomStatus');

  // 1.2 validateCreateRoomInput
  const c1 = validateCreateRoomInput({ roomNumber: ' 101 ', floor: 1, area: 75.5 });
  assert(
    c1.isValid && c1.parsed?.roomNumber === '101' && c1.parsed?.status === RoomStatus.VACANT,
    'Tạo phòng: roomNumber được trim và status mặc định là VACANT'
  );

  const c2 = validateCreateRoomInput({ roomNumber: '102', floor: 1, area: 68.0, status: 'MAINTENANCE' });
  assert(c2.isValid && c2.parsed?.status === RoomStatus.MAINTENANCE, 'Tạo phòng: Cho phép khởi tạo MAINTENANCE');

  const c3 = validateCreateRoomInput({ roomNumber: '103', floor: 1, area: 70.0, status: 'OCCUPIED' });
  assert(!c3.isValid, 'Tạo phòng: Chặn tạo mới ở trạng thái OCCUPIED (yêu cầu nghiệp vụ)');

  const c4 = validateCreateRoomInput({ roomNumber: '   ', floor: 1, area: 70.0 });
  assert(!c4.isValid, 'Tạo phòng: Chặn roomNumber chỉ toàn khoảng trắng');

  const c5 = validateCreateRoomInput({ roomNumber: '104', floor: 1.5, area: 70.0 });
  assert(!c5.isValid, 'Tạo phòng: Chặn floor là số thập phân');

  const c6 = validateCreateRoomInput({ roomNumber: '105', floor: 1, area: 0 });
  assert(!c6.isValid, 'Tạo phòng: Chặn area <= 0');

  const c7 = validateCreateRoomInput({ roomNumber: '106', floor: 1, area: -20 });
  assert(!c7.isValid, 'Tạo phòng: Chặn area là số âm');

  // 1.3 validateUpdateRoomInput
  const u1 = validateUpdateRoomInput({});
  assert(!u1.isValid, 'Cập nhật phòng: Chặn body rỗng không có trường nào để cập nhật');

  const u2 = validateUpdateRoomInput({ roomNumber: ' 101A ', floor: 2, area: 80.0, status: 'MAINTENANCE' });
  assert(
    u2.isValid &&
      u2.parsed?.roomNumber === '101A' &&
      u2.parsed?.floor === 2 &&
      u2.parsed?.area === 80.0 &&
      u2.parsed?.status === RoomStatus.MAINTENANCE,
    'Cập nhật phòng: Chấp nhận các trường hợp lệ'
  );

  const u3 = validateUpdateRoomInput({ id: 999, createdAt: '2026-01-01', users: [] });
  assert(!u3.isValid, 'Cập nhật phòng: Chặn gửi các trường ngoài allowlist (id, createdAt, relations)');

  const u4 = validateUpdateRoomInput({ area: -5 });
  assert(!u4.isValid, 'Cập nhật phòng: Chặn area âm');

  // 1.4 validateRoomIdParam
  assert(validateRoomIdParam('1').isValid && validateRoomIdParam('1').roomId === 1, 'Room ID param hợp lệ');
  assert(!validateRoomIdParam('abc').isValid, 'Chặn Room ID là chuỗi chữ');
  assert(!validateRoomIdParam('-1').isValid, 'Chặn Room ID là số âm');
  assert(!validateRoomIdParam('0').isValid, 'Chặn Room ID bằng 0');
  assert(!validateRoomIdParam('').isValid, 'Chặn Room ID rỗng');

  // -------------------------------------------------------------------------
  // 2. MOCK PRISMA DATA CHO ROOMS CONTROLLER
  // -------------------------------------------------------------------------
  const originalFindMany = prisma.room.findMany;
  const originalCount = prisma.room.count;
  const originalCreate = prisma.room.create;
  const originalFindUnique = prisma.room.findUnique;
  const originalUpdate = prisma.room.update;
  const originalUserCount = prisma.user.count;
  const originalTransaction = (prisma as any).$transaction;
  const originalQueryRaw = (prisma as any).$queryRaw;

  const mockRoomsList = [
    {
      id: 1,
      roomNumber: '101',
      floor: 1,
      area: 75.0,
      status: RoomStatus.OCCUPIED,
      createdAt: new Date('2026-10-01'),
      updatedAt: new Date('2026-10-01'),
      _count: { users: 2 }, // 2 cư dân đã duyệt
    },
    {
      id: 2,
      roomNumber: '102',
      floor: 1,
      area: 68.5,
      status: RoomStatus.VACANT,
      createdAt: new Date('2026-10-02'),
      updatedAt: new Date('2026-10-02'),
      _count: { users: 0 }, // 0 cư dân
    },
    {
      id: 3,
      roomNumber: '103',
      floor: 1,
      area: 60.0,
      status: RoomStatus.MAINTENANCE,
      createdAt: new Date('2026-10-03'),
      updatedAt: new Date('2026-10-03'),
      _count: { users: 1 }, // 1 cư dân trong phòng bảo trì
    },
  ];

  try {
    (prisma as any).$queryRaw = async () => [];

    (prisma as any).$transaction = async (input: any) => {
      if (typeof input === 'function') {
        return input(prisma);
      }
      return Promise.all(input);
    };

    (prisma.room as any).count = async (args: any) => {
      let list = [...mockRoomsList];
      if (args?.where?.floor !== undefined) {
        list = list.filter((r) => r.floor === args.where.floor);
      }
      if (args?.where?.status !== undefined) {
        list = list.filter((r) => r.status === args.where.status);
      }
      return list.length;
    };

    (prisma.room as any).findMany = async (args: any) => {
      let list = [...mockRoomsList];
      if (args?.where?.floor !== undefined) {
        list = list.filter((r) => r.floor === args.where.floor);
      }
      if (args?.where?.status !== undefined) {
        list = list.filter((r) => r.status === args.where.status);
      }
      if (args?.where?.roomNumber?.contains) {
        list = list.filter((r) => r.roomNumber.includes(args.where.roomNumber.contains));
      }
      return list;
    };

    (prisma.room as any).findUnique = async (args: any) => {
      if (args?.where?.id) {
        return mockRoomsList.find((r) => r.id === args.where.id) || null;
      }
      if (args?.where?.roomNumber) {
        return mockRoomsList.find((r) => r.roomNumber === args.where.roomNumber) || null;
      }
      return null;
    };

    (prisma.room as any).create = async (args: any) => {
      const { roomNumber, floor, area, status } = args.data;
      if (roomNumber === 'duplicate_P2002') {
        const error: any = new Error('Unique constraint failed');
        error.code = 'P2002';
        error.meta = { target: ['roomNumber'] };
        throw error;
      }
      if (roomNumber === 'db_error') {
        throw new Error('Database connection failed');
      }
      return {
        id: 99,
        roomNumber,
        floor,
        area,
        status,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    };

    (prisma.room as any).update = async (args: any) => {
      const id = args.where.id;
      const room = mockRoomsList.find((r) => r.id === id);
      if (!room) throw new Error('Room not found');
      return {
        ...room,
        ...args.data,
        updatedAt: new Date(),
      };
    };

    (prisma.user as any).count = async (args: any) => {
      const roomId = args?.where?.roomId;
      if (roomId === 1) return 2;
      if (roomId === 2) return 0;
      if (roomId === 3) return 1;
      return 0;
    };

    // -------------------------------------------------------------------------
    // 3. KIỂM THỬ XÁC THỰC & PHÂN QUYỀN RBAC (ROOMS ROUTER)
    // -------------------------------------------------------------------------
    console.log('\n2. Kiểm thử Xác thực & Phân quyền (RBAC) trên Rooms Router:');

    // 3.1 GET /api/rooms
    const unauthGet = await invokeRoomsRouter({ method: 'GET', url: '/' });
    assert(unauthGet.statusCode === 401, 'GET /api/rooms từ chối khi chưa đăng nhập (401 Unauthorized)');

    const techGet = await invokeRoomsRouter({
      method: 'GET',
      url: '/',
      user: { id: 3, role: Role.TECHNICIAN },
    });
    assert(techGet.statusCode === 403, 'GET /api/rooms chặn Thợ kỹ thuật (403 Forbidden)');

    const residentGet = await invokeRoomsRouter({
      method: 'GET',
      url: '/',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(residentGet.statusCode === 403, 'GET /api/rooms chặn Cư dân (403 Forbidden)');

    const bqlGet = await invokeRoomsRouter({
      method: 'GET',
      url: '/',
      user: { id: 2, role: Role.BQL },
    });
    assert(bqlGet.statusCode === 200, 'GET /api/rooms cho phép BQL (200 OK)');

    const adminGet = await invokeRoomsRouter({
      method: 'GET',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
    });
    assert(adminGet.statusCode === 200, 'GET /api/rooms cho phép ADMIN (200 OK)');

    // 3.2 POST /api/rooms
    const unauthPost = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      body: { roomNumber: '201', floor: 2, area: 80.0 },
    });
    assert(unauthPost.statusCode === 401, 'POST /api/rooms từ chối khi chưa đăng nhập (401 Unauthorized)');

    const techPost = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 3, role: Role.TECHNICIAN },
      body: { roomNumber: '201', floor: 2, area: 80.0 },
    });
    assert(techPost.statusCode === 403, 'POST /api/rooms chặn Thợ kỹ thuật (403 Forbidden)');

    const residentPost = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 10, role: Role.RESIDENT },
      body: { roomNumber: '201', floor: 2, area: 80.0 },
    });
    assert(residentPost.statusCode === 403, 'POST /api/rooms chặn Cư dân (403 Forbidden)');

    // 3.3 PUT /api/rooms/:id
    const unauthPut = await invokeRoomsRouter({
      method: 'PUT',
      url: '/1',
      body: { area: 85.0 },
      params: { id: '1' },
    });
    assert(unauthPut.statusCode === 401, 'PUT /api/rooms/:id từ chối khi chưa đăng nhập (401 Unauthorized)');

    const techPut = await invokeRoomsRouter({
      method: 'PUT',
      url: '/1',
      user: { id: 3, role: Role.TECHNICIAN },
      body: { area: 85.0 },
      params: { id: '1' },
    });
    assert(techPut.statusCode === 403, 'PUT /api/rooms/:id chặn Thợ kỹ thuật (403 Forbidden)');

    const residentPut = await invokeRoomsRouter({
      method: 'PUT',
      url: '/1',
      user: { id: 10, role: Role.RESIDENT },
      body: { area: 85.0 },
      params: { id: '1' },
    });
    assert(residentPut.statusCode === 403, 'PUT /api/rooms/:id chặn Cư dân (403 Forbidden)');

    // -------------------------------------------------------------------------
    // 4. KIỂM THỬ NGHIỆP VỤ GET /api/rooms
    // -------------------------------------------------------------------------
    console.log('\n3. Kiểm thử Nghiệp vụ GET /api/rooms:');

    const listRes = await invokeRoomsRouter({
      method: 'GET',
      url: '/',
      user: { id: 2, role: Role.BQL },
    });
    assert(listRes.statusCode === 200, 'Lấy danh mục căn hộ thành công (200 OK)');
    assert(Array.isArray(listRes.body?.data), 'Response data là một mảng danh sách căn hộ');
    assert(listRes.body?.pagination?.total === 3, 'Response chứa phân trang chính xác');
    assert(listRes.body?.data[0]?.residentCount === 2, 'residentCount tính đúng số cư dân đã duyệt');
    assert(listRes.body?.data[1]?.residentCount === 0, 'Phòng trống có residentCount = 0');
    assert(listRes.body?.data[0]?.users === undefined, 'BẢO MẬT: Tuyệt đối KHÔNG trả danh sách users trong response Rooms');

    const invalidQueryRes = await invokeRoomsRouter({
      method: 'GET',
      url: '/?page=-1',
      user: { id: 2, role: Role.BQL },
    });
    assert(invalidQueryRes.statusCode === 400, 'Query không hợp lệ trả về 400 Bad Request');

    // -------------------------------------------------------------------------
    // 5. KIỂM THỬ NGHIỆP VỤ POST /api/rooms
    // -------------------------------------------------------------------------
    console.log('\n4. Kiểm thử Nghiệp vụ POST /api/rooms:');

    const createSuccess = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: '201', floor: 2, area: 80.0, users: ['hacked'] }, // Chống mass assignment
    });
    assert(createSuccess.statusCode === 201, 'ADMIN tạo căn hộ mới thành công (201 Created)');
    assert(createSuccess.body?.data?.roomNumber === '201', 'Trả về đúng số phòng vừa tạo');
    assert(createSuccess.body?.data?.status === RoomStatus.VACANT, 'Mặc định trạng thái là VACANT');
    assert(createSuccess.body?.data?.residentCount === 0, 'Căn hộ mới tạo có residentCount = 0');
    assert(createSuccess.body?.data?.users === undefined, 'CHỐNG MASS ASSIGNMENT: không nhận trường quan hệ users');

    const createBql = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 2, role: Role.BQL },
      body: { roomNumber: '202', floor: 2, area: 75.0, status: 'MAINTENANCE' },
    });
    assert(createBql.statusCode === 201, 'BQL tạo căn hộ với trạng thái khởi tạo MAINTENANCE thành công');
    assert(createBql.body?.data?.status === RoomStatus.MAINTENANCE, 'Trạng thái căn hộ là MAINTENANCE');

    const createOccupied = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: '203', floor: 2, area: 75.0, status: 'OCCUPIED' },
    });
    assert(createOccupied.statusCode === 400, 'Chặn tạo căn hộ mới với trạng thái OCCUPIED (400 Bad Request)');

    // Trùng số phòng (Pre-check)
    const duplicatePreCheck = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: '101', floor: 1, area: 75.0 }, // 101 đã tồn tại
    });
    assert(duplicatePreCheck.statusCode === 409, 'Trùng số phòng (Pre-check) trả về 409 Conflict');

    // Trùng số phòng (Prisma P2002 error catch)
    const duplicateP2002 = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: 'duplicate_P2002', floor: 1, area: 75.0 },
    });
    assert(duplicateP2002.statusCode === 409, 'Bắt lỗi Prisma P2002 unique constraint trả về 409 Conflict');

    // Lỗi database không bị biến nhầm thành 409
    const genericDbError = await invokeRoomsRouter({
      method: 'POST',
      url: '/',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: 'db_error', floor: 1, area: 75.0 },
    });
    assert(genericDbError.statusCode === 500, 'Lỗi database khác trả về 500 Internal Server Error (không nhầm 409)');

    // -------------------------------------------------------------------------
    // 6. KIỂM THỬ NGHIỆP VỤ PUT /api/rooms/:id & STATUS GUARDS
    // -------------------------------------------------------------------------
    console.log('\n5. Kiểm thử Nghiệp vụ PUT /api/rooms/:id & Status Guards:');

    // 6.1 Cập nhật thông thường
    const updateNormal = await invokeRoomsRouter({
      method: 'PUT',
      url: '/2',
      user: { id: 2, role: Role.BQL },
      body: { area: 70.0, floor: 1 },
      params: { id: '2' },
    });
    assert(updateNormal.statusCode === 200, 'Cập nhật diện tích và tầng thành công (200 OK)');

    // 6.2 Căn hộ không tồn tại -> 404
    const updateNotFound = await invokeRoomsRouter({
      method: 'PUT',
      url: '/9999',
      user: { id: 1, role: Role.ADMIN },
      body: { area: 70.0 },
      params: { id: '9999' },
    });
    assert(updateNotFound.statusCode === 404, 'Cập nhật căn hộ không tồn tại trả về 404 Not Found');

    // 6.3 Trùng số phòng trên căn hộ khác -> 409
    const updateDuplicateNumber = await invokeRoomsRouter({
      method: 'PUT',
      url: '/2', // Phòng 2 muốn đổi số phòng sang '101' vốn của phòng 1
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: '101' },
      params: { id: '2' },
    });
    assert(updateDuplicateNumber.statusCode === 409, 'Đổi sang số phòng đã tồn tại trên căn hộ khác trả về 409 Conflict');

    // 6.4 Status Guard: Chặn chuyển sang VACANT khi vẫn có cư dân đã duyệt (Room 1 có 2 cư dân)
    const guardVacantFail = await invokeRoomsRouter({
      method: 'PUT',
      url: '/1',
      user: { id: 2, role: Role.BQL },
      body: { status: 'VACANT' },
      params: { id: '1' },
    });
    assert(guardVacantFail.statusCode === 400, 'STATUS GUARD: Chặn chuyển sang VACANT khi còn cư dân đã duyệt (400 Bad Request)');
    assert(
      guardVacantFail.body?.message?.includes('VACANT') || guardVacantFail.body?.message?.includes('cư dân'),
      'Thông báo giải thích rõ ràng lý do từ chối VACANT'
    );

    // 6.5 Status Guard: Chặn chuyển sang OCCUPIED khi chưa có cư dân nào (Room 2 có 0 cư dân)
    const guardOccupiedFail = await invokeRoomsRouter({
      method: 'PUT',
      url: '/2',
      user: { id: 2, role: Role.BQL },
      body: { status: 'OCCUPIED' },
      params: { id: '2' },
    });
    assert(guardOccupiedFail.statusCode === 400, 'STATUS GUARD: Chặn chuyển sang OCCUPIED khi chưa có cư dân (400 Bad Request)');

    // 6.6 Status Guard: Cho phép chuyển sang MAINTENANCE ngay cả khi có cư dân (Room 1 có 2 cư dân)
    const guardMaintSuccess = await invokeRoomsRouter({
      method: 'PUT',
      url: '/1',
      user: { id: 1, role: Role.ADMIN },
      body: { status: 'MAINTENANCE' },
      params: { id: '1' },
    });
    assert(guardMaintSuccess.statusCode === 200, 'STATUS GUARD: Cho phép chuyển sang MAINTENANCE khi có cư dân (200 OK)');
    assert(guardMaintSuccess.body?.data?.status === RoomStatus.MAINTENANCE, 'Phòng chuyển sang MAINTENANCE thành công');

    // -------------------------------------------------------------------------
    // 7. KIỂM THỬ ROOT ROUTER WIRING (/api/rooms)
    // -------------------------------------------------------------------------
    console.log('\n6. Kiểm thử Root Application Router Wiring (/api/rooms):');

    const rootUnauth = await invokeRootApp({ method: 'GET', url: '/api/rooms' });
    assert(rootUnauth.statusCode === 401, 'Root App: GET /api/rooms không có token nhận HTTP 401 Unauthorized');

    const rootResident = await invokeRootApp({
      method: 'GET',
      url: '/api/rooms',
      user: { id: 10, role: Role.RESIDENT },
    });
    assert(rootResident.statusCode === 403, 'Root App: GET /api/rooms với role RESIDENT nhận HTTP 403 Forbidden');

    const rootTech = await invokeRootApp({
      method: 'GET',
      url: '/api/rooms',
      user: { id: 3, role: Role.TECHNICIAN },
    });
    assert(rootTech.statusCode === 403, 'Root App: GET /api/rooms với role TECHNICIAN nhận HTTP 403 Forbidden');

    const rootBql = await invokeRootApp({
      method: 'GET',
      url: '/api/rooms',
      user: { id: 2, role: Role.BQL },
    });
    assert(rootBql.statusCode === 200, 'Root App: GET /api/rooms với role BQL nhận HTTP 200 OK');
    assert(Array.isArray(rootBql.body?.data), 'Root App: Trả về danh sách căn hộ');

    const rootAdminPost = await invokeRootApp({
      method: 'POST',
      url: '/api/rooms',
      user: { id: 1, role: Role.ADMIN },
      body: { roomNumber: '301', floor: 3, area: 90.0 },
    });
    assert(rootAdminPost.statusCode === 201, 'Root App: POST /api/rooms với role ADMIN nhận HTTP 201 Created');

    const rootBqlPut = await invokeRootApp({
      method: 'PUT',
      url: '/api/rooms/2',
      user: { id: 2, role: Role.BQL },
      body: { area: 72.0 },
    });
    assert(rootBqlPut.statusCode === 200, 'Root App: PUT /api/rooms/:id với role BQL nhận HTTP 200 OK');
  } finally {
    prisma.room.findMany = originalFindMany;
    prisma.room.count = originalCount;
    prisma.room.create = originalCreate;
    prisma.room.findUnique = originalFindUnique;
    prisma.room.update = originalUpdate;
    prisma.user.count = originalUserCount;
    (prisma as any).$transaction = originalTransaction;
    (prisma as any).$queryRaw = originalQueryRaw;
  }

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ ROOMS MODULE: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runRoomsTests().catch((err) => {
  console.error('❌ Lỗi ngoại lệ trong Rooms test suite:', err);
  process.exit(1);
});
