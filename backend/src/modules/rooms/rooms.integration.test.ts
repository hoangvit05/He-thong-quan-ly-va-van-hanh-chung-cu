// =========================================================================
// PHÂN HỆ QUẢN LÝ CĂN HỘ (ROOMS MODULE) — POSTGRESQL INTEGRATION TESTS
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế phân hệ Rooms & Gán phòng trên PostgreSQL 16 thật:
//           1. RBAC và Root Application Router Wiring (/api/rooms)
//           2. GET rooms (Phân trang, lọc tầng, trạng thái, tìm kiếm, tính residentCount)
//           3. POST rooms (Tạo phòng, mặc định VACANT, cho phép MAINTENANCE, chặn OCCUPIED, bắt trùng 409)
//           4. PUT rooms (Cập nhật, status guards VACANT/OCCUPIED/MAINTENANCE trong transaction)
//           5. Gán và chuyển phòng cư dân (PUT /api/apartments/residents/:id/room)
//           6. Đồng bộ trạng thái Room khi duyệt cư dân (Approval synchronization & Maintenance guard)
//           7. Dọn dẹp dữ liệu fixtures an toàn qua ResourceTracker
// =========================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { Role, RoomStatus } from '@prisma/client';
import rootRouter from '../../app.module';
import { hashPassword } from '../../common/utils/security';
import { getJwtSecret } from '../../common/middleware/auth';
import { ResourceTracker } from '../../test/integration-setup';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const rootApp = express();
rootApp.use(express.json());
rootApp.use('/api', rootRouter);

function invokeApi(options: {
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

export async function runRoomsIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY ROOMS INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
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

  const RUN_KEY = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  let adminUser: any = null;
  let bqlUser: any = null;
  let techUser: any = null;
  let residentUser: any = null;
  let residentUser2: any = null;

  let adminToken = '';
  let bqlToken = '';
  let techToken = '';
  let residentToken = '';

  let roomVacant: any = null;
  let roomOccupied: any = null;
  let roomMaint: any = null;

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
    // -------------------------------------------------------------------------
    // BƯỚC 1: KHỞI TẠO FIXTURES DỮ LIỆU BAN ĐẦU
    // -------------------------------------------------------------------------
    console.log('📦 BƯỚC 1: Thiết lập fixtures trên PostgreSQL thật...');

    const defaultHash = await hashPassword('TestPassword123');

    // 1. Tạo các phòng mẫu
    roomVacant = await prisma.room.create({
      data: {
        roomNumber: `RV-${RUN_KEY}`,
        floor: 10,
        area: 70.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(roomVacant.id);

    roomOccupied = await prisma.room.create({
      data: {
        roomNumber: `RO-${RUN_KEY}`,
        floor: 10,
        area: 85.0,
        status: RoomStatus.OCCUPIED,
      },
    });
    tracker.trackRoom(roomOccupied.id);

    roomMaint = await prisma.room.create({
      data: {
        roomNumber: `RM-${RUN_KEY}`,
        floor: 11,
        area: 60.0,
        status: RoomStatus.MAINTENANCE,
      },
    });
    tracker.trackRoom(roomMaint.id);

    // 2. Tạo các người dùng mẫu
    adminUser = await prisma.user.create({
      data: {
        username: `adm_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Admin Integration',
        role: Role.ADMIN,
        isApproved: true,
      },
    });
    tracker.trackUser(adminUser.id);
    adminToken = makeToken(adminUser);

    bqlUser = await prisma.user.create({
      data: {
        username: `bql_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'BQL Integration',
        role: Role.BQL,
        isApproved: true,
      },
    });
    tracker.trackUser(bqlUser.id);
    bqlToken = makeToken(bqlUser);

    techUser = await prisma.user.create({
      data: {
        username: `tch_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Tech Integration',
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techUser.id);
    techToken = makeToken(techUser);

    // Cư dân 1: Đã duyệt và cư trú tại roomOccupied
    residentUser = await prisma.user.create({
      data: {
        username: `res1_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Resident 1 Integration',
        role: Role.RESIDENT,
        roomId: roomOccupied.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser.id);
    residentToken = makeToken(residentUser);

    // Cư dân 2: Chưa duyệt và chưa có phòng
    residentUser2 = await prisma.user.create({
      data: {
        username: `res2_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Resident 2 Integration',
        role: Role.RESIDENT,
        roomId: null,
        isApproved: false,
      },
    });
    tracker.trackUser(residentUser2.id);

    console.log('✅ Thiết lập fixtures thành công.\n');

    // -------------------------------------------------------------------------
    // BƯỚC 2: KIỂM THỬ XÁC THỰC VÀ PHÂN QUYỀN RBAC TRÊN ROOT APPLICATION
    // -------------------------------------------------------------------------
    console.log('🔒 BƯỚC 2: Kiểm thử Xác thực & Phân quyền RBAC (/api/rooms):');

    const unauthGet = await invokeApi({ method: 'GET', url: '/api/rooms' });
    assert(unauthGet.statusCode === 401, 'GET /api/rooms: Từ chối khi không có token (401 Unauthorized)');

    const techGet = await invokeApi({ method: 'GET', url: '/api/rooms', token: techToken });
    assert(techGet.statusCode === 403, 'GET /api/rooms: Chặn Thợ kỹ thuật (403 Forbidden)');

    const resGet = await invokeApi({ method: 'GET', url: '/api/rooms', token: residentToken });
    assert(resGet.statusCode === 403, 'GET /api/rooms: Chặn Cư dân (403 Forbidden)');

    const bqlGet = await invokeApi({ method: 'GET', url: '/api/rooms', token: bqlToken });
    assert(bqlGet.statusCode === 200, 'GET /api/rooms: Cho phép BQL (200 OK)');

    const adminGet = await invokeApi({ method: 'GET', url: '/api/rooms', token: adminToken });
    assert(adminGet.statusCode === 200, 'GET /api/rooms: Cho phép ADMIN (200 OK)');

    const unauthPost = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      body: { roomNumber: `R-NOAUTH-${RUN_KEY}`, floor: 1, area: 50 },
    });
    assert(unauthPost.statusCode === 401, 'POST /api/rooms: Từ chối khi không có token (401 Unauthorized)');

    const resPost = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: residentToken,
      body: { roomNumber: `R-RESPP-${RUN_KEY}`, floor: 1, area: 50 },
    });
    assert(resPost.statusCode === 403, 'POST /api/rooms: Chặn Cư dân tạo căn hộ (403 Forbidden)');

    const techPost = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: techToken,
      body: { roomNumber: `R-TECHP-${RUN_KEY}`, floor: 1, area: 50 },
    });
    assert(techPost.statusCode === 403, 'POST /api/rooms: Chặn Thợ kỹ thuật tạo căn hộ (403 Forbidden)');

    const resPut = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomVacant.id}`,
      token: residentToken,
      body: { area: 99.0 },
    });
    assert(resPut.statusCode === 403, 'PUT /api/rooms/:id: Chặn Cư dân sửa căn hộ (403 Forbidden)');

    // -------------------------------------------------------------------------
    // BƯỚC 3: KIỂM THỬ TRUY VẤN GET /api/rooms TRÊN DATABASE THẬT
    // -------------------------------------------------------------------------
    console.log('\n📋 BƯỚC 3: Kiểm thử Truy vấn GET /api/rooms trên PostgreSQL thật:');

    const listRes = await invokeApi({
      method: 'GET',
      url: `/api/rooms?search=${RUN_KEY}&page=1&limit=10`,
      token: bqlToken,
    });
    assert(listRes.statusCode === 200, 'Lấy danh mục căn hộ trên DB thật thành công (200 OK)');
    assert(Array.isArray(listRes.body?.data), 'Dữ liệu trả về là một mảng căn hộ');
    assert(listRes.body?.pagination?.total >= 3, 'Phân trang tính đúng tổng số phòng tìm được');

    const foundVacant = listRes.body?.data.find((r: any) => r.id === roomVacant.id);
    const foundOccupied = listRes.body?.data.find((r: any) => r.id === roomOccupied.id);

    assert(foundVacant && foundVacant.residentCount === 0, 'Phòng trống có residentCount = 0');
    assert(foundOccupied && foundOccupied.residentCount === 1, 'Phòng có cư dân đã duyệt tính đúng residentCount = 1');
    assert(foundOccupied?.users === undefined, 'BẢO MẬT: Response không chứa danh sách users hoặc thông tin nhạy cảm');

    // Lọc theo tầng
    const floorFilterRes = await invokeApi({
      method: 'GET',
      url: `/api/rooms?search=${RUN_KEY}&floor=11`,
      token: bqlToken,
    });
    assert(
      floorFilterRes.body?.data.every((r: any) => r.floor === 11),
      'Lọc theo tầng (floor=11) tác động chính xác lên PostgreSQL query'
    );

    // Lọc theo trạng thái
    const statusFilterRes = await invokeApi({
      method: 'GET',
      url: `/api/rooms?search=${RUN_KEY}&status=MAINTENANCE`,
      token: bqlToken,
    });
    assert(
      statusFilterRes.body?.data.every((r: any) => r.status === RoomStatus.MAINTENANCE),
      'Lọc theo trạng thái (status=MAINTENANCE) lọc đúng tập dữ liệu'
    );

    // -------------------------------------------------------------------------
    // BƯỚC 4: KIỂM THỬ TẠO CĂN HỘ POST /api/rooms TRÊN DATABASE THẬT
    // -------------------------------------------------------------------------
    console.log('\n🏗️  BƯỚC 4: Kiểm thử POST /api/rooms & Ràng buộc Unique trên PostgreSQL thật:');

    const newRoomNumber = `R-NEW-${RUN_KEY}`;
    const createRes = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: adminToken,
      body: {
        roomNumber: newRoomNumber,
        floor: 15,
        area: 92.5,
        users: [{ id: 999 }], // Cố ý gửi mass assignment
      },
    });
    assert(createRes.statusCode === 201, 'ADMIN tạo căn hộ mới thành công trên DB thật (201 Created)');
    assert(createRes.body?.data?.roomNumber === newRoomNumber, 'Trả về đúng số phòng vừa tạo');
    assert(createRes.body?.data?.status === RoomStatus.VACANT, 'Trạng thái mặc định khi tạo mới là VACANT');
    assert(createRes.body?.data?.residentCount === 0, 'Phòng mới tạo có residentCount = 0');
    if (createRes.body?.data?.id) tracker.trackRoom(createRes.body.data.id);

    // Kiểm tra trực tiếp trong PostgreSQL
    const dbRoom = await prisma.room.findUnique({ where: { roomNumber: newRoomNumber } });
    assert(dbRoom !== null && dbRoom.floor === 15, 'Căn hộ mới đã được lưu thành công vào PostgreSQL database');

    // Tạo căn hộ với trạng thái MAINTENANCE
    const maintNewNumber = `R-MNT-${RUN_KEY}`;
    const createMaintRes = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: bqlToken,
      body: {
        roomNumber: maintNewNumber,
        floor: 16,
        area: 80.0,
        status: RoomStatus.MAINTENANCE,
      },
    });
    assert(createMaintRes.statusCode === 201, 'BQL tạo căn hộ với trạng thái khởi tạo MAINTENANCE thành công');
    if (createMaintRes.body?.data?.id) tracker.trackRoom(createMaintRes.body.data.id);

    // Chặn tạo mới ở trạng thái OCCUPIED
    const createOccupiedRes = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: adminToken,
      body: {
        roomNumber: `R-OCC-${RUN_KEY}`,
        floor: 15,
        area: 92.5,
        status: RoomStatus.OCCUPIED,
      },
    });
    assert(createOccupiedRes.statusCode === 400, 'Chặn tạo căn hộ mới ở trạng thái OCCUPIED (400 Bad Request)');

    // Trùng số phòng (Unique Constraint) -> 409 Conflict
    const duplicateCreateRes = await invokeApi({
      method: 'POST',
      url: '/api/rooms',
      token: adminToken,
      body: {
        roomNumber: newRoomNumber, // Đã tồn tại
        floor: 15,
        area: 92.5,
      },
    });
    assert(
      duplicateCreateRes.statusCode === 409,
      'Unique Constraint: Tạo trùng roomNumber trả về 409 Conflict an toàn'
    );

    // -------------------------------------------------------------------------
    // BƯỚC 5: KIỂM THỬ CẬP NHẬT CĂN HỘ PUT /api/rooms/:id & STATUS GUARDS
    // -------------------------------------------------------------------------
    console.log('\n🛡️  BƯỚC 5: Kiểm thử PUT /api/rooms/:id & Status Guards trên PostgreSQL thật:');

    // 5.1 Cập nhật thông số hợp lệ
    const updateNormalRes = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomVacant.id}`,
      token: bqlToken,
      body: { area: 78.5, floor: 10 },
    });
    assert(updateNormalRes.statusCode === 200, 'Cập nhật diện tích phòng thành công (200 OK)');
    const dbVacantAfterUpdate = await prisma.room.findUnique({ where: { id: roomVacant.id } });
    assert(dbVacantAfterUpdate?.area === 78.5, 'Giá trị diện tích mới đã lưu vào PostgreSQL');

    // 5.2 Cập nhật căn hộ không tồn tại -> 404
    const updateNotFoundRes = await invokeApi({
      method: 'PUT',
      url: '/api/rooms/999999',
      token: adminToken,
      body: { area: 78.5 },
    });
    assert(updateNotFoundRes.statusCode === 404, 'Cập nhật phòng không tồn tại trả về 404 Not Found');

    // 5.3 Trùng số phòng trên căn hộ khác -> 409
    const updateDuplicateRes = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomVacant.id}`,
      token: adminToken,
      body: { roomNumber: roomOccupied.roomNumber }, // Trùng với roomOccupied
    });
    assert(updateDuplicateRes.statusCode === 409, 'Đổi sang số phòng đã có trên căn hộ khác trả về 409 Conflict');

    // 5.4 Status Guard: Chặn chuyển sang VACANT khi vẫn có cư dân đã duyệt (roomOccupied có residentUser)
    const guardVacantFail = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomOccupied.id}`,
      token: bqlToken,
      body: { status: RoomStatus.VACANT },
    });
    assert(
      guardVacantFail.statusCode === 400,
      'STATUS GUARD: Chặn chuyển sang VACANT khi vẫn còn cư dân đã duyệt cư trú (400 Bad Request)'
    );

    // 5.5 Status Guard: Chặn chuyển sang OCCUPIED khi chưa có cư dân nào (roomVacant có 0 cư dân)
    const guardOccupiedFail = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomVacant.id}`,
      token: bqlToken,
      body: { status: RoomStatus.OCCUPIED },
    });
    assert(
      guardOccupiedFail.statusCode === 400,
      'STATUS GUARD: Chặn chuyển sang OCCUPIED khi chưa có cư dân nào được duyệt (400 Bad Request)'
    );

    // 5.6 Status Guard: Cho phép chuyển sang MAINTENANCE ngay cả khi đang có cư dân
    const guardMaintSuccess = await invokeApi({
      method: 'PUT',
      url: `/api/rooms/${roomOccupied.id}`,
      token: adminToken,
      body: { status: RoomStatus.MAINTENANCE },
    });
    assert(
      guardMaintSuccess.statusCode === 200,
      'STATUS GUARD: Cho phép chuyển sang MAINTENANCE khi có cư dân (bảo trì khẩn cấp) (200 OK)'
    );
    const dbRoomMaint = await prisma.room.findUnique({ where: { id: roomOccupied.id } });
    assert(dbRoomMaint?.status === RoomStatus.MAINTENANCE, 'Trạng thái phòng đã chuyển sang MAINTENANCE trong PostgreSQL');

    // Khôi phục lại trạng thái OCCUPIED cho roomOccupied để tiếp tục test gán phòng
    await prisma.room.update({
      where: { id: roomOccupied.id },
      data: { status: RoomStatus.OCCUPIED },
    });

    // -------------------------------------------------------------------------
    // BƯỚC 6: KIỂM THỬ GÁN PHÒNG CƯ DÂN PUT /api/apartments/residents/:id/room
    // -------------------------------------------------------------------------
    console.log('\n🔑 BƯỚC 6: Kiểm thử Gán & Chuyển phòng cư dân trên PostgreSQL thật:');

    // 6.1 RBAC trên endpoint gán phòng
    const unauthAssign = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      body: { roomId: roomVacant.id },
    });
    assert(unauthAssign.statusCode === 401, 'Gán phòng: Từ chối khi không có token (401 Unauthorized)');

    const techAssign = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      token: techToken,
      body: { roomId: roomVacant.id },
    });
    assert(techAssign.statusCode === 403, 'Gán phòng: Chặn Thợ kỹ thuật (403 Forbidden)');

    const resSelfAssign = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      token: residentToken,
      body: { roomId: roomVacant.id },
    });
    assert(resSelfAssign.statusCode === 403, 'Gán phòng: Chặn Cư dân tự gán phòng (403 Forbidden)');

    // 6.2 Chặn gán vào phòng MAINTENANCE
    const assignMaintFail = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      token: bqlToken,
      body: { roomId: roomMaint.id },
    });
    assert(assignMaintFail.statusCode === 400, 'Gán phòng: Chặn gán cư dân vào phòng đang bảo trì (400 Bad Request)');

    // 6.3 Gán phòng cho cư dân CHƯA DUYỆT (residentUser2)
    const assignUnapprovedRes = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      token: bqlToken,
      body: { roomId: roomVacant.id, isApproved: true, role: 'ADMIN' }, // Mass assignment
    });
    assert(assignUnapprovedRes.statusCode === 200, 'Gán phòng cho cư dân chưa duyệt thành công (200 OK)');
    assert(assignUnapprovedRes.body?.data?.roomId === roomVacant.id, 'User nhận đúng roomId');
    assert(assignUnapprovedRes.body?.data?.isApproved === false, 'KHÔNG tự ý duyệt tài khoản (isApproved vẫn false)');
    assert(assignUnapprovedRes.body?.data?.role === Role.RESIDENT, 'CHỐNG MASS ASSIGNMENT: role giữ nguyên');

    // Kiểm tra trong database: phòng vẫn phải giữ nguyên VACANT
    const dbVacantAfterAssign = await prisma.room.findUnique({ where: { id: roomVacant.id } });
    assert(
      dbVacantAfterAssign?.status === RoomStatus.VACANT,
      'Phòng vẫn giữ trạng thái VACANT vì cư dân được gán chưa được phê duyệt'
    );

    // 6.4 Gán trùng phòng hiện tại -> Idempotent
    const sameRoomAssignRes = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/room`,
      token: bqlToken,
      body: { roomId: roomVacant.id },
    });
    assert(sameRoomAssignRes.statusCode === 200, 'Gán trùng phòng hiện tại hành xử Idempotent (200 OK)');

    // 6.5 Chuyển phòng cho cư dân ĐÃ DUYỆT (residentUser từ roomOccupied sang phòng mới)
    // Tạo thêm 1 phòng trống thứ 2 để chuyển cư dân đã duyệt vào
    const targetRoom = await prisma.room.create({
      data: {
        roomNumber: `R-TGT-${RUN_KEY}`,
        floor: 12,
        area: 95.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(targetRoom.id);

    const transferApprovedRes = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser.id}/room`,
      token: adminToken,
      body: { roomId: targetRoom.id },
    });
    assert(transferApprovedRes.statusCode === 200, 'Chuyển phòng cho cư dân đã duyệt thành công (200 OK)');
    assert(transferApprovedRes.body?.data?.roomId === targetRoom.id, 'Cư dân được cập nhật sang phòng đích');

    // Kiểm tra tính nhất quán trạng thái phòng trong PostgreSQL sau khi chuyển
    const [dbOldRoom, dbNewRoom] = await Promise.all([
      prisma.room.findUnique({ where: { id: roomOccupied.id } }),
      prisma.room.findUnique({ where: { id: targetRoom.id } }),
    ]);

    assert(
      dbNewRoom?.status === RoomStatus.OCCUPIED,
      'Phòng đích chuyển sang OCCUPIED khi cư dân đã duyệt được chuyển vào'
    );
    assert(
      dbOldRoom?.status === RoomStatus.VACANT,
      'Phòng cũ tự động chuyển sang VACANT vì không còn cư dân nào đã duyệt cư trú'
    );

    // -------------------------------------------------------------------------
    // BƯỚC 7: KIỂM THỬ ĐỒNG BỘ TRẠNG THÁI PHÒNG KHI DUYỆT CƯ DÂN (APPROVAL SYNC)
    // -------------------------------------------------------------------------
    console.log('\n📝 BƯỚC 7: Kiểm thử Duyệt cư dân & Đồng bộ Room Status trên PostgreSQL thật:');

    // Hiện tại residentUser2 đang gắn vào roomVacant (vốn đang VACANT) và có isApproved = false
    // Thực hiện duyệt cư dân qua Canonical route PUT /api/apartments/residents/:id/approve
    const approveSyncRes = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentUser2.id}/approve`,
      token: bqlToken,
    });
    assert(approveSyncRes.statusCode === 200, 'Duyệt cư dân thành công qua Canonical route (200 OK)');
    assert(approveSyncRes.body?.data?.isApproved === true, 'Cư dân được cập nhật isApproved = true');

    // Kiểm tra trạng thái phòng roomVacant trong PostgreSQL: Phải tự động chuyển từ VACANT sang OCCUPIED
    const dbRoomVacantAfterApprove = await prisma.room.findUnique({ where: { id: roomVacant.id } });
    assert(
      dbRoomVacantAfterApprove?.status === RoomStatus.OCCUPIED,
      'TRANSACTION SYNC: Phòng tự động chuyển từ VACANT sang OCCUPIED khi cư dân đầu tiên được duyệt'
    );

    // Kiểm thử chặn duyệt khi phòng đang ở trạng thái MAINTENANCE
    const residentInMaint = await prisma.user.create({
      data: {
        username: `res_mnt_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Resident In Maintenance',
        role: Role.RESIDENT,
        roomId: roomMaint.id,
        isApproved: false,
      },
    });
    tracker.trackUser(residentInMaint.id);

    const approveMaintFail = await invokeApi({
      method: 'PUT',
      url: `/api/apartments/residents/${residentInMaint.id}/approve`,
      token: bqlToken,
    });
    assert(
      approveMaintFail.statusCode === 400,
      'Chặn duyệt cư dân khi căn hộ đang trong trạng thái MAINTENANCE (400 Bad Request)'
    );

    // Kiểm tra Compatibility Alias route: PUT /api/admin/users/:id/approve
    // Tạo 1 cư dân pending mới gắn vào phòng OCCUPIED sẵn
    const residentForAlias = await prisma.user.create({
      data: {
        username: `res_als_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Resident For Alias',
        role: Role.RESIDENT,
        roomId: roomVacant.id, // roomVacant hiện đã OCCUPIED
        isApproved: false,
      },
    });
    tracker.trackUser(residentForAlias.id);

    const approveAliasRes = await invokeApi({
      method: 'PUT',
      url: `/api/admin/users/${residentForAlias.id}/approve`,
      token: adminToken,
    });
    assert(
      approveAliasRes.statusCode === 200,
      'Duyệt cư dân qua Compatibility Alias (/admin/users/:id/approve) thành công (200 OK)'
    );
    assert(approveAliasRes.body?.data?.isApproved === true, 'Cư dân được cập nhật isApproved = true qua Alias');

    // -------------------------------------------------------------------------
    // BƯỚC 8: KIỂM THỬ XỬ LÝ CONCURRENCY & RACE CONDITIONS TRÊN POSTGRESQL THẬT
    // -------------------------------------------------------------------------
    console.log('\n⚡ BƯỚC 8: Kiểm thử Concurrency & Race Conditions trên PostgreSQL thật:');

    // 8.1 CONCURRENCY TEST 1: Hai cư dân đã duyệt cùng lúc chuyển khỏi một phòng
    // Invariant: Khi cả 2 cư dân chuyển đi, phòng cũ bắt buộc phải chuyển về VACANT (không bị kẹt OCCUPIED)
    const concurRoomSrc = await prisma.room.create({
      data: {
        roomNumber: `R-CSRC-${RUN_KEY}`,
        floor: 20,
        area: 90.0,
        status: RoomStatus.OCCUPIED,
      },
    });
    tracker.trackRoom(concurRoomSrc.id);

    const concurRoomDst1 = await prisma.room.create({
      data: {
        roomNumber: `R-CDST1-${RUN_KEY}`,
        floor: 21,
        area: 75.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(concurRoomDst1.id);

    const concurRoomDst2 = await prisma.room.create({
      data: {
        roomNumber: `R-CDST2-${RUN_KEY}`,
        floor: 21,
        area: 80.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(concurRoomDst2.id);

    const concurRes1 = await prisma.user.create({
      data: {
        username: `cres1_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Concurrent Resident 1',
        role: Role.RESIDENT,
        roomId: concurRoomSrc.id,
        isApproved: true,
      },
    });
    tracker.trackUser(concurRes1.id);

    const concurRes2 = await prisma.user.create({
      data: {
        username: `cres2_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Concurrent Resident 2',
        role: Role.RESIDENT,
        roomId: concurRoomSrc.id,
        isApproved: true,
      },
    });
    tracker.trackUser(concurRes2.id);

    // Gửi 2 request chuyển phòng đồng thời qua Promise.all
    const [cTransferRes1, cTransferRes2] = await Promise.all([
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurRes1.id}/room`,
        token: adminToken,
        body: { roomId: concurRoomDst1.id },
      }),
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurRes2.id}/room`,
        token: adminToken,
        body: { roomId: concurRoomDst2.id },
      }),
    ]);

    assert(cTransferRes1.statusCode === 200, 'Concurrent Transfer 1: Thành công (200 OK)');
    assert(cTransferRes2.statusCode === 200, 'Concurrent Transfer 2: Thành công (200 OK)');

    // Kiểm tra tính nhất quán cuối cùng trực tiếp từ PostgreSQL
    const [dbSrcAfter, dbDst1After, dbDst2After] = await Promise.all([
      prisma.room.findUnique({ where: { id: concurRoomSrc.id } }),
      prisma.room.findUnique({ where: { id: concurRoomDst1.id } }),
      prisma.room.findUnique({ where: { id: concurRoomDst2.id } }),
    ]);

    assert(dbDst1After?.status === RoomStatus.OCCUPIED, 'Concurrent: Phòng đích 1 chuyển thành OCCUPIED');
    assert(dbDst2After?.status === RoomStatus.OCCUPIED, 'Concurrent: Phòng đích 2 chuyển thành OCCUPIED');
    assert(
      dbSrcAfter?.status === RoomStatus.VACANT,
      'INVARIANT CONCURRENCY: Phòng cũ tự động chuyển thành VACANT khi 2 cư dân chuyển đi cùng lúc'
    );

    // 8.2 CONCURRENCY TEST 2: Request chuyển phòng sang VACANT chạy đồng thời với Duyệt cư dân vào phòng
    // Invariant: Không bao giờ cho phép phòng có cư dân đã duyệt mà lại ở trạng thái VACANT
    const concurRoomVac = await prisma.room.create({
      data: {
        roomNumber: `R-CVAC-${RUN_KEY}`,
        floor: 22,
        area: 70.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(concurRoomVac.id);

    const concurResPending = await prisma.user.create({
      data: {
        username: `cres_pend_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Concurrent Resident Pending',
        role: Role.RESIDENT,
        roomId: concurRoomVac.id,
        isApproved: false,
      },
    });
    tracker.trackUser(concurResPending.id);

    const [cVacantReq, cApproveReq] = await Promise.all([
      invokeApi({
        method: 'PUT',
        url: `/api/rooms/${concurRoomVac.id}`,
        token: bqlToken,
        body: { status: RoomStatus.VACANT },
      }),
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurResPending.id}/approve`,
        token: bqlToken,
      }),
    ]);

    assert(cApproveReq.statusCode === 200, 'Concurrent Approve: Phê duyệt cư dân thành công (200 OK)');
    assert(
      cVacantReq.statusCode === 200 || cVacantReq.statusCode === 400,
      `Concurrent PUT VACANT: HTTP ${cVacantReq.statusCode} an toàn (200 OK nếu hoàn tất trước duyệt hoặc 400 Bad Request nếu duyệt hoàn tất trước), không lỗi 500`
    );

    // Kiểm tra trực tiếp PostgreSQL: Nếu cư dân đã được duyệt, phòng BẮT BUỘC phải là OCCUPIED
    const dbVacFinal = await prisma.room.findUnique({ where: { id: concurRoomVac.id } });
    const dbUserFinal = await prisma.user.findUnique({ where: { id: concurResPending.id } });

    assert(dbUserFinal?.isApproved === true, 'Cư dân đã được phê duyệt trong PostgreSQL');
    assert(
      dbVacFinal?.status === RoomStatus.OCCUPIED,
      'INVARIANT CONCURRENCY: Phòng bắt buộc là OCCUPIED khi có cư dân đã duyệt, không bị ghi đè thành VACANT'
    );

    // 8.3 CONCURRENCY TEST 3: Hai request cùng chuyển cư dân vào một phòng đích
    const concurRoomTarget = await prisma.room.create({
      data: {
        roomNumber: `R-CTGT-${RUN_KEY}`,
        floor: 23,
        area: 85.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(concurRoomTarget.id);

    const [cDstRes1, cDstRes2] = await Promise.all([
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurRes1.id}/room`,
        token: adminToken,
        body: { roomId: concurRoomTarget.id },
      }),
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurRes2.id}/room`,
        token: adminToken,
        body: { roomId: concurRoomTarget.id },
      }),
    ]);

    assert(cDstRes1.statusCode === 200 && cDstRes2.statusCode === 200, 'Concurrent Transfer to same room: Cả 2 thành công');

    const [dbTargetFinal, countInTarget] = await Promise.all([
      prisma.room.findUnique({ where: { id: concurRoomTarget.id } }),
      prisma.user.count({ where: { roomId: concurRoomTarget.id, role: Role.RESIDENT, isApproved: true } }),
    ]);

    assert(dbTargetFinal?.status === RoomStatus.OCCUPIED, 'Phòng đích có trạng thái OCCUPIED');
    assert(countInTarget === 2, 'Cả 2 cư dân đều được lưu vào phòng đích trong PostgreSQL');

    // 8.4 CONCURRENCY TEST 4: Chuyển phòng sang MAINTENANCE chạy đồng thời với gán cư dân vào phòng đó
    // Invariant: Không cho phép gán cư dân vào căn hộ đang trong trạng thái bảo trì MAINTENANCE
    const concurRoomMaint = await prisma.room.create({
      data: {
        roomNumber: `R-CMNT-${RUN_KEY}`,
        floor: 24,
        area: 77.0,
        status: RoomStatus.VACANT,
      },
    });
    tracker.trackRoom(concurRoomMaint.id);

    const concurResMaint = await prisma.user.create({
      data: {
        username: `cres_mnt_${RUN_KEY}`,
        password: defaultHash,
        fullName: 'Concurrent Resident Maintenance Test',
        role: Role.RESIDENT,
        roomId: null,
        isApproved: false,
      },
    });
    tracker.trackUser(concurResMaint.id);

    const [cMaintReq, cAssignReq] = await Promise.all([
      invokeApi({
        method: 'PUT',
        url: `/api/rooms/${concurRoomMaint.id}`,
        token: adminToken,
        body: { status: RoomStatus.MAINTENANCE },
      }),
      invokeApi({
        method: 'PUT',
        url: `/api/apartments/residents/${concurResMaint.id}/room`,
        token: adminToken,
        body: { roomId: concurRoomMaint.id },
      }),
    ]);

    assert(cMaintReq.statusCode === 200, 'Concurrent MAINTENANCE: Cập nhật MAINTENANCE thành công (200 OK)');
    assert(
      cAssignReq.statusCode === 200 || cAssignReq.statusCode === 400,
      `Concurrent Assign vs Maint: HTTP ${cAssignReq.statusCode} hợp lệ (200 nếu xong trước bảo trì, 400 nếu phòng đã vào bảo trì), không phát sinh 500`
    );

    const [dbMaintRoom, dbMaintUser] = await Promise.all([
      prisma.room.findUnique({ where: { id: concurRoomMaint.id } }),
      prisma.user.findUnique({ where: { id: concurResMaint.id } }),
    ]);

    assert(dbMaintRoom?.status === RoomStatus.MAINTENANCE, 'PostgreSQL: Phòng bắt buộc ở trạng thái MAINTENANCE');
    if (cAssignReq.statusCode === 400) {
      assert(dbMaintUser?.roomId === null, 'Nếu gán phòng sau khi bảo trì thì cư dân không bị gán vào phòng');
    } else {
      assert(dbMaintUser?.roomId === concurRoomMaint.id, 'Nếu gán phòng trước khi bảo trì thì cư dân đã nhận phòng');
    }
  } catch (error: any) {
    console.error('❌ Ngoại lệ nghiêm trọng trong quá trình chạy Rooms Integration Tests:', error);
    results.push({ name: 'Exception Handler', passed: false, error: error.message });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ ROOMS INTEGRATION TESTS: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
