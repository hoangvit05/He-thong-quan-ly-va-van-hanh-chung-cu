// =========================================================================
// PHÂN HỆ QUẢN LÝ SỰ CỐ & BÁO HỎNG (TICKETS MODULE) — INTEGRATION TESTS
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế phân hệ Tickets trên PostgreSQL 16 thật:
//           CRUD & Validation, Phân quyền RBAC, Cô lập căn hộ (Room Isolation),
//           State Machine vòng đời ticket, Kê khai vật tư, Nghiệm thu đánh giá,
//           Thuật toán lọc trùng lặp 24h và chống bấm đúp (Debounce Gate).
// =========================================================================
import jwt from 'jsonwebtoken';
import { Role, TicketStatus } from '@prisma/client';
import ticketsRouter from './tickets.controller';
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
function invokeTickets(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
      originalUrl: `/api/tickets${normalizedUrl === '/' ? '' : normalizedUrl}`,
      baseUrl: '/api/tickets',
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

    (ticketsRouter as any).handle(req, res, (err: any) => {
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
 * Hàm thực thi toàn bộ suite Tickets Integration Tests
 */
export async function runTicketsIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY TICKETS INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
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

    // Phòng 1 (Căn hộ A-101)
    const room1 = await prisma.room.create({
      data: {
        roomNumber: `TCK_${RUN_KEY}_101`,
        floor: 1,
        area: 72.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(room1.id);

    // Phòng 2 (Căn hộ B-202 - Dùng cho kiểm thử cách ly Room Isolation)
    const room2 = await prisma.room.create({
      data: {
        roomNumber: `TCK_${RUN_KEY}_202`,
        floor: 2,
        area: 85.0,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(room2.id);

    // Ban Quản Lý (BQL)
    const bqlUser = await prisma.user.create({
      data: {
        username: `bql_tck_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Trưởng Ban Quản Lý Test',
        email: `bql_tck_${RUN_KEY}@building.test`,
        role: Role.BQL,
        isApproved: true,
      },
    });
    tracker.trackUser(bqlUser.id);
    const bqlToken = createAuthToken(bqlUser);

    // Thợ kỹ thuật 1 (Được phân công)
    const techUser1 = await prisma.user.create({
      data: {
        username: `tech1_tck_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Nguyễn Văn Thợ 1',
        email: `tech1_tck_${RUN_KEY}@building.test`,
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techUser1.id);
    const techToken1 = createAuthToken(techUser1);

    // Thợ kỹ thuật 2 (Không được phân công - Dùng để kiểm thử phân quyền thợ)
    const techUser2 = await prisma.user.create({
      data: {
        username: `tech2_tck_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Trần Văn Thợ 2',
        email: `tech2_tck_${RUN_KEY}@building.test`,
        role: Role.TECHNICIAN,
        isApproved: true,
      },
    });
    tracker.trackUser(techUser2.id);
    const techToken2 = createAuthToken(techUser2);

    // Cư dân 1 (Thuộc Phòng 1)
    const residentUser1 = await prisma.user.create({
      data: {
        username: `res1_tck_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 101',
        email: `res1_tck_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: room1.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser1.id);
    const residentToken1 = createAuthToken(residentUser1);

    // Cư dân 2 (Cùng Phòng 1 - Dùng cho kiểm thử lọc trùng lặp 24h giữa 2 người cùng phòng)
    const residentUser2InRoom1 = await prisma.user.create({
      data: {
        username: `res2_in_r1_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Thứ 2 Phòng 101',
        email: `res2_in_r1_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: room1.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser2InRoom1.id);
    const residentToken2InRoom1 = createAuthToken(residentUser2InRoom1);

    // Cư dân 3 (Thuộc Phòng 2 - Căn hộ khác)
    const residentUser3InRoom2 = await prisma.user.create({
      data: {
        username: `res3_in_r2_${RUN_KEY}`,
        password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        fullName: 'Cư Dân Phòng 202',
        email: `res3_in_r2_${RUN_KEY}@building.test`,
        role: Role.RESIDENT,
        roomId: room2.id,
        isApproved: true,
      },
    });
    tracker.trackUser(residentUser3InRoom2.id);
    const residentToken3InRoom2 = createAuthToken(residentUser3InRoom2);

    console.log(`  -> Đã tạo 2 Phòng, 1 BQL, 2 Thợ kỹ thuật, và 3 Cư dân test thành công.\n`);

    // -----------------------------------------------------------------------
    // NHÓM A: CRUD VÀ VALIDATION
    // -----------------------------------------------------------------------
    console.log('2. Nhóm A: Kiểm thử CRUD & Xác thực dữ liệu đầu vào:');

    // TC-TCK-01: Tạo phiếu hợp lệ
    const createRes1 = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        title: 'Bóng đèn phòng khách chập chờn',
        category: 'Điện',
        description: 'Bóng đèn trần phòng khách bị nhấp nháy liên tục từ tối qua.',
        mediaUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      },
    });

    assert(createRes1.statusCode === 201, 'TC-TCK-01: Cư dân tạo phiếu báo hỏng thành công (HTTP 201 Created)');
    assert(Boolean(createRes1.body?.data?.id), 'TC-TCK-01: Phản hồi trả về ID của phiếu mới');
    assert(createRes1.body?.data?.status === TicketStatus.PENDING, 'TC-TCK-01: Trạng thái khởi tạo mặc định là PENDING');
    assert(createRes1.body?.data?.isDuplicate === false, 'TC-TCK-01: Cờ isDuplicate mặc định là false');

    const ticket1Id = createRes1.body?.data?.id;
    if (ticket1Id) {
      tracker.trackTicket(ticket1Id);
    }

    // Truy vấn trực tiếp PostgreSQL để xác nhận tính toàn vẹn dữ liệu
    const dbTicket1 = await prisma.ticket.findUnique({
      where: { id: ticket1Id },
      include: { room: true, resident: true },
    });

    assert(Boolean(dbTicket1), 'TC-TCK-01: Tìm thấy bản ghi Ticket trong PostgreSQL thật');
    assert(dbTicket1?.title === 'Bóng đèn phòng khách chập chờn', 'TC-TCK-01: Tiêu đề lưu chính xác trong CSDL');
    assert(dbTicket1?.category === 'Điện', 'TC-TCK-01: Danh mục lưu chính xác: Điện');
    assert(dbTicket1?.roomId === room1.id, 'TC-TCK-01: Tự động gán đúng roomId của cư dân tạo phiếu');
    assert(dbTicket1?.residentId === residentUser1.id, 'TC-TCK-01: Tự động gán đúng residentId của người dùng');

    // TC-TCK-02: Từ chối dữ liệu thiếu hoặc không hợp lệ
    const invalidCategoryRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: '', // Danh mục rỗng
        description: 'Mô tả hợp lệ nhưng thiếu danh mục',
      },
    });
    assert(invalidCategoryRes.statusCode === 400, 'TC-TCK-02: Từ chối yêu cầu thiếu category (HTTP 400 Bad Request)');

    const shortDescRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: 'Nước',
        description: 'hỏng', // Dưới 5 ký tự
      },
    });
    assert(shortDescRes.statusCode === 400, 'TC-TCK-02: Từ chối mô tả sự cố quá ngắn < 5 ký tự (HTTP 400 Bad Request)');

    const base64MediaRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: 'Nước',
        description: 'Vòi nước bị rò rỉ tại bồn rửa chén',
        mediaUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    });
    assert(base64MediaRes.statusCode === 400, 'TC-TCK-02: Chặn mã Base64 trong mediaUrl chống phình to CSDL (HTTP 400)');

    // TC-TCK-03: Kiểm tra tra cứu ID không tồn tại
    const nonExistentRes = await invokeTickets({
      method: 'GET',
      url: '/999999',
      token: bqlToken,
    });
    assert(nonExistentRes.statusCode === 404, 'TC-TCK-03: Tra cứu phiếu không tồn tại trả về HTTP 404 Not Found');

    const invalidIdRes = await invokeTickets({
      method: 'GET',
      url: '/abc_not_an_id',
      token: bqlToken,
    });
    assert(invalidIdRes.statusCode === 400, 'TC-TCK-03: ID không phải số nguyên trả về HTTP 400 Bad Request');

    // -----------------------------------------------------------------------
    // NHÓM B: AUTHENTICATION VÀ AUTHORIZATION (RBAC)
    // -----------------------------------------------------------------------
    console.log('\n3. Nhóm B: Authentication & Phân quyền vai trò (RBAC):');

    // TC-TCK-04: Từ chối request không có token
    const noTokenRes = await invokeTickets({
      method: 'GET',
      url: '/',
    });
    assert(noTokenRes.statusCode === 401, 'TC-TCK-04: Từ chối request không có Bearer token (HTTP 401 Unauthorized)');

    // TC-TCK-05: Thợ kỹ thuật không được phép tạo phiếu báo hỏng
    const techCreateRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: techToken1,
      body: {
        category: 'Điện',
        description: 'Thợ cố tình tự tạo phiếu',
      },
    });
    assert(techCreateRes.statusCode === 403, 'TC-TCK-05: Thợ kỹ thuật bị chặn tạo phiếu sự cố (HTTP 403 Forbidden)');

    // TC-TCK-06: Cư dân không có quyền gán việc cho thợ
    const residentAssignRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/assign`,
      token: residentToken1,
      body: { technicianId: techUser1.id },
    });
    assert(residentAssignRes.statusCode === 403, 'TC-TCK-06: Cư dân bị chặn gán việc cho thợ (HTTP 403 Forbidden)');

    // TC-TCK-07: BQL gán việc nhưng chọn nhầm tài khoản Cư dân (không phải TECHNICIAN)
    const invalidTechRoleRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/assign`,
      token: bqlToken,
      body: { technicianId: residentUser1.id },
    });
    assert(
      invalidTechRoleRes.statusCode === 400,
      'TC-TCK-07: Từ chối gán việc nếu tài khoản được chọn không có vai trò TECHNICIAN (HTTP 400 Bad Request)'
    );

    // -----------------------------------------------------------------------
    // NHÓM C: ROOM ISOLATION VÀ CHỐNG TẤN CÔNG IDOR
    // -----------------------------------------------------------------------
    console.log('\n4. Nhóm C: Cô lập căn hộ (Room Isolation) & Chống IDOR:');

    // TC-TCK-08: Cư dân phòng 1 cố tình báo sự cố thay cho phòng 2
    const fakeRoomRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: 'Nước',
        description: 'Báo hỏng thay phòng 202',
        roomId: room2.id, // Phòng của người khác
      },
    });
    assert(
      fakeRoomRes.statusCode === 403,
      'TC-TCK-08: Cư dân bị chặn báo hỏng thay cho căn hộ khác (HTTP 403 Forbidden - Anti Spoofing)'
    );

    // TC-TCK-09: Cư dân phòng 2 cố tình xem chi tiết phiếu của phòng 1
    const spyTicketRes = await invokeTickets({
      method: 'GET',
      url: `/${ticket1Id}`,
      token: residentToken3InRoom2,
    });
    assert(
      spyTicketRes.statusCode === 403,
      'TC-TCK-09: Cư dân căn hộ khác bị chặn xem chi tiết phiếu (HTTP 403 Forbidden - Record-Level Isolation)'
    );

    // TC-TCK-10: Thợ kỹ thuật chưa được phân công cố xem chi tiết phiếu
    const unassignedTechViewRes = await invokeTickets({
      method: 'GET',
      url: `/${ticket1Id}`,
      token: techToken2,
    });
    assert(
      unassignedTechViewRes.statusCode === 403,
      'TC-TCK-10: Thợ kỹ thuật chưa được gán việc bị chặn xem chi tiết phiếu (HTTP 403 Forbidden)'
    );

    // TC-TCK-11: Cư dân tra cứu danh sách phiếu GET /: chỉ nhận đúng danh sách phiếu của mình
    const listRes = await invokeTickets({
      method: 'GET',
      url: '/',
      token: residentToken1,
    });
    assert(listRes.statusCode === 200, 'TC-TCK-11: Lấy danh sách phiếu thành công (HTTP 200)');
    const allBelongToResident1 = listRes.body?.data?.every((t: any) => t.residentId === residentUser1.id);
    assert(allBelongToResident1, 'TC-TCK-11: Danh sách phiếu trả về TUYỆT ĐỐI chỉ chứa phiếu của chính cư dân đó');

    // -----------------------------------------------------------------------
    // NHÓM D: VÒNG ĐỜI TICKET (STATE MACHINE), KÊ KHAI VẬT TƯ & NGHIỆM THU
    // -----------------------------------------------------------------------
    console.log('\n5. Nhóm D: Vòng đời State Machine, Kê khai vật tư & Nghiệm thu:');

    // TC-TCK-12: BQL gán thợ hợp lệ (PENDING -> ASSIGNED)
    const assignSuccessRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/assign`,
      token: bqlToken,
      body: { technicianId: techUser1.id },
    });
    assert(assignSuccessRes.statusCode === 200, 'TC-TCK-12: BQL gán việc cho Thợ 1 thành công (HTTP 200)');
    assert(assignSuccessRes.body?.data?.status === TicketStatus.ASSIGNED, 'TC-TCK-12: Trạng thái chuyển thành ASSIGNED');
    assert(assignSuccessRes.body?.data?.technicianId === techUser1.id, 'TC-TCK-12: Đã lưu technicianId trong CSDL');

    // TC-TCK-13: Thợ khác (Thợ 2) cố chuyển trạng thái IN_PROGRESS -> Bị chặn
    const tech2StartRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/status`,
      token: techToken2,
      body: { status: TicketStatus.IN_PROGRESS },
    });
    assert(tech2StartRes.statusCode === 400, 'TC-TCK-13: Thợ không được phân công bị chặn nhận việc (HTTP 400 Invalid Transition)');

    // TC-TCK-14: Thợ 1 nhận việc hợp lệ (ASSIGNED -> IN_PROGRESS)
    const tech1StartRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/status`,
      token: techToken1,
      body: { status: TicketStatus.IN_PROGRESS },
    });
    assert(tech1StartRes.statusCode === 200, 'TC-TCK-14: Thợ 1 bắt đầu sửa chữa thành công (HTTP 200)');
    assert(tech1StartRes.body?.data?.status === TicketStatus.IN_PROGRESS, 'TC-TCK-14: Trạng thái chuyển thành IN_PROGRESS');

    // TC-TCK-15: Kê khai vật tư thay thế
    // Cư dân cố kê khai vật tư -> Bị chặn
    const residentMaterialRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/materials`,
      token: residentToken1,
      body: { materials: 'Dây điện 5m' },
    });
    assert(residentMaterialRes.statusCode === 403, 'TC-TCK-15: Cư dân bị chặn kê khai vật tư kỹ thuật (HTTP 403 Forbidden)');

    // Thợ 1 kê khai vật tư hợp lệ
    const techMaterialsRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/materials`,
      token: techToken1,
      body: {
        materials: 'Dây điện Cadivi 2.5mm: 3m; Công tắc đôi Panasonic: 1 cái',
      },
    });
    assert(techMaterialsRes.statusCode === 200, 'TC-TCK-15: Thợ 1 kê khai vật tư thành công (HTTP 200)');

    const dbTicketAfterMaterials = await prisma.ticket.findUnique({ where: { id: ticket1Id } });
    assert(
      dbTicketAfterMaterials?.materials?.includes('Cadivi 2.5mm'),
      'TC-TCK-15: Danh mục vật tư được lưu chính xác trong CSDL PostgreSQL'
    );

    // TC-TCK-16: Thợ sửa xong báo hoàn thành (IN_PROGRESS -> COMPLETED)
    const techCompleteRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/status`,
      token: techToken1,
      body: {
        status: TicketStatus.COMPLETED,
        completedMediaUrl: 'https://res.cloudinary.com/demo/image/upload/fixed.jpg',
      },
    });
    assert(techCompleteRes.statusCode === 200, 'TC-TCK-16: Thợ báo hoàn thành sửa chữa thành công (HTTP 200)');
    assert(techCompleteRes.body?.data?.status === TicketStatus.COMPLETED, 'TC-TCK-16: Trạng thái chuyển thành COMPLETED');

    // TC-TCK-17: Cư dân khác (phòng 2) cố nghiệm thu chấm điểm -> Bị chặn
    const spyRateRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/rate`,
      token: residentToken3InRoom2,
      body: { rating: 5, ratingComment: 'Đánh giá trộm' },
    });
    assert(spyRateRes.statusCode === 403, 'TC-TCK-17: Cư dân phòng khác bị chặn nghiệm thu đánh giá (HTTP 403 Forbidden)');

    // TC-TCK-18: Thợ kỹ thuật tự chấm điểm công việc của chính mình -> Bị chặn
    const techSelfRateRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/rate`,
      token: techToken1,
      body: { rating: 5, ratingComment: 'Tự khen mình' },
    });
    assert(techSelfRateRes.statusCode === 403, 'TC-TCK-18: Thợ kỹ thuật bị chặn tự nghiệm thu chấm điểm (HTTP 403 Forbidden)');

    // TC-TCK-19: Cư dân tạo phiếu nghiệm thu và chấm điểm hợp lệ (COMPLETED -> CLOSED)
    const residentRateRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/rate`,
      token: residentToken1,
      body: {
        rating: 5,
        ratingComment: 'Thợ sửa nhanh, lịch sự và dọn dẹp sạch sẽ.',
      },
    });
    assert(residentRateRes.statusCode === 200, 'TC-TCK-19: Cư dân nghiệm thu và chấm điểm thành công (HTTP 200)');
    assert(residentRateRes.body?.data?.status === TicketStatus.CLOSED, 'TC-TCK-19: Phiếu tự động chuyển sang CLOSED');

    const dbTicketClosed = await prisma.ticket.findUnique({ where: { id: ticket1Id } });
    assert(dbTicketClosed?.status === TicketStatus.CLOSED, 'TC-TCK-19: Trạng thái trong CSDL chốt là CLOSED');
    assert(dbTicketClosed?.rating === 5, 'TC-TCK-19: Điểm đánh giá lưu đúng 5 sao trong PostgreSQL');
    assert(
      dbTicketClosed?.ratingComment === 'Thợ sửa nhanh, lịch sự và dọn dẹp sạch sẽ.',
      'TC-TCK-19: Nhận xét đánh giá lưu chuẩn xác'
    );

    // TC-TCK-20: Khóa khi đã CLOSED (Terminal State Locks)
    const assignClosedRes = await invokeTickets({
      method: 'PUT',
      url: `/${ticket1Id}/assign`,
      token: bqlToken,
      body: { technicianId: techUser1.id },
    });
    assert(assignClosedRes.statusCode === 400, 'TC-TCK-20: Từ chối phân công lại khi phiếu đã CLOSED (HTTP 400 Bad Request)');

    const rateAgainRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/rate`,
      token: residentToken1,
      body: { rating: 4 },
    });
    assert(rateAgainRes.statusCode === 400, 'TC-TCK-20: Từ chối nghiệm thu chấm điểm lần 2 khi đã CLOSED (HTTP 400 Bad Request)');

    const materialsClosedRes = await invokeTickets({
      method: 'POST',
      url: `/${ticket1Id}/materials`,
      token: techToken1,
      body: { materials: 'Thêm vật tư sau khi đóng' },
    });
    assert(materialsClosedRes.statusCode === 400, 'TC-TCK-20: Khóa danh mục vật tư không cho sửa khi đã CLOSED (HTTP 400 Bad Request)');

    // -----------------------------------------------------------------------
    // NHÓM E: TÍNH TOÀN VẸN DỮ LIỆU, THUẬT TOÁN LỌC TRÙNG 24H & CHỐNG DOUBLE-CLICK
    // -----------------------------------------------------------------------
    console.log('\n6. Nhóm E: Tính toàn vẹn dữ liệu, Thuật toán lọc trùng 24h & Debounce:');

    // TC-TCK-21: Tạo phiếu ban đầu hạng mục "Nước" cho Phòng 1
    const ticketWater1Res = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: 'Nước',
        description: 'Vòi sen tắm phòng tắm chính bị rỉ nước',
      },
    });
    assert(ticketWater1Res.statusCode === 201, 'TC-TCK-21: Tạo phiếu ban đầu hạng mục Nước thành công (HTTP 201)');
    const ticketWater1Id = ticketWater1Res.body?.data?.id;
    if (ticketWater1Id) {
      tracker.trackTicket(ticketWater1Id);
    }
    assert(ticketWater1Res.body?.data?.isDuplicate === false, 'TC-TCK-21: Phiếu đầu tiên có isDuplicate = false');

    // TC-TCK-22: Chống Double-click (Debounce Gate 5 giây)
    // Cùng cư dân 1 gửi lại ngay lập tức cùng hạng mục Nước
    const doubleClickRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken1,
      body: {
        category: 'Nước',
        description: 'Bấm gửi liên tục lần 2',
      },
    });
    assert(
      doubleClickRes.statusCode === 409,
      'TC-TCK-22: Debounce gate 5s chặn gửi đúp liên tục cùng hạng mục (HTTP 409 Conflict)'
    );

    // TC-TCK-23: Thuật toán lọc trùng lặp 24h trên PostgreSQL
    // Cư dân THỨ HAI (cùng ở Phòng 1) gửi báo hỏng hạng mục Nước trong 24h:
    // Vì residentId khác nên vượt qua Debounce gate của người 1,
    // nhưng Transaction kiểm tra DB phát hiện cùng phòng + cùng category đang PENDING trong 24h qua!
    const duplicateWaterRes = await invokeTickets({
      method: 'POST',
      url: '/',
      token: residentToken2InRoom1,
      body: {
        category: 'Nước',
        description: 'Vòi sen bị rỉ nước (Cư dân thứ 2 trong phòng bấm báo tiếp)',
      },
    });

    assert(duplicateWaterRes.statusCode === 201, 'TC-TCK-23: Tiếp nhận phiếu từ cư dân thứ 2 (HTTP 201 Created)');
    assert(
      duplicateWaterRes.body?.data?.isDuplicate === true,
      'TC-TCK-23: Thuật toán 24h tự động gắn cờ isDuplicate = true cho sự cố trùng lặp cùng phòng'
    );
    assert(
      duplicateWaterRes.body?.message?.includes('sự cố tương tự cùng căn hộ đang được xử lý trong 24h qua'),
      'TC-TCK-23: Thông báo rõ ràng hệ thống đã phát hiện sự cố tương tự đang được xử lý'
    );

    const ticketWater2Id = duplicateWaterRes.body?.data?.id;
    if (ticketWater2Id) {
      tracker.trackTicket(ticketWater2Id);
    }

    const dbTicketWater2 = await prisma.ticket.findUnique({ where: { id: ticketWater2Id } });
    assert(dbTicketWater2?.isDuplicate === true, 'TC-TCK-23: Cờ isDuplicate được lưu bền vững = true trong CSDL');

    // TC-TCK-24: Xác nhận không có bản ghi Notification ma nào được tạo ngoài ý muốn
    const notificationCount = await prisma.notification.count();
    assert(
      notificationCount === 0,
      'TC-TCK-24: Xác minh CSDL: Không phát sinh Notification ma ngoài ý muốn (COUNT = 0)'
    );
  } finally {
    // Không cleanup ở đây; cleanup được Runner quản lý tập trung trong khối finally của tiến trình
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ TICKETS INTEGRATION: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
