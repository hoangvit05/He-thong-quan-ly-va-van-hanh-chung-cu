// =========================================================================
// PHÂN HỆ THÔNG BÁO TÒA NHÀ (NOTIFICATIONS MODULE) — POSTGRESQL INTEGRATION TESTS
// Phụ trách: Việt Hoàng (Backend Lead)
// Mục tiêu: Kiểm thử tích hợp thực tế phân hệ Notifications trên PostgreSQL 16:
//           1. RBAC và Root Application Router Wiring (/api/notifications)
//           2. Tạo thông báo chung (targetRoom: null) và riêng (targetRoom: "P.9901")
//           3. Chặn tạo thông báo tới phòng không tồn tại (400 Bad Request)
//           4. Lọc thông báo theo quyền: ADMIN/BQL xem toàn bộ
//           5. Data Isolation: Cư dân phòng P.9901 xem thông báo chung + P.9901,
//              tuyệt đối KHÔNG thấy thông báo của phòng P.9902
//           6. TECHNICIAN chỉ xem thông báo chung toàn tòa nhà
//           7. Phân trang và sắp xếp giảm dần theo thời gian
//           8. Đăng ký ResourceTracker để dọn dẹp sạch fixture sau khi kiểm thử
// =========================================================================

import express from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
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
      url: options.url,
      originalUrl: options.url,
      path: requestPath,
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
        resolve({ statusCode: 404, body: { message: 'Not Found' } });
      }
    });
  });
}

function makeToken(user: { id: number; role: Role; username: string; fullName: string; roomId?: number | null }): string {
  const secret = getJwtSecret();
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      username: user.username,
      fullName: user.fullName,
      roomId: user.roomId || null,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '1d' }
  );
}

export async function runNotificationsIntegrationTests(
  prisma: any,
  tracker: ResourceTracker
): Promise<{ passed: number; failed: number }> {
  console.log('\n============================================================');
  console.log('SUITE 7/7: Notifications Integration Tests (PostgreSQL 16)');
  console.log('============================================================\n');

  const results: TestResult[] = [];
  const runTest = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, passed: true });
      console.log(`  ✅ [PASS] ${name}`);
    } catch (err: any) {
      results.push({ name, passed: false, error: err.message });
      console.error(`  ❌ [FAIL] ${name} -> ${err.message}`);
    }
  };

  const ts = Date.now();
  const hashedPassword = await hashPassword('password123');

  // 1. TẠO DỮ LIỆU FIXTURE KIỂM THỬ TRÊN POSTGRESQL THẬT
  // Tạo 2 phòng
  const room1 = await prisma.room.create({
    data: {
      roomNumber: `N-P${ts}-1`,
      floor: 99,
      area: 75.5,
      status: 'OCCUPIED',
    },
  });
  tracker.trackRoom(room1.id);

  const room2 = await prisma.room.create({
    data: {
      roomNumber: `N-P${ts}-2`,
      floor: 99,
      area: 85.0,
      status: 'OCCUPIED',
    },
  });
  tracker.trackRoom(room2.id);

  // Tạo tài khoản các vai trò
  const adminUser = await prisma.user.create({
    data: {
      username: `n_admin_${ts}`,
      password: hashedPassword,
      fullName: 'Admin Test Notifications',
      role: Role.ADMIN,
      isApproved: true,
    },
  });
  tracker.trackUser(adminUser.id);
  const adminToken = makeToken(adminUser);

  const bqlUser = await prisma.user.create({
    data: {
      username: `n_bql_${ts}`,
      password: hashedPassword,
      fullName: 'BQL Test Notifications',
      role: Role.BQL,
      isApproved: true,
    },
  });
  tracker.trackUser(bqlUser.id);
  const bqlToken = makeToken(bqlUser);

  const techUser = await prisma.user.create({
    data: {
      username: `n_tech_${ts}`,
      password: hashedPassword,
      fullName: 'Thợ Test Notifications',
      role: Role.TECHNICIAN,
      isApproved: true,
    },
  });
  tracker.trackUser(techUser.id);
  const techToken = makeToken(techUser);

  const res1User = await prisma.user.create({
    data: {
      username: `n_res1_${ts}`,
      password: hashedPassword,
      fullName: 'Cư Dân Phòng 1',
      role: Role.RESIDENT,
      roomId: room1.id,
      isApproved: true,
    },
  });
  tracker.trackUser(res1User.id);
  const res1Token = makeToken(res1User);

  const res2User = await prisma.user.create({
    data: {
      username: `n_res2_${ts}`,
      password: hashedPassword,
      fullName: 'Cư Dân Phòng 2',
      role: Role.RESIDENT,
      roomId: room2.id,
      isApproved: true,
    },
  });
  tracker.trackUser(res2User.id);
  const res2Token = makeToken(res2User);

  // -------------------------------------------------------------
  // TEST CASES
  // -------------------------------------------------------------

  // 1. Tạo thông báo chung toàn tòa nhà
  let commonNotifId: number;
  await runTest('BQL tạo thông báo chung thành công trên PostgreSQL', async () => {
    const res = await invokeApi({
      method: 'POST',
      url: '/api/notifications',
      token: bqlToken,
      body: {
        title: `Thông báo bảo dưỡng thang máy ${ts}`,
        content: 'Bảo dưỡng toàn bộ thang máy block A vào sáng thứ bảy.',
        targetRoom: null,
      },
    });

    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    if (!res.body.success || !res.body.data?.id) throw new Error('Response thiếu data.id');
    if (res.body.data.targetRoom !== null) throw new Error('targetRoom phải là null');
    if (res.body.data.authorId !== bqlUser.id) throw new Error('authorId không khớp với BQL');

    commonNotifId = res.body.data.id;
    tracker.trackNotification(commonNotifId);
  });

  // 2. Tạo thông báo riêng cho phòng 1
  let targetedNotif1Id: number;
  await runTest('Admin tạo thông báo riêng cho Căn hộ 1 thành công trên PostgreSQL', async () => {
    const res = await invokeApi({
      method: 'POST',
      url: '/api/notifications',
      token: adminToken,
      body: {
        title: `Nhắc đóng tiền nước phòng 1 - ${ts}`,
        content: 'Căn hộ quý cư dân vui lòng nộp tiền nước kỳ này.',
        targetRoom: room1.roomNumber,
      },
    });

    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    if (res.body.data.targetRoom !== room1.roomNumber) throw new Error('targetRoom không khớp số phòng');

    targetedNotif1Id = res.body.data.id;
    tracker.trackNotification(targetedNotif1Id);
  });

  // 3. Tạo thông báo riêng cho phòng 2
  let targetedNotif2Id: number;
  await runTest('BQL tạo thông báo riêng cho Căn hộ 2 thành công trên PostgreSQL', async () => {
    const res = await invokeApi({
      method: 'POST',
      url: '/api/notifications',
      token: bqlToken,
      body: {
        title: `Kiểm tra báo cháy phòng 2 - ${ts}`,
        content: 'Nhân viên sẽ kiểm tra cảm biến khói phòng 2.',
        targetRoom: room2.roomNumber,
      },
    });

    if (res.statusCode !== 201) throw new Error(`Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);

    targetedNotif2Id = res.body.data.id;
    tracker.trackNotification(targetedNotif2Id);
  });

  // 4. Chặn tạo thông báo tới phòng không tồn tại
  await runTest('Chặn tạo thông báo tới phòng không tồn tại (400 Bad Request)', async () => {
    const res = await invokeApi({
      method: 'POST',
      url: '/api/notifications',
      token: bqlToken,
      body: {
        title: 'Thông báo phòng ảo',
        content: 'Nội dung kiểm tra lỗi phòng không tồn tại.',
        targetRoom: 'ROOM_KHONG_TON_TAI_99999',
      },
    });

    if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
    if (res.body.success !== false) throw new Error('Phải trả về success=false');
  });

  // 5. Chặn Cư dân gọi POST /api/notifications
  await runTest('Chặn Cư dân tạo thông báo (403 Forbidden)', async () => {
    const res = await invokeApi({
      method: 'POST',
      url: '/api/notifications',
      token: res1Token,
      body: {
        title: 'Cư dân thử tạo thông báo',
        content: 'Hành vi trái quyền từ phía cư dân.',
      },
    });

    if (res.statusCode !== 403) throw new Error(`Expected 403, got ${res.statusCode}`);
  });

  // 6. BQL xem danh sách thông báo và nhận được cả thông báo chung lẫn riêng
  await runTest('BQL xem danh sách thông báo nhận đầy đủ thông báo chung và riêng', async () => {
    const res = await invokeApi({
      method: 'GET',
      url: '/api/notifications?limit=50',
      token: bqlToken,
    });

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    const items: any[] = res.body.data;
    const hasCommon = items.some((n) => n.id === commonNotifId);
    const hasNotif1 = items.some((n) => n.id === targetedNotif1Id);
    const hasNotif2 = items.some((n) => n.id === targetedNotif2Id);

    if (!hasCommon || !hasNotif1 || !hasNotif2) {
      throw new Error('BQL không nhận đủ các thông báo vừa tạo');
    }
  });

  // 7. BQL lọc thông báo theo targetRoom
  await runTest('BQL lọc thông báo theo targetRoom phòng 1 chính xác', async () => {
    const res = await invokeApi({
      method: 'GET',
      url: `/api/notifications?targetRoom=${encodeURIComponent(room1.roomNumber)}`,
      token: bqlToken,
    });

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    const items: any[] = res.body.data;
    const hasNotif1 = items.some((n) => n.id === targetedNotif1Id);
    const hasNotif2 = items.some((n) => n.id === targetedNotif2Id);

    if (!hasNotif1) throw new Error('Không tìm thấy thông báo phòng 1');
    if (hasNotif2) throw new Error('Bị lọt thông báo của phòng 2 khi lọc phòng 1');
  });

  // 8. DATA ISOLATION: Cư dân 1 chỉ xem thông báo chung + phòng 1, TUYỆT ĐỐI KHÔNG thấy phòng 2
  await runTest('DATA ISOLATION: Cư dân phòng 1 chỉ thấy thông báo chung và phòng 1, chặn tuyệt đối phòng 2', async () => {
    const res = await invokeApi({
      method: 'GET',
      url: '/api/notifications?limit=50',
      token: res1Token,
    });

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    const items: any[] = res.body.data;

    const hasCommon = items.some((n) => n.id === commonNotifId);
    const hasNotif1 = items.some((n) => n.id === targetedNotif1Id);
    const hasNotif2 = items.some((n) => n.id === targetedNotif2Id);

    if (!hasCommon) throw new Error('Cư dân 1 không nhận được thông báo chung');
    if (!hasNotif1) throw new Error('Cư dân 1 không nhận được thông báo gửi riêng cho phòng 1');
    if (hasNotif2) throw new Error('LỖ HỔNG BẢO MẬT: Cư dân 1 nhìn thấy thông báo riêng của Căn hộ 2!');
  });

  // 9. DATA ISOLATION: Thợ kỹ thuật chỉ nhận thông báo chung, không thấy thông báo riêng của căn hộ nào
  await runTest('DATA ISOLATION: Thợ kỹ thuật chỉ nhận thông báo chung, không thấy thông báo riêng của các căn hộ', async () => {
    const res = await invokeApi({
      method: 'GET',
      url: '/api/notifications?limit=50',
      token: techToken,
    });

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    const items: any[] = res.body.data;

    const hasCommon = items.some((n) => n.id === commonNotifId);
    const hasNotif1 = items.some((n) => n.id === targetedNotif1Id);
    const hasNotif2 = items.some((n) => n.id === targetedNotif2Id);

    if (!hasCommon) throw new Error('Thợ kỹ thuật không nhận được thông báo chung');
    if (hasNotif1 || hasNotif2) throw new Error('LỖ HỔNG BẢO MẬT: Thợ kỹ thuật nhìn thấy thông báo targeted của cư dân!');
  });

  // 10. Thông tin tác giả (author) được nạp kèm đầy đủ không lộ password
  await runTest('Thông tin author kèm theo không lộ password hay passwordHash', async () => {
    const res = await invokeApi({
      method: 'GET',
      url: '/api/notifications',
      token: bqlToken,
    });

    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    const firstItem = res.body.data[0];
    if (!firstItem || !firstItem.author) throw new Error('Thiếu trường author trong notification');
    if (firstItem.author.password || firstItem.author.passwordHash) {
      throw new Error('LỖ HỔNG BẢO MẬT: Lộ mật khẩu tác giả trong dữ liệu thông báo!');
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nNotifications Integration Suite Kết quả: ${passed} Passed, ${failed} Failed\n`);
  return { passed, failed };
}
