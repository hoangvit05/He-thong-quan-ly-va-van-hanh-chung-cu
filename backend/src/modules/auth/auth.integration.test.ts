// =========================================================================
// PHÂN HỆ AUTHENTICATION — INTEGRATION TESTS (POSTGRESQL 16 THẬT)
// Phụ trách: Senior Backend Engineer
// Mục tiêu: Kiểm thử tích hợp thực tế qua Express Router & Middleware với database PostgreSQL thật
// =========================================================================
import jwt from 'jsonwebtoken';
import { Role, Prisma } from '@prisma/client';
import authRouter from './auth.controller';
import { hashPassword, comparePassword } from '../../common/utils/security';
import { getJwtSecret } from '../../common/middleware/auth';
import { ResourceTracker } from '../../test/integration-setup';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

/**
 * Dispatch HTTP request trực tiếp qua Express Router và chuỗi Middleware (extractUser, requireAuth)
 */
function invokeAuth(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  token?: string;
  body?: any;
}): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;

    const headers: Record<string, string> = {};
    if (options.token) {
      headers['authorization'] = `Bearer ${options.token}`;
    }

    const req: any = {
      method: options.method,
      url: options.url,
      originalUrl: `/api/auth${options.url}`,
      headers,
      body: options.body || {},
      query: {},
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

    (authRouter as any).handle(req, res, (err: any) => {
      if (err) {
        resolve({ statusCode: 500, body: { error: err.message } });
      } else {
        resolve({ statusCode: 404, body: { message: 'Not found' } });
      }
    });
  });
}

/**
 * Hàm thực thi toàn bộ suite Auth Integration Tests
 */
export async function runAuthIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('------------------------------------------------------');
  console.log('🧪 BẮT ĐẦU CHẠY AUTH INTEGRATION TESTS TRÊN POSTGRESQL THẬT');
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

  // Khởi tạo tiền tố định danh duy nhất cho phiên test để chống xung đột
  const RUN_KEY = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

  let approvedUser: any = null;
  let unapprovedUser: any = null;
  let testRoom: any = null;
  let authToken = '';

  try {
    // -----------------------------------------------------------------------
    // BƯỚC 0: TẠO DỮ LIỆU FIXTURE CẦN THIẾT TRÊN POSTGRESQL THẬT
    // -----------------------------------------------------------------------
    console.log('1. Khởi tạo Fixtures trên PostgreSQL test (có đăng ký Tracker):');

    testRoom = await prisma.room.create({
      data: {
        roomNumber: `INTG_${RUN_KEY}_101`,
        floor: 1,
        area: 72.5,
        status: 'OCCUPIED',
      },
    });
    tracker.trackRoom(testRoom.id);
    console.log(`  -> Đã tạo Phòng test (ID: ${testRoom.id}, Số phòng: ${testRoom.roomNumber})`);

    const initialPasswordPlain = 'TestResident@123';
    const initialHashedPassword = await hashPassword(initialPasswordPlain);

    // Cư dân 1: Đã duyệt (isApproved = true)
    approvedUser = await prisma.user.create({
      data: {
        username: `res_app_${RUN_KEY}`,
        password: initialHashedPassword,
        fullName: 'Nguyễn Văn Cư Dân Test',
        email: `res_app_${RUN_KEY}@building.test`,
        phone: '0988112233',
        role: Role.RESIDENT,
        roomId: testRoom.id,
        isApproved: true,
      },
    });
    tracker.trackUser(approvedUser.id);
    console.log(`  -> Đã tạo Cư dân đã duyệt (ID: ${approvedUser.id}, Username: ${approvedUser.username})`);

    // Cư dân 2: Chưa duyệt (isApproved = false)
    unapprovedUser = await prisma.user.create({
      data: {
        username: `res_unapp_${RUN_KEY}`,
        password: initialHashedPassword,
        fullName: 'Trần Cư Dân Chưa Duyệt',
        email: `res_unapp_${RUN_KEY}@building.test`,
        phone: '0988445566',
        role: Role.RESIDENT,
        roomId: testRoom.id,
        isApproved: false,
      },
    });
    tracker.trackUser(unapprovedUser.id);
    console.log(`  -> Đã tạo Cư dân chưa duyệt (ID: ${unapprovedUser.id}, Username: ${unapprovedUser.username})\n`);

    // -----------------------------------------------------------------------
    // TEST 1: ĐĂNG NHẬP THÀNH CÔNG VỚI TÀI KHOẢN ĐÃ DUYỆT (AUTH-INT-01)
    // -----------------------------------------------------------------------
    console.log('2. Kiểm thử luồng Đăng nhập (POST /api/auth/login):');

    const loginRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: {
        identifier: approvedUser.username,
        password: initialPasswordPlain,
      },
    });

    assert(loginRes.statusCode === 200, 'AUTH-INT-01: Cư dân đã duyệt đăng nhập thành công (HTTP 200)');
    assert(Boolean(loginRes.body?.data?.token), 'AUTH-INT-01: Phản hồi chứa JWT Token ký thật');
    assert(loginRes.body?.data?.user?.isApproved === true, 'AUTH-INT-01: Trạng thái isApproved trả về true');
    assert(loginRes.body?.data?.user?.password === undefined, 'AUTH-INT-01: Phản hồi tuyệt đối không lộ password hash');

    authToken = loginRes.body?.data?.token || '';
    if (authToken) {
      const decoded = jwt.verify(authToken, getJwtSecret()) as any;
      assert(
        decoded.id === approvedUser.id && decoded.role === Role.RESIDENT && decoded.roomId === testRoom.id,
        'AUTH-INT-01: Claims trong JWT Token khớp chính xác dữ liệu bảng User và Room trong PostgreSQL'
      );
    }

    // -----------------------------------------------------------------------
    // TEST 2: ĐĂNG NHẬP BỊ TỪ CHỐI VỚI TÀI KHOẢN CHƯA DUYỆT (AUTH-INT-02)
    // -----------------------------------------------------------------------
    const unapprovedLoginRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: {
        identifier: unapprovedUser.username,
        password: initialPasswordPlain,
      },
    });

    assert(unapprovedLoginRes.statusCode === 403, 'AUTH-INT-02: Cư dân chưa duyệt bị từ chối với HTTP 403 Forbidden');
    assert(
      unapprovedLoginRes.body?.message?.includes('chờ Ban quản lý phê duyệt'),
      'AUTH-INT-02: Thông báo chờ BQL phê duyệt rõ ràng theo đúng nghiệp vụ'
    );
    assert(unapprovedLoginRes.body?.data === null, 'AUTH-INT-02: Dữ liệu token không được cấp');

    // -----------------------------------------------------------------------
    // TEST 3: ĐĂNG NHẬP THẤT BẠI & CHỐNG USER ENUMERATION (AUTH-INT-03)
    // -----------------------------------------------------------------------
    const wrongPassRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: {
        identifier: approvedUser.username,
        password: 'IncorrectPassword@999',
      },
    });
    assert(wrongPassRes.statusCode === 401, 'AUTH-INT-03: Sai mật khẩu trả về HTTP 401 Unauthorized');

    const nonExistentRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: {
        identifier: `non_existent_${RUN_KEY}`,
        password: 'AnyPassword@123',
      },
    });
    assert(nonExistentRes.statusCode === 401, 'AUTH-INT-03: Tài khoản không tồn tại trả về HTTP 401 Unauthorized');
    assert(
      wrongPassRes.body?.message === nonExistentRes.body?.message &&
      wrongPassRes.body?.message === 'Tên đăng nhập hoặc mật khẩu không chính xác.',
      'AUTH-INT-03: Thông báo lỗi tài khoản không tồn tại và sai mật khẩu đồng nhất 100% (Anti-Enumeration)'
    );

    // -----------------------------------------------------------------------
    // TEST 4: XEM HỒ SƠ CÁ NHÂN VỚI TOKEN THẬT QUA POSTGRESQL (AUTH-INT-04)
    // -----------------------------------------------------------------------
    console.log('\n3. Kiểm thử Xem Hồ sơ cá nhân (GET /api/auth/me):');

    const meRes = await invokeAuth({
      method: 'GET',
      url: '/me',
      token: authToken,
    });

    assert(meRes.statusCode === 200, 'AUTH-INT-04: Lấy thông tin cá nhân thành công với Bearer Token (HTTP 200)');
    assert(meRes.body?.data?.username === approvedUser.username, 'AUTH-INT-04: Đúng username người dùng');
    assert(meRes.body?.data?.room?.roomNumber === testRoom.roomNumber, 'AUTH-INT-04: Thông tin phòng nạp chuẩn xác từ quan hệ Room trong PostgreSQL');
    assert(meRes.body?.data?.password === undefined, 'AUTH-INT-04: Tuyệt đối không chứa trường password trong dữ liệu trả về');

    // -----------------------------------------------------------------------
    // TEST 5: ĐỔI MẬT KHẨU & XÁC MINH CẬP NHẬT TRỰC TIẾP TRÊN POSTGRESQL (AUTH-INT-05)
    // -----------------------------------------------------------------------
    console.log('\n4. Kiểm thử Đổi mật khẩu & Tính toàn vẹn Database (POST /api/auth/change-password):');

    const newPasswordPlain = 'BrandNewSecurePass@999';

    const changePassRes = await invokeAuth({
      method: 'POST',
      url: '/change-password',
      token: authToken,
      body: {
        currentPassword: initialPasswordPlain,
        newPassword: newPasswordPlain,
        confirmPassword: newPasswordPlain,
      },
    });

    assert(changePassRes.statusCode === 200, 'AUTH-INT-05: Đổi mật khẩu thành công qua API (HTTP 200)');

    // Truy vấn trực tiếp vào PostgreSQL để kiểm chứng hash đã thực sự thay đổi
    const userInDbAfterChange = await prisma.user.findUnique({
      where: { id: approvedUser.id },
    });

    assert(Boolean(userInDbAfterChange), 'AUTH-INT-05: Truy vấn được bản ghi User trong PostgreSQL');
    assert(
      await comparePassword(newPasswordPlain, userInDbAfterChange.password),
      'AUTH-INT-05: Mật khẩu mới được băm Bcrypt và lưu trữ an toàn trong bảng User trên PostgreSQL thật'
    );
    assert(
      !(await comparePassword(initialPasswordPlain, userInDbAfterChange.password)),
      'AUTH-INT-05: Mật khẩu cũ không còn khớp với chuỗi hash trong database'
    );

    // Xác nhận đăng nhập lại: mật khẩu cũ bị từ chối, mật khẩu mới thành công
    const loginOldPassRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: { identifier: approvedUser.username, password: initialPasswordPlain },
    });
    assert(loginOldPassRes.statusCode === 401, 'AUTH-INT-05: Mật khẩu cũ bị từ chối sau khi đổi (HTTP 401)');

    const loginNewPassRes = await invokeAuth({
      method: 'POST',
      url: '/login',
      body: { identifier: approvedUser.username, password: newPasswordPlain },
    });
    assert(loginNewPassRes.statusCode === 200, 'AUTH-INT-05: Đăng nhập thành công với mật khẩu mới trên database thật (HTTP 200)');

    // -----------------------------------------------------------------------
    // TEST 6: RÀNG BUỘC UNIQUE CỦA POSTGRESQL BẰNG PRISMA TRỰC TIẾP (AUTH-INT-06)
    // -----------------------------------------------------------------------
    console.log('\n5. Kiểm thử Ràng buộc Toàn vẹn Dữ liệu PostgreSQL (@unique constraint):');

    let duplicateThrown = false;
    let prismaErrorCode = '';
    try {
      await prisma.user.create({
        data: {
          username: approvedUser.username, // Trùng lặp username đã có
          password: initialHashedPassword,
          fullName: 'Tài Khoản Trùng Lặp',
          role: Role.RESIDENT,
        },
      });
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        duplicateThrown = true;
        prismaErrorCode = err.code;
      }
    }

    assert(
      duplicateThrown && prismaErrorCode === 'P2002',
      'AUTH-INT-06: PostgreSQL ném lỗi P2002 (Unique constraint failed) khi cố tình tạo trùng username'
    );
  } finally {
    // Không cleanup ở đây; cleanup được Runner quản lý tập trung trong khối finally của tiến trình
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n------------------------------------------------------');
  console.log(`📊 KẾT QUẢ AUTH INTEGRATION: ${passed} ĐẠT (PASS) | ${failed} THẤT BẠI (FAIL)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed };
}
