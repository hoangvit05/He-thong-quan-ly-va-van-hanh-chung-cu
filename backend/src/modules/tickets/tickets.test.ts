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

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    failCount++;
  }
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

console.log('\n======================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
console.log('======================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA XUẤT SẮC!\n');
  process.exit(0);
}
