// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN MODULE TICKETS
// Chạy bằng: npx ts-node src/modules/tickets/tickets.test.ts
// =========================================================================
import { TicketStatus, Role } from '@prisma/client';
import {
  isValidTicketStatus,
  canTransitionTicketStatus,
  validateTicketInput,
  validateRatingInput,
} from './tickets.validator';
import { isValidMediaUrl, sanitizeMaterials, containsBase64Payload } from '../../common/utils/validation';
import ticketsRouter from './tickets.controller';
import prisma from '../../database/prisma';

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
 * Helper thực thi yêu cầu HTTP trực tiếp qua Express Router và toàn bộ Middleware pipeline
 */
function invokeTicketsRouter(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  baseUrl?: string;
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  params?: Record<string, string>;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    const baseUrl = options.baseUrl || '/api/tickets';
    const req: any = {
      method: options.method,
      url: options.url,
      baseUrl,
      originalUrl: `${baseUrl}${options.url === '/' ? '' : options.url}`,
      headers: options.headers || {},
      user: options.user,
      body: options.body || {},
      query: options.query || {},
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

    (ticketsRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ CHO TICKETS MODULE');
console.log('======================================================\n');

// -------------------------------------------------------------------------
// 1. KIỂM THỬ TÍNH HỢP LỆ CỦA ENUM STATUS
// -------------------------------------------------------------------------
console.log('1. Kiểm thử Enum TicketStatus:');
assert(isValidTicketStatus('PENDING'), 'Nhận diện đúng PENDING');
assert(isValidTicketStatus('ASSIGNED'), 'Nhận diện đúng ASSIGNED');
assert(isValidTicketStatus('IN_PROGRESS'), 'Nhận diện đúng IN_PROGRESS');
assert(isValidTicketStatus('COMPLETED'), 'Nhận diện đúng COMPLETED');
assert(isValidTicketStatus('CLOSED'), 'Nhận diện đúng CLOSED');
assert(!isValidTicketStatus('RESOLVED'), 'Chặn đúng trạng thái lạ "RESOLVED" không có trong Enum');
assert(!isValidTicketStatus(''), 'Chặn chuỗi rỗng');
assert(!isValidTicketStatus(null), 'Chặn null');

// -------------------------------------------------------------------------
// 2. KIỂM THỬ MA TRẬN CHUYỂN TRẠNG THÁI (STATE MACHINE) & PHÂN QUYỀN
// -------------------------------------------------------------------------
console.log('\n2. Kiểm thử Ma trận chuyển trạng thái (State Machine Transitions):');

// PENDING
assert(
  canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.ASSIGNED, Role.BQL).allowed,
  'PENDING -> ASSIGNED: BQL được phép gán việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.ASSIGNED, Role.RESIDENT).allowed,
  'PENDING -> ASSIGNED: Cư dân KHÔNG được tự ý gán việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.COMPLETED, Role.BQL).allowed,
  'PENDING -> COMPLETED: Chặn nhảy cóc trạng thái khi chưa gán thợ'
);
assert(
  canTransitionTicketStatus(TicketStatus.PENDING, TicketStatus.CLOSED, Role.RESIDENT, false, true).allowed,
  'PENDING -> CLOSED: Cư dân tạo phiếu được phép tự hủy phiếu của mình'
);

// ASSIGNED
assert(
  canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.TECHNICIAN, true).allowed,
  'ASSIGNED -> IN_PROGRESS: Thợ được chỉ định được phép nhận việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.TECHNICIAN, false).allowed,
  'ASSIGNED -> IN_PROGRESS: Thợ KHÁC (chưa được gán) KHÔNG được nhận việc'
);
assert(
  !canTransitionTicketStatus(TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS, Role.RESIDENT).allowed,
  'ASSIGNED -> IN_PROGRESS: Cư dân KHÔNG thể tự chuyển thành đang sửa'
);

// IN_PROGRESS
assert(
  canTransitionTicketStatus(TicketStatus.IN_PROGRESS, TicketStatus.COMPLETED, Role.TECHNICIAN, true).allowed,
  'IN_PROGRESS -> COMPLETED: Thợ phụ trách được phép báo đã sửa xong'
);
assert(
  !canTransitionTicketStatus(TicketStatus.IN_PROGRESS, TicketStatus.CLOSED, Role.TECHNICIAN, true).allowed,
  'IN_PROGRESS -> CLOSED: Thợ KHÔNG được tự ý đóng phiếu (phải qua nghiệm thu)'
);

// COMPLETED
assert(
  canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.CLOSED, Role.RESIDENT, false, true).allowed,
  'COMPLETED -> CLOSED: Cư dân tạo phiếu được phép nghiệm thu và đóng phiếu'
);
assert(
  !canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.CLOSED, Role.RESIDENT, false, false).allowed,
  'COMPLETED -> CLOSED: Cư dân KHÁC KHÔNG được nghiệm thu đóng phiếu thay'
);
assert(
  canTransitionTicketStatus(TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS, Role.RESIDENT, false, true).allowed,
  'COMPLETED -> IN_PROGRESS: Cư dân từ chối nghiệm thu, yêu cầu thợ sửa lại'
);

// CLOSED (Terminal State)
assert(
  !canTransitionTicketStatus(TicketStatus.CLOSED, TicketStatus.PENDING, Role.RESIDENT).allowed,
  'CLOSED -> PENDING: Phiếu đã đóng là trạng thái kết thúc, cư dân không thể mở lại'
);
assert(
  canTransitionTicketStatus(TicketStatus.CLOSED, TicketStatus.IN_PROGRESS, Role.ADMIN).allowed,
  'CLOSED -> IN_PROGRESS: Chỉ Quản trị viên/BQL mới có quyền mở lại sự cố đặc biệt'
);

// -------------------------------------------------------------------------
// 3. KIỂM THỬ XÁC THỰC ĐẦU VÀO & CHỐNG PHÌNH TO DB (ANTI-BLOAT)
// -------------------------------------------------------------------------
console.log('\n3. Kiểm thử Xác thực dữ liệu đầu vào & Chặn Base64:');

// Test URL media
assert(
  isValidMediaUrl('https://res.cloudinary.com/demo/image/upload/sample.jpg'),
  'Chấp nhận URL ảnh Cloudinary hợp lệ'
);
assert(
  isValidMediaUrl('http://s3.ap-southeast-1.amazonaws.com/apartment/door.png'),
  'Chấp nhận URL ảnh AWS S3 hợp lệ'
);
assert(
  !isValidMediaUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=='),
  'Chặn TUYỆT ĐỐI chuỗi ảnh Base64'
);
assert(
  !isValidMediaUrl('javascript:alert(1)'),
  'Chặn URL độc hại javascript:'
);
assert(!isValidMediaUrl(''), 'Chặn chuỗi URL rỗng');

// Test Ticket Input
const validTicket = {
  category: 'Điện',
  description: 'Bóng đèn hành lang tầng 3 bị nhấp nháy liên tục',
  mediaUrl: 'https://cloudinary.com/sample.jpg',
};
assert(validateTicketInput(validTicket).isValid, 'Dữ liệu phiếu hợp lệ được thông qua');

const emptyCategoryTicket = {
  category: '   ',
  description: 'Bóng đèn bị cháy',
};
assert(!validateTicketInput(emptyCategoryTicket).isValid, 'Chặn phiếu thiếu danh mục category');

const shortDescriptionTicket = {
  category: 'Nước',
  description: 'Rò',
};
assert(!validateTicketInput(shortDescriptionTicket).isValid, 'Chặn mô tả quá ngắn (< 5 ký tự)');

const base64Ticket = {
  category: 'Nước',
  description: 'Vỡ ống nước bồn rửa mặt',
  mediaUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD...',
};
assert(!validateTicketInput(base64Ticket).isValid, 'Chặn phiếu gửi kèm ảnh Base64');

// Test Materials Input
assert(
  sanitizeMaterials('Đã thay 01 Aptomat Panasonic 32A và 2m dây điện CADIVI').isValid,
  'Kê khai vật tư hợp lệ'
);
assert(
  !sanitizeMaterials('Vật tư kèm ảnh: data:image/png;base64,iVBORw0KGgoAAA...').isValid,
  'Chặn kê khai vật tư có nhúng Base64'
);
assert(
  !sanitizeMaterials('A'.repeat(2500)).isValid,
  'Chặn kê khai vật tư vượt quá 2000 ký tự'
);

// Test Rating Input
assert(validateRatingInput(5, 'Thợ nhiệt tình, sửa chữa rất nhanh!').isValid, 'Chấp nhận đánh giá 5 sao hợp lệ');
assert(validateRatingInput(1, 'Đến muộn').isValid, 'Chấp nhận đánh giá 1 sao hợp lệ');
assert(!validateRatingInput(0).isValid, 'Chặn đánh giá 0 sao');
assert(!validateRatingInput(6).isValid, 'Chặn đánh giá 6 sao');
assert(!validateRatingInput(3.5).isValid, 'Chặn đánh giá số thập phân');
assert(!validateRatingInput('năm sao').isValid, 'Chặn đánh giá chuỗi không phải số');

// Chặn URL media quá dài (> 1000 ký tự)
assert(
  !isValidMediaUrl('https://example.com/' + 'a'.repeat(1050)),
  'Chặn URL media quá dài (> 1000 ký tự) để chống DoS/Tràn bộ nhớ'
);

// -------------------------------------------------------------------------
// 4. KIỂM THỬ BẢO MẬT XÁC THỰC (AUTHENTICATION & RBAC SECURITY GATE)
// -------------------------------------------------------------------------
console.log('\n4. Kiểm thử Bảo mật Xác thực (Security Gate & Privilege Escalation Prevention):');
import jwt from 'jsonwebtoken';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

// Test 4.1: JWT hợp lệ được giải mã chính xác
const validToken = jwt.sign({ id: 10, role: Role.RESIDENT, roomId: 101 }, JWT_SECRET, { expiresIn: '1h' });
const mockReqValid: any = { headers: { authorization: `Bearer ${validToken}` } };
const mockRes: any = {
  statusCode: 200,
  status(code: number) { this.statusCode = code; return this; },
  json(data: any) { this.body = data; return this; }
};
let nextCalled = false;
extractUser(mockReqValid, mockRes, () => { nextCalled = true; });
assert(nextCalled && mockReqValid.user?.id === 10 && mockReqValid.user?.role === Role.RESIDENT, 'Xác minh chữ ký JWT và trích xuất đúng danh tính');

// Test 4.2: JWT giả mạo chữ ký (tampered token) bị từ chối
nextCalled = false;
const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
const mockReqTampered: any = { headers: { authorization: `Bearer ${tamperedToken}` } };
extractUser(mockReqTampered, mockRes, () => { nextCalled = true; });
assert(nextCalled && !mockReqTampered.user, 'Từ chối token bị giả mạo hoặc sai chữ ký (không cấp req.user)');

// Test 4.3: Chặn TUYỆT ĐỐI header x-user-id / x-user-role khi ở môi trường Production
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
const mockReqProdSpoof: any = {
  headers: {
    'x-user-id': '999',
    'x-user-role': 'ADMIN',
  }
};
nextCalled = false;
extractUser(mockReqProdSpoof, mockRes, () => { nextCalled = true; });
assert(!mockReqProdSpoof.user, 'CHẶN ĐỨNG lỗ hổng giả mạo Header x-user-* khi NODE_ENV=production');
process.env.NODE_ENV = originalEnv; // Phục hồi môi trường

// Test 4.4: requireAuth từ chối request ẩn danh (401 Unauthorized)
const mockReqAnonymous: any = { headers: {} };
let authBlocked = false;
const mockRes401: any = {
  status(code: number) {
    if (code === 401) authBlocked = true;
    return this;
  },
  json() { return this; }
};
requireAuth(mockReqAnonymous, mockRes401, () => {});
assert(authBlocked, 'requireAuth trả về 401 Unauthorized khi không có phiên đăng nhập');

// Test 4.5: requireRoles chặn sai vai trò (403 Forbidden)
let roleForbidden = false;
const mockRes403: any = {
  status(code: number) {
    if (code === 403) roleForbidden = true;
    return this;
  },
  json() { return this; }
};
const mockReqResident: any = { user: { id: 10, role: Role.RESIDENT } };
requireRoles(Role.ADMIN, Role.BQL)(mockReqResident, mockRes403, () => {});
assert(roleForbidden, 'requireRoles trả về 403 Forbidden khi Cư dân cố truy cập API gán việc của BQL');

// Test 4.6: Chặn header x-user-* ở dev nếu không có cấu hình tường minh ALLOW_DEV_AUTH_HEADERS=true
const prevAllow = process.env.ALLOW_DEV_AUTH_HEADERS;
delete process.env.ALLOW_DEV_AUTH_HEADERS;
const prevNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const mockReqDevUnconfigured: any = {
  headers: {
    'x-user-id': '888',
    'x-user-role': 'RESIDENT',
  }
};
extractUser(mockReqDevUnconfigured, mockRes, () => {});
assert(!mockReqDevUnconfigured.user, 'Chặn header x-user-* ở dev khi KHÔNG có cấu hình tường minh ALLOW_DEV_AUTH_HEADERS=true');

process.env.NODE_ENV = prevNodeEnv;
if (prevAllow) process.env.ALLOW_DEV_AUTH_HEADERS = prevAllow;

// Test 4.7: Token hết hạn (TokenExpiredError) bị từ chối
const expiredToken = jwt.sign({ id: 10, role: Role.RESIDENT }, JWT_SECRET, { expiresIn: '-1s' });
const mockReqExpired: any = { headers: { authorization: `Bearer ${expiredToken}` } };
let expiredBlocked = false;
extractUser(mockReqExpired, mockRes, () => {});
const mockResExpired: any = {
  status(code: number) {
    if (code === 401) expiredBlocked = true;
    return this;
  },
  json(body: any) {
    if (body.message?.includes('hết hạn')) expiredBlocked = true;
    return this;
  }
};
requireAuth(mockReqExpired, mockResExpired, () => {});
assert(expiredBlocked, 'Token hết hạn bị từ chối với mã lỗi 401 Unauthorized (Token Expired)');

// Test 4.8: Từ chối khởi động ở Production nếu JWT_SECRET dùng giá trị mặc định không an toàn
import { getJwtSecret } from '../../common/middleware/auth';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'super-secret-jwt-key';
let startupFailed = false;
try {
  getJwtSecret();
} catch (err: any) {
  if (err.message?.includes('FATAL SECURITY ERROR')) {
    startupFailed = true;
  }
}
assert(startupFailed, 'Fail-Fast: Ứng dụng từ chối khởi động ở Production khi JWT_SECRET là giá trị mặc định');
process.env.NODE_ENV = prevNodeEnv; // Phục hồi môi trường
process.env.JWT_SECRET = JWT_SECRET;

async function runAsyncTests() {
  // -------------------------------------------------------------------------
  // 5. KIỂM THỬ HIEU-001 — KIỂM SOÁT ROOMID VÀ PHÂN QUYỀN CĂN HỘ
  // -------------------------------------------------------------------------
  console.log('\n5. Kiểm thử HIEU-001 — Kiểm soát roomId và Phân quyền Căn hộ (POST /api/tickets):');

  let capturedTxQueryRawSQL: any = null;
  let capturedTxQueryRawArg: any = null;
  let capturedCreatedTicketData: any = null;
  let queryRawThrows = false;

  const originalTx = prisma.$transaction;
  const originalUserFindUnique = prisma.user.findUnique;
  const originalRoomFindUnique = prisma.room.findUnique;

  (prisma.user as any).findUnique = async ({ where }: any) => {
    if (where.id === 10) return { id: 10, role: Role.RESIDENT, fullName: 'Cư Dân Có Phòng' };
    if (where.id === 11) return { id: 11, role: Role.RESIDENT, fullName: 'Cư Dân Chưa Phòng' };
    if (where.id === 2) return { id: 2, role: Role.BQL, fullName: 'Ban Quản Lý' };
    return null;
  };

  (prisma.room as any).findUnique = async ({ where }: any) => {
    if (where.id === 101 || where.id === 202) return { id: where.id, roomNumber: `R${where.id}` };
    return null;
  };

  (prisma as any).$transaction = async (callback: any) => {
    const mockTx = {
      $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
        capturedTxQueryRawSQL = strings.join('?');
        capturedTxQueryRawArg = values[0];
        if (queryRawThrows) {
          throw new Error('deadlock detected on advisory lock');
        }
        return [{ locked: 1 }];
      },
      user: {
        findUnique: async (args: any) => prisma.user.findUnique(args),
      },
      room: {
        findUnique: async (args: any) => prisma.room.findUnique(args),
      },
      ticket: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          capturedCreatedTicketData = data;
          return {
            id: 999,
            ...data,
            room: data.roomId ? { id: data.roomId, roomNumber: `R${data.roomId}` } : null,
            resident: { id: data.residentId, fullName: 'Test Resident', phone: '0901234567' },
          };
        },
      },
    };
    return callback(mockTx);
  };

  // 5.1 Cư dân chưa gán phòng cố chỉ định roomId của phòng khác -> 403 Forbidden
  const resNoRoomSpoof = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 11, role: Role.RESIDENT, roomId: null },
    body: { category: 'Điện-H1.1', description: 'Bóng đèn hành lang bị cháy', roomId: 101 },
  });
  assert(
    resNoRoomSpoof.statusCode === 403 && resNoRoomSpoof.body?.message?.includes('chưa được gán căn hộ'),
    'HIEU-001.1: Cư dân chưa gán phòng cố chỉ định roomId phòng khác bị từ chối (403 Forbidden)'
  );

  // 5.2 Cư dân có phòng (101) cố gửi roomId phòng khác (202) -> 403 Forbidden
  const resWithRoomSpoof = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Điện-H1.2', description: 'Bóng đèn phòng ngủ bị cháy', roomId: 202 },
  });
  assert(
    resWithRoomSpoof.statusCode === 403 && resWithRoomSpoof.body?.message?.includes('chỉ có quyền báo sự cố cho căn hộ của mình'),
    'HIEU-001.2: Cư dân có phòng cố gửi roomId căn hộ khác bị từ chối (403 Forbidden)'
  );

  // 5.3 Cư dân gửi roomId không hợp lệ (số âm) -> 400 Bad Request
  const resInvalidRoom = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Điện-H1.3', description: 'Bóng đèn bị chập chờn', roomId: -99 },
  });
  assert(resInvalidRoom.statusCode === 400, 'HIEU-001.3: Cư dân gửi roomId không hợp lệ bị từ chối (400 Bad Request)');

  // 5.4 Cư dân có phòng gửi đúng phòng được gán (101) -> 201 Created
  const resValidMyRoom = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Điện-H1.4', description: 'Bóng đèn phòng khách chập chờn', roomId: 101 },
  });
  assert(
    resValidMyRoom.statusCode === 201 && capturedCreatedTicketData?.roomId === 101,
    'HIEU-001.4: Cư dân gửi đúng phòng được gán được chấp nhận và gán đúng roomId (201 Created)'
  );

  // 5.5 Cư dân có phòng gửi roomId: null báo khu vực chung -> 201 Created
  const resCommonArea = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Nước-H1.5', description: 'Vỡ đường ống nước sảnh tầng 1', roomId: null },
  });
  assert(
    resCommonArea.statusCode === 201 && capturedCreatedTicketData?.roomId === null,
    'HIEU-001.5: Cư dân có phòng gửi roomId: null báo khu vực chung thành công (roomId = null)'
  );

  // 5.6 Cư dân có phòng KHÔNG gửi trường roomId (omitted / undefined) -> mặc định phòng của cư dân
  const resOmittedRoom = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Internet-H1.6', description: 'Mạng internet phòng khách bị ngắt' },
  });
  assert(
    resOmittedRoom.statusCode === 201 && capturedCreatedTicketData?.roomId === 101,
    'HIEU-001.6: Cư dân không gửi roomId được tự động gán phòng mặc định của cư dân (201 Created)'
  );

  // 5.7 Cư dân chưa có phòng gửi báo khu vực chung (roomId: null hoặc không gửi) -> 201 Created
  const resNoRoomCommon = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 11, role: Role.RESIDENT, roomId: null },
    body: { category: 'ThangMáy-H1.7', description: 'Thang máy số 2 phát tiếng kêu lạ', roomId: null },
  });
  assert(
    resNoRoomCommon.statusCode === 201 && capturedCreatedTicketData?.roomId === null,
    'HIEU-001.7: Cư dân chưa gán phòng báo sự cố khu vực chung thành công (roomId = null)'
  );

  // 5.8 BQL tạo phiếu hộ cư dân chỉ định residentId và roomId -> 201 Created
  const resBqlCreate = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 2, role: Role.BQL },
    body: { category: 'Điện-H1.8', description: 'BQL lập phiếu hộ cư dân phòng 202', residentId: 10, roomId: 202 },
  });
  assert(
    resBqlCreate.statusCode === 201 && capturedCreatedTicketData?.residentId === 10 && capturedCreatedTicketData?.roomId === 202,
    'HIEU-001.8: Ban quản lý tạo phiếu hộ cư dân với residentId và roomId chỉ định thành công'
  );

  // -------------------------------------------------------------------------
  // 6. KIỂM THỬ HIEU-002 — ĐIỀU KIỆN LỌC ROUTE ALIAS /api/technician/tickets & RBAC
  // -------------------------------------------------------------------------
  console.log('\n6. Kiểm thử HIEU-002 — Điều kiện lọc route alias /api/technician/tickets & RBAC:');

  let capturedFindManyWhere: any = null;
  const originalFindMany = prisma.ticket.findMany;
  const originalCount = prisma.ticket.count;

  (prisma.ticket as any).count = async () => 1;
  (prisma.ticket as any).findMany = async (args: any) => {
    capturedFindManyWhere = args?.where;
    return [{ id: 1, title: 'Phiếu kiểm thử', status: TicketStatus.PENDING }];
  };

  // 6.1 Cư dân truy cập /api/technician/tickets -> 403 Forbidden
  const resResidentAlias = await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/technician/tickets',
    user: { id: 10, role: Role.RESIDENT },
  });
  assert(
    resResidentAlias.statusCode === 403 && resResidentAlias.body?.message?.includes('Cư dân không có quyền'),
    'HIEU-002.1: Cư dân bị từ chối truy cập route alias của thợ /api/technician/tickets (403 Forbidden)'
  );

  // 6.2 Cư dân truy cập /api/tickets?residentId=99 -> where.residentId === 10
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/tickets',
    user: { id: 10, role: Role.RESIDENT },
    query: { residentId: '99' },
  });
  assert(
    capturedFindManyWhere?.residentId === 10,
    'HIEU-002.2: Cư dân truy cập /api/tickets bị ép chặt theo residentId của mình, phớt lờ query (Anti-IDOR)'
  );

  // 6.3 Thợ kỹ thuật truy cập /api/technician/tickets?technicianId=99 -> where.technicianId === 20
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/technician/tickets',
    user: { id: 20, role: Role.TECHNICIAN },
    query: { technicianId: '99' },
  });
  assert(
    capturedFindManyWhere?.technicianId === 20,
    'HIEU-002.3: Thợ kỹ thuật truy cập route alias luôn bị giới hạn theo ID của mình, không thể tự nâng quyền'
  );

  // 6.4 Admin truy vấn /api/technician/tickets?technicianId=5 -> where.technicianId === 5
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/technician/tickets',
    user: { id: 1, role: Role.ADMIN },
    query: { technicianId: '5' },
  });
  assert(
    capturedFindManyWhere?.technicianId === 5,
    'HIEU-002.4: Admin truy vấn /api/technician/tickets?technicianId=5 nhận danh sách theo đúng bộ lọc thợ'
  );

  // 6.5 BQL truy vấn /api/technician/tickets?technicianId=7 -> where.technicianId === 7
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/technician/tickets',
    user: { id: 2, role: Role.BQL },
    query: { technicianId: '7' },
  });
  assert(
    capturedFindManyWhere?.technicianId === 7,
    'HIEU-002.5: BQL truy vấn /api/technician/tickets?technicianId=7 nhận danh sách theo đúng bộ lọc thợ'
  );

  // 6.6 Admin truy vấn /api/tickets?technicianId=5 -> where.technicianId === 5
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/tickets',
    user: { id: 1, role: Role.ADMIN },
    query: { technicianId: '5' },
  });
  assert(
    capturedFindManyWhere?.technicianId === 5,
    'HIEU-002.6: Admin truy vấn /api/tickets?technicianId=5 nhận danh sách lọc theo thợ chính xác'
  );

  // 6.7 BQL truy vấn /api/tickets?residentId=15 -> where.residentId === 15
  await invokeTicketsRouter({
    method: 'GET',
    url: '/',
    baseUrl: '/api/tickets',
    user: { id: 2, role: Role.BQL },
    query: { residentId: '15' },
  });
  assert(
    capturedFindManyWhere?.residentId === 15,
    'HIEU-002.7: BQL truy vấn /api/tickets?residentId=15 nhận danh sách lọc theo cư dân chính xác'
  );

  // -------------------------------------------------------------------------
  // 7. KIỂM THỬ HIEU-004 — THỰC THI ADVISORY LOCK QUA $queryRaw & XỬ LÝ LỖI
  // -------------------------------------------------------------------------
  console.log('\n7. Kiểm thử HIEU-004 — Thực thi Advisory Lock qua $queryRaw & Xử lý Lỗi Đồng thời:');

  // 7.1 Xác minh câu lệnh parameterized query $queryRaw và lockKey bigint
  queryRawThrows = false;
  capturedTxQueryRawSQL = null;
  capturedTxQueryRawArg = null;
  const resLockSuccess = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Khóa-H4.1', description: 'Kiểm tra câu lệnh advisory lock tham số hóa' },
  });
  assert(
    resLockSuccess.statusCode === 201 &&
    capturedTxQueryRawSQL?.includes('SELECT 1 AS locked') &&
    capturedTxQueryRawSQL?.includes('pg_advisory_xact_lock') &&
    capturedTxQueryRawSQL?.includes('::bigint') &&
    typeof capturedTxQueryRawArg === 'bigint',
    'HIEU-004.1: Sử dụng $queryRaw bọc ngoài SELECT 1 AS locked với tagged template và tham số bigint an toàn'
  );

  // 7.2 Khi lấy lock thất bại (deadlock/db error) -> Transaction rollback, trả về 409 Conflict, không nuốt lỗi
  queryRawThrows = true;
  capturedCreatedTicketData = null;
  const resLockFail = await invokeTicketsRouter({
    method: 'POST',
    url: '/',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
    body: { category: 'Khóa-H4.2', description: 'Kiểm tra xử lý lỗi khi lấy advisory lock thất bại' },
  });
  assert(
    resLockFail.statusCode === 409 &&
    resLockFail.body?.message?.includes('yêu cầu báo sự cố tương tự') &&
    capturedCreatedTicketData === null,
    'HIEU-004.2: Khi advisory lock thất bại, controller ném LOCK_FAILED, trả về HTTP 409 Conflict và không tạo ticket'
  );

  // Phục hồi nguyên trạng các stub
  (prisma as any).$transaction = originalTx;
  (prisma.user as any).findUnique = originalUserFindUnique;
  (prisma.room as any).findUnique = originalRoomFindUnique;
  (prisma.ticket as any).findMany = originalFindMany;
  (prisma.ticket as any).count = originalCount;
}

runAsyncTests()
  .then(() => {
    console.log('\n======================================================');
    console.log(`📊 TỔNG KẾT KIỂM THỬ TICKETS: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
    console.log('======================================================\n');

    if (failCount > 0) {
      process.exit(1);
    } else {
      console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ TICKETS ĐÃ VƯỢT QUA XUẤT SẮC!\n');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.error('Lỗi kiểm thử bất đồng bộ:', err);
    process.exit(1);
  });
