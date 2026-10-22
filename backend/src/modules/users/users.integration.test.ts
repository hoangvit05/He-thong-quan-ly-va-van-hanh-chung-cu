// =========================================================================
// PHÂN HỆ QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN (USERS MODULE) — INTEGRATION TESTS
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế phân hệ Users & Residents trên PostgreSQL 16 thật:
//           1. Danh sách nhân sự nội bộ (Least Privilege, lọc vai trò, phân trang, bảo mật hash)
//           2. Tạo tài khoản nhân viên (Bcrypt hash, chống trùng P2002, chặn leo thang đặc quyền)
//           3. Danh sách cư dân (Lọc isApproved, lọc roomId, kiểm tra quan hệ Room, chống lộ hash)
//           4. Phê duyệt cư dân (Canonical & Alias, lưu CSDL thật, Idempotency, chống Mass Assignment)
//           5. Xác thực JWT & Phân quyền vai trò RBAC qua Root Application
// =========================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import rootRouter from '../../app.module';
import { hashPassword, comparePassword } from '../../common/utils/security';
import { getJwtSecret } from '../../common/middleware/auth';
import { ResourceTracker } from '../../test/integration-setup';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

// Khởi tạo Express Application cấp Root phục vụ integration test
const rootApp = express();
rootApp.use(express.json());
rootApp.use('/api', rootRouter);

/**
 * Dispatch HTTP request trực tiếp qua Express Application cấp Root (/api prefix)
 * và đi qua toàn bộ pipeline middleware thực tế (extractUser, requireAuth, requireRoles)
 */
function invokeUsersApi(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  token?: string;
  body?: any;
  query?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    let requestPath = options.url;
    let parsedQuery = { ...(options.query || {}) };

    if (requestPath.includes('?')) {
      const parts = requestPath.split('?');
      requestPath = parts[0];
      const searchParams = new URLSearchParams(parts[1]);
      const queryObj: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        queryObj[key] = val;
      });
      parsedQuery = { ...queryObj, ...parsedQuery };
    }

    const headers: Record<string, string> = {};
    if (options.token) {
      headers['authorization'] = `Bearer ${options.token}`;
    }

    const req: any = {
      method: options.method,
      url: requestPath,
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
 * Hàm thực thi toàn bộ suite Users Integration Tests trên PostgreSQL thật
 */
export async function runUsersIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY USERS INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
  console.log('------------------------------------------------------\n');

  const results: TestResult[] = [];

  function assert(condition: boolean, testName: string, detail?: string): void {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      results.push({ name: testName, passed: true });
    } else {
      const msg = detail ? ` -> ${detail}` : '';
      console.error(`  ❌ [FAIL] ${testName}${msg}`);
      results.push({ name: testName, passed: false, error: detail });
    }
  }

  // Khởi tạo tiền tố định danh duy nhất cho phiên test để chống xung đột dữ liệu
  const RUN_KEY = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  let testRoom1: any = null;
  let testRoom2: any = null;

  let adminUser: any = null;
  let bqlUser: any = null;
  let techUser1: any = null;
  let techUser2: any = null;
  let residentApproved: any = null;
  let residentPending1: any = null;
  let residentPending2: any = null;
  let residentNoRoom: any = null;

  let adminToken = '';
  let bqlToken = '';
  let techToken = '';
  let residentToken = '';

  const secret = getJwtSecret();

  function makeToken(user: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }): string {
    return jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
        fullName: user.fullName,
        roomId: user.roomId || null,
      },
      secret,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
  }

  try {
    // -----------------------------------------------------------------------
    // BƯỚC 0: TẠO FIXTURES CĂN HỘ VÀ TÀI KHOẢN TRÊN POSTGRESQL THẬT
    // -----------------------------------------------------------------------
    console.log('1. Khởi tạo Fixtures Căn hộ và Người dùng trên PostgreSQL test:');

    // 0.1 Tạo 2 Căn hộ
    testRoom1 = await prisma.room.create({
      data: {
        roomNumber: `USR_R1_${RUN_KEY}`,
        floor: 1,
        area: 75.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(testRoom1.id);

    testRoom2 = await prisma.room.create({
      data: {
        roomNumber: `USR_R2_${RUN_KEY}`,
        floor: 2,
        area: 68.5,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(testRoom2.id);

    // Mật khẩu băm chuẩn bị sẵn cho các fixtures ban đầu
    const defaultPasswordHash = await hashPassword('InitialPass123!');

    // 0.2 Tạo các tài khoản phục vụ test actors
    adminUser = await prisma.user.create({
      data: {
        username: `adm_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Quản Trị Viên Test',
        role: Role.ADMIN,
        isApproved: true,
        roomId: null,
      },
    });
    tracker.trackUser(adminUser.id);
    adminToken = makeToken(adminUser);

    bqlUser = await prisma.user.create({
      data: {
        username: `bql_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Ban Quản Lý Test',
        role: Role.BQL,
        isApproved: true,
        roomId: null,
      },
    });
    tracker.trackUser(bqlUser.id);
    bqlToken = makeToken(bqlUser);

    techUser1 = await prisma.user.create({
      data: {
        username: `tch1_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Thợ Kỹ Thuật 1',
        role: Role.TECHNICIAN,
        isApproved: true,
        roomId: null,
      },
    });
    tracker.trackUser(techUser1.id);
    techToken = makeToken(techUser1);

    techUser2 = await prisma.user.create({
      data: {
        username: `tch2_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Thợ Kỹ Thuật 2',
        role: Role.TECHNICIAN,
        isApproved: true,
        roomId: null,
      },
    });
    tracker.trackUser(techUser2.id);

    residentApproved = await prisma.user.create({
      data: {
        username: `res1_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Cư Dân Đã Duyệt',
        role: Role.RESIDENT,
        isApproved: true,
        roomId: testRoom1.id,
      },
    });
    tracker.trackUser(residentApproved.id);
    residentToken = makeToken(residentApproved);

    residentPending1 = await prisma.user.create({
      data: {
        username: `res2_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Cư Dân Chờ Duyệt 1',
        role: Role.RESIDENT,
        isApproved: false,
        roomId: testRoom2.id,
      },
    });
    tracker.trackUser(residentPending1.id);

    residentPending2 = await prisma.user.create({
      data: {
        username: `res3_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Cư Dân Chờ Duyệt 2',
        role: Role.RESIDENT,
        isApproved: false,
        roomId: testRoom1.id,
      },
    });
    tracker.trackUser(residentPending2.id);

    residentNoRoom = await prisma.user.create({
      data: {
        username: `res4_${RUN_KEY}`,
        password: defaultPasswordHash,
        fullName: 'Cư Dân Chưa Gán Phòng',
        role: Role.RESIDENT,
        isApproved: false,
        roomId: null,
      },
    });
    tracker.trackUser(residentNoRoom.id);

    console.log(`  -> Đã tạo 2 Phòng và 8 Người dùng fixtures thành công (Key: ${RUN_KEY}).\n`);

    // -----------------------------------------------------------------------
    // NHÓM A: DANH SÁCH TÀI KHOẢN NỘI BỘ (GET /api/admin/users)
    // -----------------------------------------------------------------------
    console.log('2. Nhóm A: Danh sách tài khoản nội bộ (GET /api/admin/users):');

    // TC-USR-01: Admin lấy danh sách tài khoản nội bộ
    const adminGetUsersRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: adminToken,
    });
    assert(adminGetUsersRes.statusCode === 200, 'TC-USR-01: Admin lấy danh sách tài khoản nội bộ thành công (HTTP 200 OK)');
    assert(Array.isArray(adminGetUsersRes.body?.data), 'TC-USR-01: Response data là một mảng danh sách người dùng');
    assert(
      typeof adminGetUsersRes.body?.pagination?.total === 'number' && adminGetUsersRes.body?.pagination?.total >= 4,
      'TC-USR-01: Response chứa thông tin phân trang pagination với tổng số hợp lệ'
    );

    const internalUsers = adminGetUsersRes.body?.data || [];
    const hasResidentInInternal = internalUsers.some((u: any) => u.role === Role.RESIDENT);
    assert(!hasResidentInInternal, 'TC-USR-01: Danh sách tài khoản nội bộ TUYỆT ĐỐI không chứa người dùng RESIDENT');

    const hasPasswordInList = internalUsers.some((u: any) => u.password !== undefined || u.hash !== undefined);
    assert(!hasPasswordInList, 'TC-USR-01: BẢO MẬT: Response danh sách tuyệt đối KHÔNG chứa password hay hash');

    // TC-USR-02: Bộ lọc role tác động thực tế đến truy vấn database
    const techFilterRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: adminToken,
      query: { role: Role.TECHNICIAN },
    });
    assert(techFilterRes.statusCode === 200, 'TC-USR-02: Lọc danh sách theo role=TECHNICIAN thành công (HTTP 200 OK)');
    const techUsersOnly = techFilterRes.body?.data || [];
    assert(
      techUsersOnly.length >= 2 && techUsersOnly.every((u: any) => u.role === Role.TECHNICIAN),
      'TC-USR-02: Bộ lọc role tác động thực tế đến CSDL: Mọi tài khoản trả về đều có role TECHNICIAN'
    );

    // TC-USR-03: Phân trang page & limit tác động thực tế đến PostgreSQL
    const paginatedRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: adminToken,
      query: { limit: '2', page: '1' },
    });
    assert(paginatedRes.statusCode === 200, 'TC-USR-03: Phân trang limit=2 & page=1 thành công (HTTP 200 OK)');
    assert(paginatedRes.body?.data?.length === 2, 'TC-USR-03: Số lượng bản ghi trả về đúng bằng limit = 2');
    assert(paginatedRes.body?.pagination?.limit === 2, 'TC-USR-03: Metadata pagination.limit ghi nhận đúng 2');

    const invalidLimitRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: adminToken,
      query: { limit: '150' }, // Vượt ngưỡng 100
    });
    assert(invalidLimitRes.statusCode === 400, 'TC-USR-03: Validator chặn limit > 100 với HTTP 400 Bad Request');

    // TC-USR-04: Least Privilege đối với BQL
    const bqlGetUsersRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: bqlToken,
      query: { role: Role.ADMIN }, // BQL cố tình yêu cầu xem ADMIN
    });
    assert(bqlGetUsersRes.statusCode === 200, 'TC-USR-04: BQL truy cập GET /api/admin/users thành công (HTTP 200 OK)');
    const bqlViewedUsers = bqlGetUsersRes.body?.data || [];
    assert(
      bqlViewedUsers.length >= 2 && bqlViewedUsers.every((u: any) => u.role === Role.TECHNICIAN),
      'TC-USR-04: LEAST PRIVILEGE: BQL bị ép chặt chẽ chỉ xem TECHNICIAN, phớt lờ query role=ADMIN'
    );

    // -----------------------------------------------------------------------
    // NHÓM B: TẠO TÀI KHOẢN NHÂN VIÊN (POST /api/admin/users)
    // -----------------------------------------------------------------------
    console.log('\n3. Nhóm B: Tạo tài khoản nhân viên (POST /api/admin/users):');

    // TC-USR-05: Admin tạo tài khoản BQL mới
    const newBqlUsername = `new_bql_${RUN_KEY}`;
    const newBqlEmail = `bql_${RUN_KEY}@apartment.test`;
    const newBqlPassword = 'BqlPassword123!';

    const createBqlRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: newBqlUsername,
        password: newBqlPassword,
        fullName: 'BQL Mới Tạo',
        role: Role.BQL,
        phone: '0901234567',
        email: newBqlEmail,
      },
    });
    assert(createBqlRes.statusCode === 201, 'TC-USR-05: Admin tạo tài khoản BQL thành công (HTTP 201 Created)');
    assert(createBqlRes.body?.data?.role === Role.BQL, 'TC-USR-05: Đúng vai trò BQL');
    assert(createBqlRes.body?.data?.isApproved === true, 'TC-USR-05: Nhân viên nội bộ do Admin tạo được kích hoạt isApproved=true ngay');
    assert(createBqlRes.body?.data?.password === undefined, 'TC-USR-05: BẢO MẬT: Response tạo nhân viên KHÔNG chứa password hay hash');

    const createdBqlId = createBqlRes.body?.data?.id;
    if (createdBqlId) tracker.trackUser(createdBqlId);

    // Xác minh trực tiếp trong PostgreSQL thật
    const dbBqlUser = await prisma.user.findUnique({ where: { id: createdBqlId } });
    assert(dbBqlUser !== null, 'TC-USR-05: CSDL PostgreSQL lưu trữ thành công bản ghi BQL mới');
    assert(dbBqlUser?.password !== newBqlPassword, 'TC-USR-05: Mật khẩu lưu trong PostgreSQL được băm Bcrypt, KHÔNG ở dạng văn bản rõ');
    const isPasswordHashValid = await comparePassword(newBqlPassword, dbBqlUser?.password || '');
    assert(isPasswordHashValid, 'TC-USR-05: Hàm comparePassword xác nhận chuỗi băm trong CSDL khớp chính xác với mật khẩu ban đầu');

    // TC-USR-06: Admin tạo tài khoản TECHNICIAN mới
    const newTechUsername = `new_tch_${RUN_KEY}`;
    const createTechRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: newTechUsername,
        password: 'TechPassword123!',
        fullName: 'Thợ Mới Tạo',
        role: Role.TECHNICIAN,
      },
    });
    assert(createTechRes.statusCode === 201, 'TC-USR-06: Admin tạo tài khoản TECHNICIAN thành công (HTTP 201 Created)');
    const createdTechId = createTechRes.body?.data?.id;
    if (createdTechId) tracker.trackUser(createdTechId);

    const dbTechUser = await prisma.user.findUnique({ where: { id: createdTechId } });
    assert(dbTechUser?.role === Role.TECHNICIAN, 'TC-USR-06: CSDL PostgreSQL ghi nhận bền vững đúng vai trò TECHNICIAN');

    // TC-USR-07: Chống trùng lặp Unique Constraints (P2002)
    const duplicateUsernameRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: newBqlUsername, // Trùng username vừa tạo
        password: 'AnotherPassword123!',
        fullName: 'Trùng Username',
        role: Role.TECHNICIAN,
      },
    });
    assert(duplicateUsernameRes.statusCode === 409, 'TC-USR-07: Trùng username trả về HTTP 409 Conflict an toàn (Bắt lỗi P2002)');
    assert(
      duplicateUsernameRes.body?.message?.includes('Tên đăng nhập đã tồn tại'),
      'TC-USR-07: Thông báo lỗi trùng tên đăng nhập rõ ràng'
    );

    const duplicateEmailRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: `unique_${RUN_KEY}`,
        password: 'AnotherPassword123!',
        fullName: 'Trùng Email',
        role: Role.TECHNICIAN,
        email: newBqlEmail, // Trùng email vừa tạo
      },
    });
    assert(duplicateEmailRes.statusCode === 409, 'TC-USR-07: Trùng email trả về HTTP 409 Conflict an toàn (Bắt lỗi P2002)');
    assert(
      duplicateEmailRes.body?.message?.includes('email đã được sử dụng'),
      'TC-USR-07: Thông báo lỗi trùng email rõ ràng'
    );

    // TC-USR-08: Chặn tạo vai trò cấm và payload không hợp lệ
    const adminRoleRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: `fake_adm_${RUN_KEY}`,
        password: 'Password123!',
        fullName: 'Fake Admin',
        role: 'ADMIN',
      },
    });
    assert(adminRoleRes.statusCode === 400, 'TC-USR-08: Chặn tuyệt đối tự phong role ADMIN khi tạo nhân viên (HTTP 400 Bad Request)');

    const residentRoleRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: `fake_res_${RUN_KEY}`,
        password: 'Password123!',
        fullName: 'Fake Resident',
        role: 'RESIDENT',
      },
    });
    assert(residentRoleRes.statusCode === 400, 'TC-USR-08: Chặn tuyệt đối tạo role RESIDENT qua API nhân viên (HTTP 400 Bad Request)');

    const weakPayloadRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: adminToken,
      body: {
        username: 'ab', // Quá ngắn
        password: '123', // Quá yếu
        fullName: '',
        role: Role.TECHNICIAN,
      },
    });
    assert(weakPayloadRes.statusCode === 400, 'TC-USR-08: Chặn payload không hợp lệ (username ngắn, password yếu) (HTTP 400 Bad Request)');

    // -----------------------------------------------------------------------
    // NHÓM C: DANH SÁCH CƯ DÂN (GET /api/apartments/residents)
    // -----------------------------------------------------------------------
    console.log('\n4. Nhóm C: Danh sách cư dân (GET /api/apartments/residents):');

    // TC-USR-09: BQL lấy danh sách cư dân
    const residentsListRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
    });
    assert(residentsListRes.statusCode === 200, 'TC-USR-09: BQL lấy danh sách cư dân thành công (HTTP 200 OK)');
    assert(Array.isArray(residentsListRes.body?.data), 'TC-USR-09: Response data là một mảng danh sách cư dân');

    const residents = residentsListRes.body?.data || [];
    const onlyResidents = residents.every((r: any) => r.role === Role.RESIDENT);
    assert(onlyResidents, 'TC-USR-09: TÁCH BẠCH ROUTER: Danh sách cư dân TUYỆT ĐỐI chỉ chứa tài khoản RESIDENT');

    const hasResidentPassword = residents.some((r: any) => r.password !== undefined || r.hash !== undefined);
    assert(!hasResidentPassword, 'TC-USR-09: BẢO MẬT: Response danh sách cư dân KHÔNG chứa password hay hash');

    // TC-USR-10: Bộ lọc isApproved tác động thực tế
    const approvedFilterRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
      query: { isApproved: 'true' },
    });
    assert(approvedFilterRes.statusCode === 200, 'TC-USR-10: Lọc cư dân isApproved=true thành công (HTTP 200 OK)');
    const approvedResidents = approvedFilterRes.body?.data || [];
    assert(
      approvedResidents.length >= 1 && approvedResidents.every((r: any) => r.isApproved === true),
      'TC-USR-10: Bộ lọc isApproved=true hoạt động chính xác trên PostgreSQL'
    );

    const pendingFilterRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
      query: { isApproved: 'false' },
    });
    assert(pendingFilterRes.statusCode === 200, 'TC-USR-10: Lọc cư dân isApproved=false thành công (HTTP 200 OK)');
    const pendingResidents = pendingFilterRes.body?.data || [];
    assert(
      pendingResidents.length >= 2 && pendingResidents.every((r: any) => r.isApproved === false),
      'TC-USR-10: Bộ lọc isApproved=false hoạt động chính xác trên PostgreSQL'
    );

    // TC-USR-11: Bộ lọc roomId và quan hệ Room
    const roomFilterRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
      query: { roomId: String(testRoom1.id) },
    });
    assert(roomFilterRes.statusCode === 200, 'TC-USR-11: Lọc cư dân theo roomId thành công (HTTP 200 OK)');
    const room1Residents = roomFilterRes.body?.data || [];
    assert(
      room1Residents.length >= 2 && room1Residents.every((r: any) => r.roomId === testRoom1.id),
      'TC-USR-11: Bộ lọc roomId trả về chính xác cư dân thuộc căn hộ chỉ định'
    );
    assert(
      room1Residents[0]?.room?.roomNumber === `USR_R1_${RUN_KEY}`,
      'TC-USR-11: Dữ liệu quan hệ Room kèm theo có đúng cấu trúc (id, roomNumber, floor)'
    );

    const nonExistentRoomRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
      query: { roomId: '999999' },
    });
    assert(nonExistentRoomRes.statusCode === 404, 'TC-USR-11: Tra cứu theo roomId không tồn tại trả về HTTP 404 Not Found an toàn');

    // TC-USR-12: Phân trang danh sách cư dân trên database
    const paginatedResidentsRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: bqlToken,
      query: { limit: '1', page: '1' },
    });
    assert(paginatedResidentsRes.statusCode === 200, 'TC-USR-12: Phân trang danh sách cư dân thành công (HTTP 200 OK)');
    assert(paginatedResidentsRes.body?.data?.length === 1, 'TC-USR-12: Số lượng cư dân trả về đúng bằng limit = 1');
    assert(paginatedResidentsRes.body?.pagination?.totalPages >= 2, 'TC-USR-12: Metadata pagination.totalPages tính toán chính xác');

    // -----------------------------------------------------------------------
    // NHÓM D: DUYỆT CƯ DÂN (CANONICAL & COMPATIBILITY ALIAS)
    // -----------------------------------------------------------------------
    console.log('\n5. Nhóm D: Duyệt cư dân (Canonical & Compatibility Alias):');

    // TC-USR-13: BQL duyệt cư dân qua Canonical route: PUT /api/apartments/residents/:id/approve
    const canonicalApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentPending1.id}/approve`,
      token: bqlToken,
      body: {
        role: 'ADMIN', // Thử nghiệm Mass Assignment
        password: 'hackedPassword',
        roomId: 9999,
      },
    });
    assert(canonicalApproveRes.statusCode === 200, 'TC-USR-13: BQL duyệt cư dân thành công qua Canonical route (HTTP 200 OK)');
    assert(canonicalApproveRes.body?.data?.isApproved === true, 'TC-USR-13: Response trả về isApproved = true');
    assert(canonicalApproveRes.body?.data?.password === undefined, 'TC-USR-13: BẢO MẬT: Response duyệt không chứa password hay hash');

    // Xác minh CSDL thật sau khi duyệt
    const dbApprovedResident1 = await prisma.user.findUnique({ where: { id: residentPending1.id } });
    assert(dbApprovedResident1?.isApproved === true, 'TC-USR-13: CSDL PostgreSQL xác nhận trạng thái isApproved được cập nhật bền vững = true');
    assert(dbApprovedResident1?.role === Role.RESIDENT, 'TC-USR-13: CHỐNG MASS ASSIGNMENT: role của cư dân không bị đổi thành ADMIN');
    assert(dbApprovedResident1?.roomId === testRoom2.id, 'TC-USR-13: CHỐNG MASS ASSIGNMENT: roomId của cư dân không bị thay đổi');
    assert(dbApprovedResident1?.password === defaultPasswordHash, 'TC-USR-13: CHỐNG MASS ASSIGNMENT: password của cư dân không bị ghi đè');

    // TC-USR-14: Admin duyệt cư dân qua Compatibility Alias: PUT /api/admin/users/:id/approve
    const aliasApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/admin/users/${residentPending2.id}/approve`,
      token: adminToken,
    });
    assert(aliasApproveRes.statusCode === 200, 'TC-USR-14: Admin duyệt cư dân thành công qua Compatibility Alias (HTTP 200 OK)');
    const dbApprovedResident2 = await prisma.user.findUnique({ where: { id: residentPending2.id } });
    assert(dbApprovedResident2?.isApproved === true, 'TC-USR-14: CSDL PostgreSQL xác nhận cư dân duyệt qua Alias được cập nhật isApproved = true');
    assert(
      aliasApproveRes.body?.data?.isApproved === canonicalApproveRes.body?.data?.isApproved &&
        aliasApproveRes.body?.data?.role === canonicalApproveRes.body?.data?.role,
      'TC-USR-14: ĐỒNG NHẤT HỢP ĐỒNG: Canonical và Alias route trả về cấu trúc response tương đương'
    );

    // TC-USR-15: Tính Idempotent khi duyệt lại tài khoản đã duyệt trước đó
    const idempotentApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentPending1.id}/approve`,
      token: bqlToken,
    });
    assert(idempotentApproveRes.statusCode === 200, 'TC-USR-15: Duyệt lại tài khoản đã duyệt hành xử Idempotent (HTTP 200 OK)');
    assert(
      idempotentApproveRes.body?.message?.includes('đã được phê duyệt trước đó'),
      'TC-USR-15: Thông báo rõ ràng tài khoản đã được phê duyệt trước đó'
    );

    // TC-USR-16: Chặn duyệt các trường hợp không hợp lệ
    const nonExistentApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: '/api/apartments/residents/999999/approve',
      token: bqlToken,
    });
    assert(nonExistentApproveRes.statusCode === 404, 'TC-USR-16: Chặn duyệt user không tồn tại với HTTP 404 Not Found');

    const nonResidentApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${adminUser.id}/approve`,
      token: bqlToken,
    });
    assert(nonResidentApproveRes.statusCode === 400, 'TC-USR-16: Chặn duyệt tài khoản không phải vai trò RESIDENT với HTTP 400 Bad Request');

    const noRoomApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentNoRoom.id}/approve`,
      token: bqlToken,
    });
    assert(noRoomApproveRes.statusCode === 400, 'TC-USR-16: Chặn duyệt cư dân chưa được gán vào căn hộ với HTTP 400 Bad Request');
    assert(
      noRoomApproveRes.body?.message?.includes('chưa được gán vào căn hộ'),
      'TC-USR-16: Thông báo yêu cầu gán phòng trước khi duyệt rõ ràng'
    );

    // -----------------------------------------------------------------------
    // NHÓM E: AUTHENTICATION & PHÂN QUYỀN RBAC QUA ROOT APP TRÊN CSDL THẬT
    // -----------------------------------------------------------------------
    console.log('\n6. Nhóm E: Authentication & Phân quyền RBAC qua Root App:');

    // TC-USR-17: Từ chối request khi không có Bearer Token (HTTP 401 Unauthorized)
    const unauthGetAdmin = await invokeUsersApi({ method: 'GET', url: '/api/admin/users' });
    assert(unauthGetAdmin.statusCode === 401, 'TC-USR-17: GET /api/admin/users từ chối khi không có Bearer token (HTTP 401 Unauthorized)');

    const unauthCreateStaff = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      body: { username: 'test', password: 'Password123!', fullName: 'Test', role: 'TECHNICIAN' },
    });
    assert(unauthCreateStaff.statusCode === 401, 'TC-USR-17: POST /api/admin/users từ chối khi không có Bearer token (HTTP 401 Unauthorized)');

    const unauthGetResidents = await invokeUsersApi({ method: 'GET', url: '/api/apartments/residents' });
    assert(unauthGetResidents.statusCode === 401, 'TC-USR-17: GET /api/apartments/residents từ chối khi không có Bearer token (HTTP 401 Unauthorized)');

    const unauthCanonicalApprove = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentPending1.id}/approve`,
    });
    assert(unauthCanonicalApprove.statusCode === 401, 'TC-USR-17: PUT /api/apartments/residents/:id/approve từ chối khi không có token (HTTP 401 Unauthorized)');

    const unauthAliasApprove = await invokeUsersApi({
      method: 'PUT',
      url: `/api/admin/users/${residentPending2.id}/approve`,
    });
    assert(unauthAliasApprove.statusCode === 401, 'TC-USR-17: PUT /api/admin/users/:id/approve từ chối khi không có token (HTTP 401 Unauthorized)');

    // TC-USR-18: Phân quyền vai trò RBAC (HTTP 403 Forbidden)
    const residentGetAdminRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: residentToken,
    });
    assert(residentGetAdminRes.statusCode === 403, 'TC-USR-18: Cư dân bị chặn truy cập danh sách nhân sự GET /api/admin/users (HTTP 403 Forbidden)');

    const techGetAdminRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/admin/users',
      token: techToken,
    });
    assert(techGetAdminRes.statusCode === 403, 'TC-USR-18: Thợ kỹ thuật bị chặn truy cập danh sách nhân sự GET /api/admin/users (HTTP 403 Forbidden)');

    const residentCreateStaffRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: residentToken,
      body: { username: 'tech_hack', password: 'Password123!', fullName: 'Hack', role: 'TECHNICIAN' },
    });
    assert(residentCreateStaffRes.statusCode === 403, 'TC-USR-18: Cư dân bị chặn tạo nhân viên POST /api/admin/users (HTTP 403 Forbidden)');

    const bqlCreateStaffRes = await invokeUsersApi({
      method: 'POST',
      url: '/api/admin/users',
      token: bqlToken,
      body: { username: 'tech_hack', password: 'Password123!', fullName: 'Hack', role: 'TECHNICIAN' },
    });
    assert(bqlCreateStaffRes.statusCode === 403, 'TC-USR-18: BQL bị chặn tạo nhân viên POST /api/admin/users (HTTP 403 Forbidden)');

    const residentGetResidentsRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: residentToken,
    });
    assert(residentGetResidentsRes.statusCode === 403, 'TC-USR-18: Cư dân bị chặn xem danh sách cư dân khác GET /api/apartments/residents (HTTP 403 Forbidden)');

    const techGetResidentsRes = await invokeUsersApi({
      method: 'GET',
      url: '/api/apartments/residents',
      token: techToken,
    });
    assert(techGetResidentsRes.statusCode === 403, 'TC-USR-18: Thợ kỹ thuật bị chặn xem danh sách cư dân GET /api/apartments/residents (HTTP 403 Forbidden)');

    const residentSelfApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentApproved.id}/approve`,
      token: residentToken,
    });
    assert(residentSelfApproveRes.statusCode === 403, 'TC-USR-18: Cư dân tự duyệt tài khoản bị chặn tuyệt đối (HTTP 403 Forbidden)');

    const techApproveRes = await invokeUsersApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentPending1.id}/approve`,
      token: techToken,
    });
    assert(techApproveRes.statusCode === 403, 'TC-USR-18: Thợ kỹ thuật duyệt tài khoản bị chặn tuyệt đối (HTTP 403 Forbidden)');
  } catch (error: any) {
    console.error('❌ Lỗi ngoại lệ trong Users Integration Test Suite:', error);
    results.push({ name: 'Exception in Users Integration Suite', passed: false, error: error?.message });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ USERS INTEGRATION: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
