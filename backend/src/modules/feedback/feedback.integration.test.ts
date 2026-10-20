// =========================================================================
// PHÂN HỆ HÒM THƯ GÓP Ý & PHẢN HỒI (FEEDBACK MODULE) — INTEGRATION TESTS
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế phân hệ Feedback trên PostgreSQL 16 thật:
//           CRUD & Validation, Phân quyền vai trò (RBAC), Cô lập căn hộ (Room Isolation),
//           Chống tấn công IDOR & Anti-Enumeration (404 policy), BQL phản hồi (Reply),
//           Cập nhật trạng thái giải quyết (isResolved), và Chống tiêm dữ liệu (Data Tampering).
// =========================================================================
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import feedbackRouter from './feedback.controller';
import { getJwtSecret } from '../../common/middleware/auth';
import { ResourceTracker } from '../../test/integration-setup';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Dispatch HTTP request trực tiếp qua Express Router và chuỗi Middleware thực tế (extractUser, requireAuth, requireRoles)
 */
function invokeFeedback(options: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  token?: string;
  body?: any;
  query?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    const headers: Record<string, string> = {};
    if (options.token) {
      headers['authorization'] = `Bearer ${options.token}`;
    }

    const normalizedUrl = options.url ? (options.url.startsWith('/') ? options.url : `/${options.url}`) : '/';

    const req: any = {
      method: options.method,
      url: normalizedUrl,
      originalUrl: `/api/feedback${normalizedUrl === '/' ? '' : normalizedUrl}`,
      baseUrl: '/api/feedback',
      headers,
      body: options.body || {},
      query: options.query || {},
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
    };

    (feedbackRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

/**
 * Tạo token JWT chuẩn với chữ ký HS256 thật cho người dùng test
 */
function createAuthToken(user: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }): string {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      roomId: user.roomId || null,
    },
    getJwtSecret(),
    { expiresIn: '1d', algorithm: 'HS256' }
  );
}

/**
 * Hàm thực thi toàn bộ suite Feedback Integration Tests
 */
export async function runFeedbackIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY FEEDBACK INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
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

  // Khởi tạo RUN_KEY duy nhất chống xung đột
  const RUN_KEY = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  try {
    // -----------------------------------------------------------------------
    // BƯỚC 0: TẠO DỮ LIỆU FIXTURE CĂN HỘ & NGƯỜI DÙNG
    // -----------------------------------------------------------------------
    console.log('1. Khởi tạo Fixtures Căn hộ, Cư dân, BQL và Thợ kỹ thuật:');

    // Phòng 1
    const room1 = await prisma.room.create({
      data: {
        roomNumber: `FDB_${RUN_KEY}_101`,
        floor: 1,
        area: 70.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(room1.id);

    // Phòng 2 (Dùng cho kiểm thử cách ly Room Isolation & Anti-IDOR)
    const room2 = await prisma.room.create({
      data: {
        roomNumber: `FDB_${RUN_KEY}_202`,
        floor: 2,
        area: 80.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(room2.id);

    // Ban Quản Lý (BQL)
    const bqlUser = await prisma.user.create({
      data: {
        username: `bql_fdb_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Trưởng Ban Quản Lý Test',
        email: `bql_fdb_${RUN_KEY}@building.test`,
        role: Role.BQL,
        isApproved: true,
      },
    });
    tracker.trackUser(bqlUser.id);
    const bqlToken = createAuthToken(bqlUser);

    // Thợ kỹ thuật (TECHNICIAN - không có quyền phân hệ phản ánh)
    const techUser = await prisma.user.create({
      data: {
        username: `tech_fdb_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Thợ Kỹ Thuật Test',
        email: `tech_fdb_${RUN_KEY}@building.test`,
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techUser.id);
    const techToken = createAuthToken(techUser);

    // Cư dân 1 (Thuộc Phòng 1)
    const resident1 = await prisma.user.create({
      data: {
        username: `res1_fdb_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 101',
        email: `res1_fdb_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: room1.id,
        isApproved: true,
      },
    });
    tracker.trackUser(resident1.id);
    const resident1Token = createAuthToken(resident1);

    // Cư dân 2 (Thuộc Phòng 2 - Căn hộ độc lập khác)
    const resident2 = await prisma.user.create({
      data: {
        username: `res2_fdb_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 202',
        email: `res2_fdb_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: room2.id,
        isApproved: true,
      },
    });
    tracker.trackUser(resident2.id);
    const resident2Token = createAuthToken(resident2);

    // Cư dân 3 (Chưa được gán phòng: roomId = null)
    const residentNoRoom = await prisma.user.create({
      data: {
        username: `res_noroom_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Chưa Có Phòng',
        email: `res_noroom_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: null,
        isApproved: true,
      },
    });
    tracker.trackUser(residentNoRoom.id);
    const residentNoRoomToken = createAuthToken(residentNoRoom);

    console.log(`  -> Đã tạo 2 Phòng, 1 BQL, 1 Thợ kỹ thuật, và 3 Cư dân test thành công.\n`);

    // -----------------------------------------------------------------------
    // NHÓM A: CRUD VÀ VALIDATION
    // -----------------------------------------------------------------------
    console.log('2. Nhóm A: Kiểm thử CRUD & Xác thực dữ liệu đầu vào:');

    // TC-FDB-01: Cư dân gửi phản ánh hợp lệ kèm căn hộ
    const createRes1 = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: {
        title: 'Tiếng ồn hành lang tầng 1',
        content: 'Trẻ em chạy nhảy gây ồn ào vào giờ nghỉ trưa từ 12h đến 13h30.',
        roomId: room1.id,
      },
    });

    assert(createRes1.statusCode === 201, 'TC-FDB-01: Cư dân gửi phản ánh thành công (HTTP 201 Created)');
    assert(Boolean(createRes1.body?.data?.id), 'TC-FDB-01: Phản hồi trả về ID của phản ánh mới');
    assert(createRes1.body?.data?.isResolved === false, 'TC-FDB-01: Trạng thái khởi tạo mặc định là chưa giải quyết (isResolved = false)');
    assert(createRes1.body?.data?.reply === null, 'TC-FDB-01: Phản hồi của BQL khởi tạo mặc định là null');

    const feedback1Id = createRes1.body?.data?.id;
    if (feedback1Id) {
      tracker.trackFeedback(feedback1Id);
    }

    // Truy vấn trực tiếp PostgreSQL để xác nhận tính toàn vẹn dữ liệu
    const dbFeedback1 = await prisma.feedback.findUnique({
      where: { id: feedback1Id },
      include: { room: true, resident: true },
    });

    assert(Boolean(dbFeedback1), 'TC-FDB-01: Tìm thấy bản ghi Feedback trong PostgreSQL thật');
    assert(dbFeedback1?.title === 'Tiếng ồn hành lang tầng 1', 'TC-FDB-01: Tiêu đề lưu chính xác trong CSDL');
    assert(dbFeedback1?.content === 'Trẻ em chạy nhảy gây ồn ào vào giờ nghỉ trưa từ 12h đến 13h30.', 'TC-FDB-01: Nội dung lưu chính xác');
    assert(dbFeedback1?.roomId === room1.id, 'TC-FDB-01: Khóa ngoại roomId liên kết đúng căn hộ');
    assert(dbFeedback1?.residentId === resident1.id, 'TC-FDB-01: Khóa ngoại residentId liên kết đúng cư dân gửi');
    assert(dbFeedback1?.reply === null, 'TC-FDB-01: Trường reply khởi tạo là null trong CSDL');
    assert(dbFeedback1?.repliedAt === null, 'TC-FDB-01: Trường repliedAt khởi tạo là null trong CSDL');

    // TC-FDB-02: Cư dân đã gán phòng gửi phản ánh bỏ trống roomId -> Tự động nhận roomId của cư dân
    const createCommonRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: {
        title: 'Vệ sinh thang máy chung',
        content: 'Thang máy số 2 cần được khử khuẩn và lau gương sạch sẽ hơn.',
        // Bỏ trống roomId -> controller tự động gán currentUser.roomId
      },
    });
    assert(createCommonRes.statusCode === 201, 'TC-FDB-02: Cư dân gửi phản ánh bỏ trống roomId thành công (HTTP 201 Created)');
    assert(
      createCommonRes.body?.data?.roomId === room1.id,
      'TC-FDB-02: Hệ thống tự động gán roomId của cư dân khi không truyền roomId'
    );
    const commonFeedbackId = createCommonRes.body?.data?.id;
    if (commonFeedbackId) {
      tracker.trackFeedback(commonFeedbackId);
    }

    // TC-FDB-03: Cư dân chưa gán phòng (roomId = null) gửi phản ánh chung tòa nhà
    const noRoomCreateRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: residentNoRoomToken,
      body: {
        title: 'Hòm thư góp ý sảnh chính',
        content: 'Đề nghị đặt thêm cây xanh ở sảnh đón khách tầng G.',
      },
    });
    assert(noRoomCreateRes.statusCode === 201, 'TC-FDB-03: Cư dân chưa gán phòng gửi phản ánh chung thành công (HTTP 201 Created)');
    assert(
      noRoomCreateRes.body?.data?.roomId === null,
      'TC-FDB-03: Phản ánh của cư dân chưa có phòng có roomId = null (khu vực chung tòa nhà)'
    );
    if (noRoomCreateRes.body?.data?.id) {
      tracker.trackFeedback(noRoomCreateRes.body?.data?.id);
    }

    // TC-FDB-04: Từ chối dữ liệu không hợp lệ (Validation)
    const shortTitleRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: { title: 'Hi', content: 'Nội dung phản ánh hợp lệ' },
    });
    assert(shortTitleRes.statusCode === 400, 'TC-FDB-04: Từ chối tiêu đề quá ngắn < 3 ký tự (HTTP 400 Bad Request)');

    const shortContentRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: { title: 'Tiêu đề hợp lệ', content: 'ngắn' },
    });
    assert(shortContentRes.statusCode === 400, 'TC-FDB-04: Từ chối nội dung quá ngắn < 5 ký tự (HTTP 400 Bad Request)');

    const base64ContentRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: {
        title: 'Tiêu đề hợp lệ',
        content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    });
    assert(base64ContentRes.statusCode === 400, 'TC-FDB-04: Chặn chuỗi Base64 trong nội dung phản ánh (HTTP 400 Bad Request)');

    const invalidRoomRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: { title: 'Tiêu đề hợp lệ', content: 'Nội dung hợp lệ', roomId: -10 },
    });
    assert(invalidRoomRes.statusCode === 400, 'TC-FDB-04: Từ chối roomId âm hoặc không hợp lệ (HTTP 400 Bad Request)');

    // TC-FDB-05: Tra cứu ID không tồn tại hoặc sai định dạng
    const nonExistentRes = await invokeFeedback({
      method: 'GET',
      url: '/999999',
      token: bqlToken,
    });
    assert(nonExistentRes.statusCode === 404, 'TC-FDB-05: Tra cứu feedback không tồn tại trả về HTTP 404 Not Found');

    const invalidIdRes = await invokeFeedback({
      method: 'GET',
      url: '/abc_invalid',
      token: bqlToken,
    });
    assert(invalidIdRes.statusCode === 400, 'TC-FDB-05: ID không phải số nguyên dương trả về HTTP 400 Bad Request');

    // -----------------------------------------------------------------------
    // NHÓM B: AUTHENTICATION VÀ PHÂN QUYỀN VAI TRÒ (RBAC)
    // -----------------------------------------------------------------------
    console.log('\n3. Nhóm B: Authentication & Phân quyền vai trò (RBAC):');

    // TC-FDB-06: Không có Bearer token
    const noTokenGetRes = await invokeFeedback({ method: 'GET', url: '/' });
    assert(noTokenGetRes.statusCode === 401, 'TC-FDB-06: GET / từ chối khi không có Bearer token (HTTP 401 Unauthorized)');

    const noTokenPostRes = await invokeFeedback({ method: 'POST', url: '/', body: { title: 'Test', content: 'Test content' } });
    assert(noTokenPostRes.statusCode === 401, 'TC-FDB-06: POST / từ chối khi không có Bearer token (HTTP 401 Unauthorized)');

    // TC-FDB-07: Thợ kỹ thuật bị cấm truy cập phân hệ phản ánh
    const techPostRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: techToken,
      body: { title: 'Thợ phản ánh', content: 'Nội dung thợ phản ánh' },
    });
    assert(techPostRes.statusCode === 403, 'TC-FDB-07: Thợ kỹ thuật bị chặn gửi phản ánh (HTTP 403 Forbidden)');

    const techGetRes = await invokeFeedback({ method: 'GET', url: '/', token: techToken });
    assert(techGetRes.statusCode === 403, 'TC-FDB-07: Thợ kỹ thuật bị chặn truy cập danh sách phản ánh (HTTP 403 Forbidden)');

    const techGetIdRes = await invokeFeedback({ method: 'GET', url: `/${feedback1Id}`, token: techToken });
    assert(techGetIdRes.statusCode === 403, 'TC-FDB-07: Thợ kỹ thuật bị chặn xem chi tiết phản ánh (HTTP 403 Forbidden)');

    const techMyFeedbackRes = await invokeFeedback({ method: 'GET', url: '/my-feedback', token: techToken });
    assert(techMyFeedbackRes.statusCode === 403, 'TC-FDB-07: Thợ kỹ thuật bị chặn xem my-feedback (HTTP 403 Forbidden)');

    // TC-FDB-08: BQL cố tình tự gửi phản ánh qua POST / (chỉ dành cho Cư dân)
    const bqlPostRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: bqlToken,
      body: { title: 'BQL tự gửi', content: 'BQL không được gửi phản ánh qua form cư dân' },
    });
    assert(bqlPostRes.statusCode === 403, 'TC-FDB-08: BQL bị từ chối gửi phản ánh qua form cư dân (HTTP 403 Forbidden)');

    // TC-FDB-09: Cư dân cố tình gọi API trả lời hoặc cập nhật trạng thái của BQL
    const residentReplyRes = await invokeFeedback({
      method: 'POST',
      url: `/${feedback1Id}/reply`,
      token: resident1Token,
      body: { reply: 'Cư dân tự trả lời' },
    });
    assert(residentReplyRes.statusCode === 403, 'TC-FDB-09: Cư dân bị chặn gọi POST /:id/reply (HTTP 403 Forbidden)');

    const residentStatusRes = await invokeFeedback({
      method: 'PATCH',
      url: `/${feedback1Id}/status`,
      token: resident1Token,
      body: { isResolved: true },
    });
    assert(residentStatusRes.statusCode === 403, 'TC-FDB-09: Cư dân bị chặn gọi PATCH /:id/status (HTTP 403 Forbidden)');

    // -----------------------------------------------------------------------
    // NHÓM C: ROOM ISOLATION & CHỐNG TẤN CÔNG IDOR (ANTI-ENUMERATION)
    // -----------------------------------------------------------------------
    console.log('\n4. Nhóm C: Cô lập căn hộ (Room Isolation) & Chống IDOR (Anti-Enumeration):');

    // TC-FDB-10: Cư dân phòng 1 mạo danh gửi phản ánh cho phòng 2
    const fakeRoomRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: {
        title: 'Mạo danh căn hộ khác',
        content: 'Cư dân phòng 101 gửi nhưng khai là phòng 202',
        roomId: room2.id,
      },
    });
    assert(
      fakeRoomRes.statusCode === 403,
      'TC-FDB-10: Cư dân bị chặn gửi phản ánh thay cho căn hộ khác (HTTP 403 Forbidden - Anti Spoofing)'
    );

    // TC-FDB-11: Cư dân chưa gán phòng cố truyền roomId của phòng khác
    const noRoomFakeRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: residentNoRoomToken,
      body: {
        title: 'Cư dân vãng lai báo hỏng phòng 101',
        content: 'Chưa gán phòng nhưng khai là phòng 101',
        roomId: room1.id,
      },
    });
    assert(
      noRoomFakeRes.statusCode === 403,
      'TC-FDB-11: Cư dân chưa gán phòng bị chặn gửi phản ánh cho phòng cụ thể (HTTP 403 Forbidden)'
    );

    // TC-FDB-12: Anti-IDOR & Anti-Enumeration: Cư dân phòng 2 truy cập feedback của Cư dân phòng 1
    // Chính sách bảo mật của controller: Trả về HTTP 404 (giống hệt không tồn tại) để chống dò quét ID
    const resident2SpyRes = await invokeFeedback({
      method: 'GET',
      url: `/${feedback1Id}`,
      token: resident2Token,
    });
    assert(
      resident2SpyRes.statusCode === 404,
      'TC-FDB-12: Cư dân phòng khác truy cập bị trả về HTTP 404 Not Found (Bảo vệ chống IDOR & ID Probing)'
    );
    assert(
      resident2SpyRes.body?.message?.includes('Không tìm thấy phản ánh hoặc bạn không có quyền truy cập'),
      'TC-FDB-12: Thông báo lỗi đồng nhất, không tiết lộ sự tồn tại của bản ghi người khác'
    );

    // TC-FDB-13: Cư dân gọi GET /: Chỉ nhận danh sách phản ánh của chính mình
    const resident1ListRes = await invokeFeedback({
      method: 'GET',
      url: '/',
      token: resident1Token,
    });
    assert(resident1ListRes.statusCode === 200, 'TC-FDB-13: Cư dân lấy danh sách phản ánh thành công (HTTP 200)');
    const allBelongToResident1 = resident1ListRes.body?.data?.every((f: any) => f.residentId === resident1.id);
    assert(allBelongToResident1, 'TC-FDB-13: Danh sách phản ánh TUYỆT ĐỐI chỉ chứa phản ánh do chính cư dân 1 gửi');

    // TC-FDB-14: Cư dân tra cứu GET /my-feedback
    const myFeedbackRes = await invokeFeedback({
      method: 'GET',
      url: '/my-feedback',
      token: resident1Token,
      query: { isResolved: 'false' },
    });
    assert(myFeedbackRes.statusCode === 200, 'TC-FDB-14: Tra cứu /my-feedback với bộ lọc isResolved=false thành công (HTTP 200)');
    assert(
      myFeedbackRes.body?.data?.every((f: any) => f.isResolved === false),
      'TC-FDB-14: Bộ lọc isResolved=false hoạt động chính xác trên PostgreSQL'
    );

    // -----------------------------------------------------------------------
    // NHÓM D: BQL PHẢN HỒI (REPLY) & CẬP NHẬT TRẠNG THÁI GIẢI QUYẾT
    // -----------------------------------------------------------------------
    console.log('\n5. Nhóm D: BQL Phản hồi & Cập nhật trạng thái giải quyết:');

    // TC-FDB-15: BQL trả lời phản ánh (POST /api/feedback/:id/reply)
    const replyRes = await invokeFeedback({
      method: 'POST',
      url: `/${feedback1Id}/reply`,
      token: bqlToken,
      body: {
        reply: 'Ban quản lý đã nhắc nhở các gia đình có trẻ nhỏ giữ yên tĩnh hành lang vào giờ nghỉ trưa.',
      },
    });

    assert(replyRes.statusCode === 200, 'TC-FDB-15: BQL gửi phản hồi cho cư dân thành công (HTTP 200 OK)');
    assert(replyRes.body?.data?.isResolved === true, 'TC-FDB-15: Trạng thái tự động chuyển thành isResolved = true khi BQL trả lời');
    assert(
      replyRes.body?.data?.reply?.includes('Ban quản lý đã nhắc nhở'),
      'TC-FDB-15: Nội dung câu trả lời phản hồi chính xác'
    );
    assert(Boolean(replyRes.body?.data?.repliedAt), 'TC-FDB-15: Trường repliedAt được cập nhật timestamp');

    // Truy vấn trực tiếp PostgreSQL để xác thực ACID Transaction
    const dbFeedbackAfterReply = await prisma.feedback.findUnique({ where: { id: feedback1Id } });
    assert(
      dbFeedbackAfterReply?.reply === 'Ban quản lý đã nhắc nhở các gia đình có trẻ nhỏ giữ yên tĩnh hành lang vào giờ nghỉ trưa.',
      'TC-FDB-15: CSDL lưu chính xác nội dung câu trả lời'
    );
    assert(dbFeedbackAfterReply?.isResolved === true, 'TC-FDB-15: CSDL lưu trạng thái isResolved = true');
    assert(dbFeedbackAfterReply?.repliedAt instanceof Date, 'TC-FDB-15: CSDL lưu đúng kiểu DateTime cho repliedAt');

    // TC-FDB-16: BQL trả lời nhưng chủ động giữ cờ isResolved: false
    const replyUnresolvedRes = await invokeFeedback({
      method: 'PUT',
      url: `/${commonFeedbackId}/reply`,
      token: bqlToken,
      body: {
        reply: 'BQL đã ghi nhận và đang làm việc với đội ngũ tạp vụ ca tối.',
        isResolved: false,
      },
    });

    assert(replyUnresolvedRes.statusCode === 200, 'TC-FDB-16: BQL trả lời qua PUT /:id/reply thành công (HTTP 200)');
    assert(replyUnresolvedRes.body?.data?.isResolved === false, 'TC-FDB-16: Cờ isResolved được giữ false theo yêu cầu của BQL');

    const dbCommonAfterReply = await prisma.feedback.findUnique({ where: { id: commonFeedbackId } });
    assert(dbCommonAfterReply?.isResolved === false, 'TC-FDB-16: CSDL ghi nhận isResolved = false');

    // TC-FDB-17: BQL cập nhật trạng thái độc lập qua PATCH /api/feedback/:id/status
    const patchStatusRes = await invokeFeedback({
      method: 'PATCH',
      url: `/${commonFeedbackId}/status`,
      token: bqlToken,
      body: { isResolved: true },
    });

    assert(patchStatusRes.statusCode === 200, 'TC-FDB-17: BQL cập nhật độc lập trạng thái thành công (HTTP 200)');
    assert(patchStatusRes.body?.data?.isResolved === true, 'TC-FDB-17: Cờ isResolved chuyển thành true');

    const dbCommonPatched = await prisma.feedback.findUnique({ where: { id: commonFeedbackId } });
    assert(dbCommonPatched?.isResolved === true, 'TC-FDB-17: CSDL ghi nhận trạng thái đã giải quyết (true)');

    // TC-FDB-18: BQL thao tác trên ID không tồn tại
    const nonExistentReplyRes = await invokeFeedback({
      method: 'POST',
      url: '/999999/reply',
      token: bqlToken,
      body: { reply: 'Trả lời phản ánh ma' },
    });
    assert(nonExistentReplyRes.statusCode === 404, 'TC-FDB-18: Trả lời phản ánh không tồn tại trả về HTTP 404 Not Found');

    const nonExistentStatusRes = await invokeFeedback({
      method: 'PATCH',
      url: '/999999/status',
      token: bqlToken,
      body: { isResolved: true },
    });
    assert(nonExistentStatusRes.statusCode === 404, 'TC-FDB-18: Cập nhật trạng thái phản ánh không tồn tại trả về HTTP 404 Not Found');

    // -----------------------------------------------------------------------
    // NHÓM E: TÍNH TOÀN VẸN DỮ LIỆU & CHỐNG TIÊM DỮ LIỆU (DATA TAMPERING)
    // -----------------------------------------------------------------------
    console.log('\n6. Nhóm E: Tính toàn vẹn dữ liệu & Chống tiêm dữ liệu (Data Tampering):');

    // TC-FDB-19: Cư dân gửi phản ánh nhưng cố tình tiêm các trường quản trị (reply, isResolved, repliedAt)
    const tamperingRes = await invokeFeedback({
      method: 'POST',
      url: '/',
      token: resident1Token,
      body: {
        title: 'Cố tình tiêm trường quản trị',
        content: 'Cư dân tự điền câu trả lời và tự duyệt đã xong',
        reply: 'BQL đã đồng ý bồi thường 1 tỷ VND',
        isResolved: true,
        repliedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    assert(tamperingRes.statusCode === 201, 'TC-FDB-19: Tạo phản ánh thành công (HTTP 201)');
    const tamperingId = tamperingRes.body?.data?.id;
    if (tamperingId) {
      tracker.trackFeedback(tamperingId);
    }

    // Đọc trực tiếp PostgreSQL kiểm tra các trường bị tiêm có bị controller loại bỏ hoàn toàn
    const dbTampering = await prisma.feedback.findUnique({ where: { id: tamperingId } });
    assert(
      dbTampering?.reply === null,
      'TC-FDB-19: Chống Data Tampering: Trường reply bị ép về null, không bị tiêm nội dung giả mạo'
    );
    assert(
      dbTampering?.isResolved === false,
      'TC-FDB-19: Chống Data Tampering: Trường isResolved bị ép về false, cư dân không thể tự duyệt'
    );
    assert(
      dbTampering?.repliedAt === null,
      'TC-FDB-19: Chống Data Tampering: Trường repliedAt bị ép về null'
    );

    // TC-FDB-20: Xác nhận tính toàn vẹn CSDL: Không phát sinh Notification ma ngoài ý muốn
    const notificationCount = await prisma.notification.count();
    assert(
      notificationCount === 0,
      'TC-FDB-20: Xác minh CSDL: Không phát sinh bản ghi Notification ma ngoài ý muốn (COUNT = 0)'
    );
  } finally {
    // Không cleanup ở đây; cleanup được Runner quản lý tập trung trong khối finally của tiến trình
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ FEEDBACK INTEGRATION: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
