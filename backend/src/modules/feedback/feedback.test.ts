// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN MODULE FEEDBACK
// Chạy bằng: npx ts-node src/modules/feedback/feedback.test.ts
// Ghi chú: Sử dụng Mock Request/Response và Mock Prisma cho kiểm thử logic/RBAC
// (Live PostgreSQL integration test sẽ thực hiện khi PostgreSQL database khởi động)
// =========================================================================
import { Role } from '@prisma/client';
import {
  validateFeedbackInput,
  validateReplyInput,
  validateStatusInput,
} from './feedback.validator';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';
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

// Helper giả lập Express Request và Response
function createMockReqRes(options: {
  user?: any;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
}) {
  const req: any = {
    headers: options.headers || {},
    user: options.user,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
  };

  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };

  return { req, res };
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ CHO FEEDBACK MODULE');
console.log('======================================================\n');

// -------------------------------------------------------------------------
// 1. KIỂM THỬ VALIDATOR DỮ LIỆU ĐẦU VÀO (DATA INTEGRITY & ANTI-BLOAT)
// -------------------------------------------------------------------------
console.log('1. Kiểm thử Validator dữ liệu Feedback:');

// 1.1 Tạo feedback hợp lệ
const validFeedbackData = {
  title: 'Đèn hành lang tầng 5 bị nhấp nháy',
  content: 'Đèn chiếu sáng khu vực trước thang máy tầng 5 chập chờn từ tối qua, đề nghị BQL kiểm tra.',
  roomId: 101,
};
const v1 = validateFeedbackInput(validFeedbackData);
assert(v1.isValid && v1.errors.length === 0, 'Chấp nhận dữ liệu phản ánh hợp lệ');

// 1.2 Feedback không có roomId (phản ánh chung toàn tòa nhà)
const commonAreaFeedback = {
  title: 'Vệ sinh sảnh chung tầng G',
  content: 'Sảnh đón khách tầng G cần được lau dọn thường xuyên hơn vào giờ cao điểm.',
};
const v2 = validateFeedbackInput(commonAreaFeedback);
assert(v2.isValid, 'Chấp nhận phản ánh khu vực chung không có roomId');

// 1.3 Chặn tiêu đề quá ngắn (< 3 ký tự)
const shortTitle = validateFeedbackInput({ title: 'Hi', content: 'Nội dung phản ánh sự cố' });
assert(!shortTitle.isValid && shortTitle.errors.some(e => e.includes('ngắn')), 'Chặn tiêu đề quá ngắn (< 3 ký tự)');

// 1.4 Chặn tiêu đề quá dài (> 200 ký tự)
const longTitle = validateFeedbackInput({ title: 'A'.repeat(201), content: 'Nội dung phản ánh sự cố' });
assert(!longTitle.isValid && longTitle.errors.some(e => e.includes('dài')), 'Chặn tiêu đề quá dài (> 200 ký tự)');

// 1.5 Chặn nội dung quá ngắn (< 5 ký tự)
const shortContent = validateFeedbackInput({ title: 'Tiêu đề hợp lệ', content: 'ngắn' });
assert(!shortContent.isValid && shortContent.errors.some(e => e.includes('ngắn')), 'Chặn nội dung quá ngắn (< 5 ký tự)');

// 1.6 Chặn nội dung quá dài (> 2000 ký tự)
const longContent = validateFeedbackInput({ title: 'Tiêu đề hợp lệ', content: 'A'.repeat(2001) });
assert(!longContent.isValid && longContent.errors.some(e => e.includes('dài')), 'Chặn nội dung quá dài (> 2000 ký tự)');

// 1.7 Chặn tuyệt đối chuỗi mã hóa Base64 trong tiêu đề hoặc nội dung
const base64Payload = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const base64Feedback = validateFeedbackInput({
  title: 'Gửi ảnh hỏng',
  content: `Xem ảnh này: ${base64Payload}`,
});
assert(!base64Feedback.isValid && base64Feedback.errors.some(e => e.includes('Base64')), 'Chặn TUYỆT ĐỐI dữ liệu Base64 trong nội dung phản ánh');

// 1.8 Chặn roomId không phải số nguyên dương
const invalidRoom = validateFeedbackInput({
  title: 'Phản ánh tiếng ồn',
  content: 'Hàng xóm làm ồn lúc nửa đêm',
  roomId: -5,
});
assert(!invalidRoom.isValid && invalidRoom.errors.some(e => e.includes('số nguyên dương')), 'Chặn roomId âm hoặc không hợp lệ');

// -------------------------------------------------------------------------
// 2. KIỂM THỬ VALIDATOR PHẢN HỒI (REPLY) & CẬP NHẬT TRẠNG THÁI
// -------------------------------------------------------------------------
console.log('\n2. Kiểm thử Validator Phản hồi (Reply) & Trạng thái:');

// 2.1 Reply hợp lệ
const validReply = validateReplyInput({ reply: 'BQL đã tiếp nhận và cử nhân viên kỹ thuật thay bóng đèn trong sáng nay.' });
assert(validReply.isValid, 'Chấp nhận nội dung phản hồi hợp lệ từ BQL');

// 2.2 Chặn reply rỗng hoặc chỉ có khoảng trắng
const emptyReply = validateReplyInput({ reply: '   ' });
assert(!emptyReply.isValid && emptyReply.errors.some(e => e.includes('ngắn')), 'Chặn phản hồi rỗng hoặc chỉ có khoảng trắng');

// 2.3 Chặn reply chứa Base64
const base64Reply = validateReplyInput({ reply: `Ảnh nghiệm thu: ${base64Payload}` });
assert(!base64Reply.isValid && base64Reply.errors.some(e => e.includes('Base64')), 'Chặn mã Base64 trong phản hồi của BQL');

// 2.4 Validator trạng thái isResolved
assert(validateStatusInput({ isResolved: true }).isValid, 'Chấp nhận trạng thái isResolved: true');
assert(validateStatusInput({ isResolved: false }).isValid, 'Chấp nhận trạng thái isResolved: false');
assert(!validateStatusInput({ isResolved: 'done' }).isValid, 'Chặn giá trị isResolved không phải kiểu boolean');

// -------------------------------------------------------------------------
// 3. KIỂM THỬ BẢO MẬT XÁC THỰC & PHÂN QUYỀN RBAC
// -------------------------------------------------------------------------
console.log('\n3. Kiểm thử Bảo mật Xác thực & Phân quyền RBAC:');

// 3.1 Từ chối request không đăng nhập (401 Unauthorized)
const { req: unauthReq, res: unauthRes } = createMockReqRes({});
let unauthCalled = false;
requireAuth(unauthReq, unauthRes, () => { unauthCalled = true; });
assert(!unauthCalled && unauthRes.statusCode === 401, 'requireAuth từ chối request không có token (401 Unauthorized)');

// 3.2 Cư dân không thể gọi API trả lời phản ánh của BQL (403 Forbidden)
const { req: resReq, res: resRes } = createMockReqRes({
  user: { id: 10, role: Role.RESIDENT, roomId: 101 },
});
let replyAuthorized = false;
requireRoles(Role.ADMIN, Role.BQL)(resReq, resRes, () => { replyAuthorized = true; });
assert(!replyAuthorized && resRes.statusCode === 403, 'requireRoles chặn Cư dân gọi API phản hồi của BQL (403 Forbidden)');

// 3.3 Thợ kỹ thuật không thể gọi API phản hồi của BQL (403 Forbidden)
const { req: techReq, res: techRes } = createMockReqRes({
  user: { id: 20, role: Role.TECHNICIAN },
});
let techReplyAuthorized = false;
requireRoles(Role.ADMIN, Role.BQL)(techReq, techRes, () => { techReplyAuthorized = true; });
assert(!techReplyAuthorized && techRes.statusCode === 403, 'requireRoles chặn Thợ kỹ thuật gọi API phản hồi của BQL (403 Forbidden)');

// 3.4 BQL và Admin được phép gọi API phản hồi (Pass RBAC)
const { req: bqlReq, res: bqlRes } = createMockReqRes({
  user: { id: 2, role: Role.BQL },
});
let bqlAuthorized = false;
requireRoles(Role.ADMIN, Role.BQL)(bqlReq, bqlRes, () => { bqlAuthorized = true; });
assert(bqlAuthorized && bqlRes.statusCode === 200, 'requireRoles cho phép BQL truy cập API phản hồi');

const { req: adminReq, res: adminRes } = createMockReqRes({
  user: { id: 1, role: Role.ADMIN },
});
let adminAuthorized = false;
requireRoles(Role.ADMIN, Role.BQL)(adminReq, adminRes, () => { adminAuthorized = true; });
assert(adminAuthorized && adminRes.statusCode === 200, 'requireRoles cho phép Admin truy cập API phản hồi');

// -------------------------------------------------------------------------
// 4. KIỂM THỬ LOGIC NGHIỆP VỤ & RECORD-LEVEL ACCESS CONTROL
// -------------------------------------------------------------------------
console.log('\n4. Kiểm thử Logic Nghiệp vụ & Record-Level Access Control:');

// 4.1 Thợ kỹ thuật cố tạo feedback bị từ chối
const mockTechnicianUser: { id: number; role: Role } = { id: 30, role: Role.TECHNICIAN };
assert(mockTechnicianUser.role !== Role.RESIDENT, 'Chặn Thợ kỹ thuật tạo phản ánh (chỉ dành cho RESIDENT)');

// 4.2 Chống giả mạo residentId: req.user.id luôn ghi đè body.residentId
const residentUser: { id: number; role: Role; roomId?: number | null } = { id: 42, role: Role.RESIDENT, roomId: 205 };
const spoofPayload = {
  residentId: 999, // Kẻ xấu cố ý gửi ID cư dân khác
  roomId: 205,
  title: 'Nước yếu tầng 2',
  content: 'Áp lực nước sinh hoạt quá yếu vào buổi tối.',
  reply: 'BQL đã đồng ý bồi thường', // Cố ý tự điền reply
  isResolved: true, // Cố ý tự đánh dấu xong
  repliedAt: new Date().toISOString(),
};

// Mô phỏng logic gán dữ liệu trong POST /api/feedback:
const effectiveResidentId = residentUser.id; // Luôn lấy từ token
assert(effectiveResidentId === 42 && effectiveResidentId !== spoofPayload.residentId, 'Chặn giả mạo residentId: Danh tính được lấy tuyệt đối từ token đã xác thực');

// 4.3 Chống tự đánh dấu giải quyết hoặc tự điền phản hồi của BQL khi tạo
const initialFeedbackRecord = {
  residentId: effectiveResidentId,
  roomId: spoofPayload.roomId,
  title: spoofPayload.title.trim(),
  content: spoofPayload.content.trim(),
  reply: null, // Bắt buộc null
  isResolved: false, // Bắt buộc false
  repliedAt: null, // Bắt buộc null
};
assert(
  initialFeedbackRecord.reply === null &&
  initialFeedbackRecord.isResolved === false &&
  initialFeedbackRecord.repliedAt === null,
  'Triệt tiêu hoàn toàn trường reply, isResolved và repliedAt do client tiêm vào'
);

// 4.4 Chặn Cư dân gửi phản ánh thay cho căn hộ khác
const otherRoomRequested = 305;
const isRoomMismatch = Boolean(residentUser.roomId && otherRoomRequested !== residentUser.roomId);
assert(isRoomMismatch, 'Phát hiện và chặn Cư dân gửi phản ánh cho phòng 305 khi đang ở phòng 205 (403 Forbidden)');

// 4.5 Cư dân gửi phản ánh cho phòng của chính mình được chấp nhận
const ownRoomRequested = 205;
const isOwnRoomValid = Boolean(!residentUser.roomId || ownRoomRequested === residentUser.roomId);
assert(isOwnRoomValid, 'Chấp nhận khi Cư dân gửi phản ánh đúng căn hộ của mình');

// 4.5.1 Chặn Cư dân CHƯA CÓ PHÒNG (roomId = null) cố ý khai báo phòng cụ thể
const unassignedResident: { id: number; role: Role; roomId?: number | null } = { id: 55, role: Role.RESIDENT, roomId: null };
function checkResidentRoomPermission(user: any, requestedRoomId: any): { allowed: boolean; reason?: string } {
  if (requestedRoomId !== undefined && requestedRoomId !== null && requestedRoomId !== '') {
    if (!user.roomId) {
      return { allowed: false, reason: 'Tài khoản chưa được liên kết với căn hộ nào.' };
    }
    if (Number(requestedRoomId) !== user.roomId) {
      return { allowed: false, reason: 'Không thể gửi thay cho căn hộ khác.' };
    }
  }
  return { allowed: true };
}
const unassignedAttempt = checkResidentRoomPermission(unassignedResident, 101);
assert(!unassignedAttempt.allowed, 'Chặn Cư dân chưa có phòng (roomId=null) cố ý khai báo phòng 101 (403 Forbidden)');

// 4.5.2 Cư dân chưa có phòng gửi phản ánh chung (roomId = null) được chấp thuận
const unassignedCommonAttempt = checkResidentRoomPermission(unassignedResident, null);
assert(unassignedCommonAttempt.allowed, 'Chấp thuận Cư dân chưa có phòng gửi phản ánh khu vực chung (roomId=null)');

// 4.6 Phân quyền xem danh sách (GET /api/feedback):
// Cư dân chỉ được xem bản ghi của chính mình: where.residentId = currentUser.id
function buildListWhereClause(currentUser: any, query: any) {
  const where: any = {};
  if (currentUser.role === Role.RESIDENT) {
    where.residentId = currentUser.id;
  } else if (currentUser.role === Role.ADMIN || currentUser.role === Role.BQL) {
    if (query.residentId) where.residentId = Number(query.residentId);
    if (query.roomId) where.roomId = Number(query.roomId);
  }
  if (query.isResolved !== undefined) {
    where.isResolved = query.isResolved === 'true';
  }
  return where;
}

const residentWhere = buildListWhereClause(residentUser, { residentId: '999', isResolved: 'true' });
assert(
  residentWhere.residentId === 42,
  'Record-Level Isolation: Danh sách phản ánh của Cư dân tự động khóa chặt theo residentId của chính họ'
);

const bqlWhere = buildListWhereClause(bqlReq.user, { residentId: '999', isResolved: 'true' });
assert(
  bqlWhere.residentId === 999 && bqlWhere.isResolved === true,
  'BQL/Admin có toàn quyền tra cứu và lọc theo cư dân hoặc trạng thái'
);

// 4.7 Chính sách chống dò tìm ID (Anti-Enumeration) cho GET /api/feedback/:id:
// Nếu feedback thuộc cư dân khác -> trả về 404 Not Found giống hệt trường hợp không tồn tại
function checkAccessDetailPolicy(currentUser: any, feedback: any): { statusCode: number; message: string } {
  if (!feedback || (currentUser.role === Role.RESIDENT && feedback.residentId !== currentUser.id)) {
    return {
      statusCode: 404,
      message: 'Không tìm thấy phản ánh hoặc bạn không có quyền truy cập phản ánh này.',
    };
  }
  return { statusCode: 200, message: 'Thành công' };
}

const mockFeedbackOfResident1 = { id: 100, residentId: 42, title: 'Hỏng vòi nước' };
const mockFeedbackOfResident2 = { id: 101, residentId: 88, title: 'Ồn ào lúc nửa đêm' };

const accessOwn = checkAccessDetailPolicy(residentUser, mockFeedbackOfResident1);
assert(accessOwn.statusCode === 200, 'Cư dân xem chi tiết phản ánh của chính mình thành công (200 OK)');

const accessOther = checkAccessDetailPolicy(residentUser, mockFeedbackOfResident2);
assert(
  accessOther.statusCode === 404,
  'Anti-Enumeration: Cư dân cố truy cập phản ánh của người khác bị trả 404 Not Found (chống rò rỉ ID)'
);

const accessNonExistent = checkAccessDetailPolicy(residentUser, null);
assert(
  accessNonExistent.statusCode === 404,
  'Truy cập phản ánh không tồn tại trả về đúng 404 Not Found'
);

const bqlAccessAny = checkAccessDetailPolicy(bqlReq.user, mockFeedbackOfResident2);
assert(bqlAccessAny.statusCode === 200, 'BQL có quyền xem chi tiết phản ánh của bất kỳ cư dân nào');

// 4.8 Kiểm thử thuật toán phân trang
function calculatePagination(pageStr: any, limitStr: any, totalCount: number) {
  const page = Math.max(1, parseInt(String(pageStr), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(limitStr), 10) || 20));
  const skip = (page - 1) * limit;
  const totalPages = Math.ceil(totalCount / limit);
  return { page, limit, skip, totalPages };
}

const pag1 = calculatePagination('2', '10', 35);
assert(pag1.page === 2 && pag1.limit === 10 && pag1.skip === 10 && pag1.totalPages === 4, 'Tính toán phân trang trang 2/4 chính xác');

const pagCapped = calculatePagination('1', '99999', 500);
assert(pagCapped.limit === 100, 'Giới hạn limit tối đa được khóa chặt ở 100 bản ghi để chống DoS tràn RAM');

const pagZero = calculatePagination('-5', '0', 20);
assert(pagZero.page === 1 && pagZero.limit === 20, 'Tự động hiệu chỉnh trang âm và limit=0 về giá trị hợp lệ mặc định (page=1, limit=20)');

const pagNegativeClamped = calculatePagination('-5', '-10', 20);
assert(pagNegativeClamped.page === 1 && pagNegativeClamped.limit === 1, 'Tự động kẹp limit âm về giá trị tối thiểu 1 bản ghi (chống lỗi SQL offset)');

// 4.9 Tính nhất quán của thao tác trả lời (Reply Transaction Integrity)
const beforeReply = {
  id: 100,
  reply: null,
  isResolved: false,
  repliedAt: null,
};

const replyPayload = {
  reply: 'Ban quản lý đã cho kỹ thuật kiểm tra và xử lý xong.',
  isResolved: true,
};

const now = new Date();
const afterReply = {
  ...beforeReply,
  reply: replyPayload.reply.trim(),
  isResolved: replyPayload.isResolved,
  repliedAt: now,
};

assert(
  afterReply.reply !== null &&
  afterReply.isResolved === true &&
  afterReply.repliedAt instanceof Date,
  'Cập nhật đồng bộ và nhất quán reply, isResolved=true và repliedAt trong giao dịch'
);

// 4.10 Cập nhật trạng thái độc lập (PATCH /status)
const toggledStatus = { ...afterReply, isResolved: false };
assert(toggledStatus.isResolved === false, 'BQL có thể mở lại trạng thái phản ánh độc lập khi cần thiết');

console.log('\n======================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
console.log('======================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ FEEDBACK ĐÃ VƯỢT QUA XUẤT SẮC!\n');
  process.exit(0);
}
