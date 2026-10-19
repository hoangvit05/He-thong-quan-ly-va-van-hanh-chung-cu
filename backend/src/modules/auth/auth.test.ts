// =========================================================================
// KIỂM THỬ ĐƠN VỊ & BẢO ĐẢM TÍNH TOÀN VẸN PHÂN HỆ AUTHENTICATION
// Phụ trách: Đặng Hoàng & Hiếu
// Chạy bằng: npx ts-node src/modules/auth/auth.test.ts
// =========================================================================
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import authRouter from './auth.controller';
import { validateLoginInput, validateChangePasswordInput } from './auth.validator';
import { hashPassword, comparePassword } from '../../common/utils/security';
import { getJwtSecret } from '../../common/middleware/auth';
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
 * Helper thực thi yêu cầu HTTP trực tiếp qua Auth Router và chuỗi Middleware
 */
function invokeAuthRouter(options: {
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

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/auth${options.url}`,
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

    (authRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

console.log('\n======================================================');
console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TOÀN DIỆN CHO AUTH MODULE');
console.log('======================================================\n');

async function runAllTests() {
  // -------------------------------------------------------------------------
  // 1. KIỂM THỬ TIỆN ÍCH BĂM MẬT KHẨU & JWT SECRET
  // -------------------------------------------------------------------------
  console.log('1. Kiểm thử Password Hashing (bcryptjs) & JWT Secret:');

  const plain = 'MySecretP@ssw0rd123';
  const hashed = await hashPassword(plain);
  assert(hashed.startsWith('$2a$') || hashed.startsWith('$2b$'), 'Mật khẩu được băm đúng chuẩn thuật toán Bcrypt');
  assert(await comparePassword(plain, hashed), 'So khớp thành công mật khẩu đúng với chuỗi hash');
  assert(!(await comparePassword('WrongPassword', hashed)), 'Từ chối mật khẩu sai khi so khớp');

  // Kiểm tra getJwtSecret
  const secret = getJwtSecret();
  assert(typeof secret === 'string' && secret.length > 0, 'Lấy JWT Secret thành công từ cấu hình');

  // Kiểm tra fail-fast ở môi trường production nếu secret yếu
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'short';
  let failFastThrown = false;
  try {
    getJwtSecret();
  } catch (err: any) {
    if (err.message.includes('FATAL SECURITY ERROR')) failFastThrown = true;
  }
  assert(failFastThrown, 'Fail-fast: Từ chối khởi động ở Production nếu JWT_SECRET ngắn hoặc yếu');
  process.env.NODE_ENV = prevEnv;
  process.env.JWT_SECRET = prevSecret;

  // -------------------------------------------------------------------------
  // 2. KIỂM THỬ VALIDATOR AUTH (validateLoginInput & validateChangePasswordInput)
  // -------------------------------------------------------------------------
  console.log('\n2. Kiểm thử Validation Dữ liệu Auth:');

  // Login Validator
  assert(validateLoginInput({ username: 'admin', password: '123' }).isValid, 'Login Validator chấp nhận username');
  assert(validateLoginInput({ email: 'admin@building.vn', password: '123' }).isValid, 'Login Validator chấp nhận email');
  assert(validateLoginInput({ phone: '0912345678', password: '123' }).isValid, 'Login Validator chấp nhận phone');
  assert(validateLoginInput({ identifier: 'user_01', password: '123' }).isValid, 'Login Validator chấp nhận identifier chung');
  assert(!validateLoginInput({ password: '123' }).isValid, 'Login Validator chặn thiếu tên đăng nhập / định danh');
  assert(!validateLoginInput({ username: 'admin' }).isValid, 'Login Validator chặn thiếu mật khẩu');
  assert(!validateLoginInput({}).isValid, 'Login Validator chặn payload rỗng');
  assert(!validateLoginInput(null).isValid, 'Login Validator chặn null payload');

  // Change Password Validator
  const validChange = validateChangePasswordInput({ currentPassword: 'oldPass123', newPassword: 'newSecurePass456' });
  assert(validChange.isValid, 'Change Password Validator chấp nhận mật khẩu hợp lệ');

  const shortPass = validateChangePasswordInput({ currentPassword: 'oldPass123', newPassword: '123' });
  assert(!shortPass.isValid && shortPass.errors.some(e => e.includes('tối thiểu 6 ký tự')), 'Chặn mật khẩu mới quá ngắn (< 6 ký tự)');

  const samePass = validateChangePasswordInput({ currentPassword: 'samePassword123', newPassword: 'samePassword123' });
  assert(!samePass.isValid && samePass.errors.some(e => e.includes('không được trùng')), 'Chặn mật khẩu mới trùng mật khẩu cũ');

  const mismatchConfirm = validateChangePasswordInput({
    currentPassword: 'oldPass123',
    newPassword: 'newSecurePass456',
    confirmPassword: 'differentPass789',
  });
  assert(!mismatchConfirm.isValid && mismatchConfirm.errors.some(e => e.includes('không khớp')), 'Chặn xác nhận mật khẩu không khớp');

  // -------------------------------------------------------------------------
  // 3. KIỂM THỬ ENDPOINT ĐĂNG NHẬP (POST /api/auth/login)
  // -------------------------------------------------------------------------
  console.log('\n3. Kiểm thử Endpoint Đăng nhập (POST /api/auth/login):');

  const mockAdminPasswordHash = await hashPassword('AdminPass@123');
  const mockResidentPasswordHash = await hashPassword('ResidentPass@123');

  const mockAdminUser = {
    id: 1,
    username: 'admin',
    password: mockAdminPasswordHash,
    fullName: 'Quản trị viên Hệ thống',
    email: 'admin@building.vn',
    phone: '0901112222',
    role: Role.ADMIN,
    roomId: null,
    isApproved: true,
    room: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockApprovedResident = {
    id: 10,
    username: 'resident_101',
    password: mockResidentPasswordHash,
    fullName: 'Nguyễn Văn Cư Dân',
    email: 'resident101@building.vn',
    phone: '0988776655',
    role: Role.RESIDENT,
    roomId: 101,
    isApproved: true,
    room: { id: 101, roomNumber: '101', floor: 1, area: 75.5, status: 'OCCUPIED' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUnapprovedResident = {
    id: 11,
    username: 'resident_unapproved',
    password: mockResidentPasswordHash,
    fullName: 'Trần Cư Dân Mới',
    email: 'newbie@building.vn',
    phone: '0977665544',
    role: Role.RESIDENT,
    roomId: null,
    isApproved: false, // CHƯA DUYỆT
    room: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const originalFindFirst = prisma.user.findFirst;
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;

  // Stub prisma.user.findFirst
  (prisma.user as any).findFirst = async (args: any) => {
    const conditions = args?.where?.OR || [];
    for (const cond of conditions) {
      if (cond.username === 'admin' || cond.email === 'admin@building.vn' || cond.phone === '0901112222') {
        return mockAdminUser;
      }
      if (cond.username === 'resident_101' || cond.email === 'resident101@building.vn' || cond.phone === '0988776655') {
        return mockApprovedResident;
      }
      if (cond.username === 'resident_unapproved' || cond.email === 'newbie@building.vn') {
        return mockUnapprovedResident;
      }
    }
    return null;
  };

  // 3.1 Đăng nhập thành công bằng username
  const loginUsernameRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'admin', password: 'AdminPass@123' },
  });
  assert(loginUsernameRes.statusCode === 200, 'Đăng nhập thành công bằng Username (200 OK)');
  assert(Boolean(loginUsernameRes.body?.data?.token), 'Phản hồi chứa chuỗi JWT Token có chữ ký thật');
  assert(loginUsernameRes.body?.data?.user?.password === undefined, 'Phản hồi KHÔNG làm lộ mật khẩu hoặc password hash');

  // 3.2 Xác minh tính hợp lệ và claims của JWT Token được cấp
  const token = loginUsernameRes.body?.data?.token;
  const decodedToken = jwt.verify(token, getJwtSecret()) as any;
  assert(decodedToken.id === 1 && decodedToken.role === Role.ADMIN, 'Token JWT chứa đúng User ID (1) và Role (ADMIN)');
  assert(decodedToken.exp - decodedToken.iat === 86400, 'Thời hạn Token đúng chuẩn 1 ngày (86,400 giây)');

  // 3.3 Đăng nhập thành công bằng Email
  const loginEmailRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { email: 'admin@building.vn', password: 'AdminPass@123' },
  });
  assert(loginEmailRes.statusCode === 200, 'Đăng nhập thành công bằng Email (200 OK)');

  // 3.4 Đăng nhập thành công bằng Số điện thoại
  const loginPhoneRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { phone: '0901112222', password: 'AdminPass@123' },
  });
  assert(loginPhoneRes.statusCode === 200, 'Đăng nhập thành công bằng Số điện thoại (200 OK)');

  // 3.5 Mật khẩu sai -> 401 Unauthorized
  const wrongPassRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'admin', password: 'WrongPassword' },
  });
  assert(wrongPassRes.statusCode === 401, 'Mật khẩu sai trả về 401 Unauthorized');
  assert(wrongPassRes.body?.message?.includes('không chính xác'), 'Thông báo lỗi xác thực chung, bảo vệ an toàn');

  // 3.6 Tài khoản không tồn tại -> 401 Unauthorized (Anti-Enumeration)
  const notFoundUserRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'non_existent_user', password: 'AnyPassword' },
  });
  assert(notFoundUserRes.statusCode === 401, 'Tài khoản không tồn tại trả về 401 Unauthorized');
  assert(notFoundUserRes.body?.message === wrongPassRes.body?.message, 'Thông báo lỗi tài khoản không tồn tại và mật khẩu sai đồng nhất 100% (chống dò tài khoản)');

  // 3.7 Cư dân chưa được duyệt (isApproved = false) -> 403 Forbidden
  const unapprovedLoginRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'resident_unapproved', password: 'ResidentPass@123' },
  });
  assert(unapprovedLoginRes.statusCode === 403, 'Cư dân chưa được duyệt bị từ chối với 403 Forbidden');
  assert(unapprovedLoginRes.body?.message?.includes('chờ Ban quản lý phê duyệt'), 'Thông báo tài khoản cư dân đang chờ phê duyệt rõ ràng');

  // 3.8 Cư dân đã được duyệt (isApproved = true) đăng nhập thành công
  const approvedLoginRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'resident_101', password: 'ResidentPass@123' },
  });
  assert(approvedLoginRes.statusCode === 200 && approvedLoginRes.body?.data?.user?.roomId === 101, 'Cư dân đã duyệt đăng nhập thành công kèm roomId');

  // 3.9 Chống tấn công Brute-force: 5 lần đăng nhập sai liên tiếp bị khóa với 429 Too Many Requests
  const bruteForceTarget = 'brute_force_victim';
  for (let i = 0; i < 5; i++) {
    await invokeAuthRouter({
      method: 'POST',
      url: '/login',
      body: { username: bruteForceTarget, password: `WrongGuess_${i}` },
    });
  }
  const blockedRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: bruteForceTarget, password: 'AnotherGuess' },
  });
  assert(
    blockedRes.statusCode === 429 && blockedRes.body?.message?.includes('khóa do đăng nhập sai'),
    'Chống Brute-force: Tạm khóa sau 5 lần đăng nhập sai liên tiếp (429 Too Many Requests)'
  );

  // 3.10 Đăng nhập thành công xóa bộ đếm thất bại
  const resetLoginAttemptRes = await invokeAuthRouter({
    method: 'POST',
    url: '/login',
    body: { username: 'admin', password: 'AdminPass@123' },
  });
  assert(resetLoginAttemptRes.statusCode === 200, 'Đăng nhập đúng tài khoản mật khẩu lập tức giải tỏa bộ đếm');

  // -------------------------------------------------------------------------
  // 4. KIỂM THỬ ENDPOINT ĐỔI MẬT KHẨU (POST /api/auth/change-password)
  // -------------------------------------------------------------------------
  console.log('\n4. Kiểm thử Endpoint Đổi mật khẩu (POST /api/auth/change-password):');

  // 4.1 Không có token -> 401 Unauthorized
  const unauthChangeRes = await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    body: { currentPassword: 'AdminPass@123', newPassword: 'NewAdminPass@456' },
  });
  assert(unauthChangeRes.statusCode === 401, 'Đổi mật khẩu từ chối request không có token (401 Unauthorized)');

  // Stub prisma.user.findUnique và update cho change password
  let dbUserPassword = mockAdminPasswordHash;
  (prisma.user as any).findUnique = async (args: any) => {
    if (args?.where?.id === 1) {
      return { ...mockAdminUser, password: dbUserPassword };
    }
    return null;
  };
  (prisma.user as any).update = async (args: any) => {
    dbUserPassword = args.data.password;
    return { ...mockAdminUser, password: dbUserPassword };
  };

  // 4.2 Mật khẩu hiện tại sai -> 400 Bad Request
  const wrongCurrentPassRes = await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    user: { id: 1, role: Role.ADMIN },
    body: { currentPassword: 'IncorrectOldPassword', newPassword: 'NewAdminPass@456' },
  });
  assert(wrongCurrentPassRes.statusCode === 400, 'Đổi mật khẩu từ chối khi mật khẩu hiện tại sai (400 Bad Request)');
  assert(wrongCurrentPassRes.body?.message?.includes('không chính xác'), 'Thông báo mật khẩu hiện tại không chính xác');

  // 4.3 Mật khẩu mới quá ngắn -> 400 Bad Request
  const shortNewPassRes = await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    user: { id: 1, role: Role.ADMIN },
    body: { currentPassword: 'AdminPass@123', newPassword: '123' },
  });
  assert(shortNewPassRes.statusCode === 400, 'Đổi mật khẩu từ chối mật khẩu mới quá ngắn (400 Bad Request)');

  // 4.4 Mật khẩu mới trùng mật khẩu cũ -> 400 Bad Request
  const samePassRes = await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    user: { id: 1, role: Role.ADMIN },
    body: { currentPassword: 'AdminPass@123', newPassword: 'AdminPass@123' },
  });
  assert(samePassRes.statusCode === 400, 'Đổi mật khẩu từ chối khi mật khẩu mới trùng mật khẩu cũ (400 Bad Request)');

  // 4.5 Đổi mật khẩu thành công và hash mới xác minh được
  const successChangeRes = await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    user: { id: 1, role: Role.ADMIN },
    body: { currentPassword: 'AdminPass@123', newPassword: 'BrandNewSecurePass@999' },
  });
  assert(successChangeRes.statusCode === 200, 'Đổi mật khẩu thành công (200 OK)');
  assert(await comparePassword('BrandNewSecurePass@999', dbUserPassword), 'Mật khẩu mới đã được băm an toàn và cập nhật vào Database');
  assert(successChangeRes.body?.data === null, 'Phản hồi đổi mật khẩu không trả về hash');

  // 4.6 Bảo vệ danh tính: Client gửi user ID lạ trong body bị phớt lờ, luôn cập nhật theo req.user.id
  let updatedTargetId = null;
  (prisma.user as any).update = async (args: any) => {
    updatedTargetId = args.where.id;
    return mockAdminUser;
  };
  await invokeAuthRouter({
    method: 'POST',
    url: '/change-password',
    user: { id: 1, role: Role.ADMIN },
    body: { currentPassword: 'BrandNewSecurePass@999', newPassword: 'AnotherNewPass@888', id: 999, userId: 999 },
  });
  assert(updatedTargetId === 1, 'Chống Privilege Escalation: Luôn cập nhật đúng User ID từ token đã xác thực');

  // -------------------------------------------------------------------------
  // 5. KIỂM THỬ ENDPOINT XEM HỒ SƠ CÁ NHÂN (GET /api/auth/me)
  // -------------------------------------------------------------------------
  console.log('\n5. Kiểm thử Endpoint Xem Hồ sơ Cá nhân (GET /api/auth/me):');

  // 5.1 Không có token -> 401 Unauthorized
  const unauthMeRes = await invokeAuthRouter({ method: 'GET', url: '/me' });
  assert(unauthMeRes.statusCode === 401, 'Xem hồ sơ /me từ chối request không có token (401 Unauthorized)');

  // 5.2 Token hợp lệ -> Trả về đúng thông tin user và căn hộ, không lộ password
  (prisma.user as any).findUnique = async (args: any) => {
    if (args?.where?.id === 10) return mockApprovedResident;
    return null;
  };

  const residentMeRes = await invokeAuthRouter({
    method: 'GET',
    url: '/me',
    user: { id: 10, role: Role.RESIDENT, roomId: 101 },
  });
  assert(residentMeRes.statusCode === 200, 'Xem hồ sơ /me thành công với token hợp lệ (200 OK)');
  assert(residentMeRes.body?.data?.username === 'resident_101', 'Trả đúng username của người dùng');
  assert(residentMeRes.body?.data?.room?.roomNumber === '101', 'Trả đúng thông tin căn hộ liên kết');
  assert(residentMeRes.body?.data?.password === undefined, 'Tuyệt đối KHÔNG lộ password hoặc password hash trong /me');

  // 5.3 User không còn tồn tại trong DB -> 404 Not Found
  const notFoundMeRes = await invokeAuthRouter({
    method: 'GET',
    url: '/me',
    user: { id: 9999, role: Role.RESIDENT },
  });
  assert(notFoundMeRes.statusCode === 404, 'User đã bị xóa hoặc không còn trong DB trả về 404 Not Found');

  // Khôi phục Prisma stubs
  (prisma.user as any).findFirst = originalFindFirst;
  (prisma.user as any).findUnique = originalFindUnique;
  (prisma.user as any).update = originalUpdate;

  console.log('\n======================================================');
  console.log(`📊 TỔNG KẾT KIỂM THỬ AUTH: ${passCount} ĐẠT (PASS) | ${failCount} THẤT BẠI (FAIL)`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ AUTH MODULE ĐÃ VƯỢT QUA XUẤT SẮC!\n');
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi ngoại lệ trong quá trình chạy kiểm thử Auth:', err);
  process.exit(1);
});
