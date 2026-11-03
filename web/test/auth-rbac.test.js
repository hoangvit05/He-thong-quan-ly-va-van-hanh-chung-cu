// =========================================================================
// AUTHENTICATION & RBAC HARDENED PRODUCTION TEST SUITE
// Phụ trách: Đăng Hoàng (Web Lead)
// Mục tiêu: Kiểm thử trực tiếp production functions từ auth.ts, menu.ts & axiosClient.ts
// =========================================================================

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 1. Giả lập LocalStorage chuẩn W3C Web Storage trong môi trường Node.js
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

// 2. Import trực tiếp production source code (TypeScript type-stripped by Node ESM)
import {
  getStoredToken,
  getStoredUser,
  setAuthSession,
  clearAuthSession,
  isAuthenticated,
  ALL_ROLES,
  WEB_PORTAL_ROLES,
  getRootRedirectPath,
  evaluateRouteAccess,
  applyRequestAuth,
  formatAxiosError,
} from '../src/utils/auth.ts';

import { MENU_ITEMS } from '../src/constants/menu.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('1. Production Authentication Contract & Session Utilities', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('TC01: Login ADMIN - thành công, lưu đúng token và user role ADMIN', () => {
    const success = setAuthSession('jwt-admin-token-xyz', {
      id: 1,
      role: 'ADMIN',
      username: 'admin_master',
      fullName: 'Quản Trị Viên Hệ Thống',
    });
    assert.strictEqual(success, true);
    assert.strictEqual(getStoredToken(), 'jwt-admin-token-xyz');
    const user = getStoredUser();
    assert.notStrictEqual(user, null);
    assert.strictEqual(user?.role, 'ADMIN');
    assert.strictEqual(user?.username, 'admin_master');
    assert.strictEqual(isAuthenticated(), true);
  });

  it('TC02: Login BQL - thành công, lưu đúng token và user role BQL', () => {
    const success = setAuthSession('jwt-bql-token-abc', {
      id: 2,
      role: 'BQL',
      username: 'bql_manager',
      fullName: 'Ban Quản Lý Tòa Nhà',
    });
    assert.strictEqual(success, true);
    assert.strictEqual(getStoredToken(), 'jwt-bql-token-abc');
    const user = getStoredUser();
    assert.notStrictEqual(user, null);
    assert.strictEqual(user?.role, 'BQL');
    assert.strictEqual(isAuthenticated(), true);
  });

  it('TC03: Login TECHNICIAN - thành công, lưu đúng token và user role TECHNICIAN', () => {
    const success = setAuthSession('jwt-tech-token-123', {
      id: 3,
      role: 'TECHNICIAN',
      username: 'technician_01',
      fullName: 'Kỹ Thuật Viên Trưởng',
    });
    assert.strictEqual(success, true);
    assert.strictEqual(getStoredToken(), 'jwt-tech-token-123');
    const user = getStoredUser();
    assert.notStrictEqual(user, null);
    assert.strictEqual(user?.role, 'TECHNICIAN');
    assert.strictEqual(isAuthenticated(), true);
  });

  it('TC04: Login RESIDENT trên Web Portal - bị từ chối tuyệt đối, không tạo session', () => {
    const success = setAuthSession('jwt-resident-token', {
      id: 4,
      role: 'RESIDENT',
      username: 'resident_404',
      fullName: 'Cư Dân Chung Cư',
    });
    assert.strictEqual(success, false, 'Tài khoản RESIDENT không được phép tạo session trên Web Management');
    assert.strictEqual(getStoredToken(), null, 'Token không được lưu vào storage');
    assert.strictEqual(getStoredUser(), null, 'User không được lưu vào storage');
    assert.strictEqual(isAuthenticated(), false, 'isAuthenticated() phải trả về false');
  });

  it('TC05: Token undefined / null / chuỗi rỗng / khoảng trắng - không tạo session', () => {
    assert.strictEqual(setAuthSession(undefined, { role: 'ADMIN' }), false);
    assert.strictEqual(setAuthSession('undefined', { role: 'ADMIN' }), false);
    assert.strictEqual(setAuthSession('null', { role: 'ADMIN' }), false);
    assert.strictEqual(setAuthSession('', { role: 'ADMIN' }), false);
    assert.strictEqual(setAuthSession('   ', { role: 'ADMIN' }), false);
    assert.strictEqual(getStoredToken(), null);
    assert.strictEqual(isAuthenticated(), false);
  });

  it('TC06: User null / object rỗng / thiếu role / role không hợp lệ - không tạo session', () => {
    assert.strictEqual(setAuthSession('valid-token', null), false);
    assert.strictEqual(setAuthSession('valid-token', {}), false);
    assert.strictEqual(setAuthSession('valid-token', { role: 'UNKNOWN_ROLE' }), false);
    assert.strictEqual(setAuthSession('valid-token', { role: 'MANAGER' }), false);
    assert.strictEqual(getStoredToken(), null);
    assert.strictEqual(getStoredUser(), null);
    assert.strictEqual(isAuthenticated(), false);
  });

  it('TC07: Corrupted JSON trong localStorage - getStoredUser trả về null an toàn, không crash', () => {
    mockStorage.setItem('user', '{ invalid-corrupted-json ...');
    assert.doesNotThrow(() => {
      const user = getStoredUser();
      assert.strictEqual(user, null);
    });
  });

  it('TC08: Logout / clearAuthSession - xóa sạch token và user, hủy phiên hoàn toàn', () => {
    setAuthSession('active-token', { id: 10, role: 'ADMIN' });
    assert.strictEqual(isAuthenticated(), true);

    clearAuthSession();
    assert.strictEqual(getStoredToken(), null);
    assert.strictEqual(getStoredUser(), null);
    assert.strictEqual(isAuthenticated(), false);
  });

  it('TC09: Refresh trang nội bộ - đọc session đã lưu từ localStorage và bảo toàn trạng thái', () => {
    setAuthSession('persisted-token-777', { id: 25, role: 'BQL', username: 'bql_persisted' });

    // Mô phỏng reload: hàm tiện ích đọc lại từ storage
    const token = getStoredToken();
    const user = getStoredUser();
    assert.strictEqual(token, 'persisted-token-777');
    assert.strictEqual(user?.role, 'BQL');
    assert.strictEqual(isAuthenticated(), true);
  });

  it('TC10: Session thiếu một trong hai (token có nhưng user mất hoặc ngược lại) - isAuthenticated trả về false', () => {
    mockStorage.setItem('token', 'lone-token');
    assert.strictEqual(isAuthenticated(), false);

    mockStorage.clear();
    mockStorage.setItem('user', JSON.stringify({ role: 'ADMIN' }));
    assert.strictEqual(isAuthenticated(), false);
  });
});

describe('2. Role-Based Access Control (RBAC) & Route Guards', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('TC11: ADMIN truy cập /admin/accounts - Cho phép (status 200)', () => {
    setAuthSession('admin-tok', { id: 1, role: 'ADMIN' });
    const decision = evaluateRouteAccess(getStoredUser(), ['ADMIN']);
    assert.strictEqual(decision.status, 200);
    assert.strictEqual(decision.allowed, true);
  });

  it('TC12: BQL truy cập /admin/accounts - 403 Forbidden', () => {
    setAuthSession('bql-tok', { id: 2, role: 'BQL' });
    const decision = evaluateRouteAccess(getStoredUser(), ['ADMIN']);
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'ROLE_UNAUTHORIZED');
  });

  it('TC13: TECHNICIAN truy cập /billing - 403 Forbidden', () => {
    setAuthSession('tech-tok', { id: 3, role: 'TECHNICIAN' });
    const decision = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'ROLE_UNAUTHORIZED');
  });

  it('TC14: TECHNICIAN truy cập /residents - 403 Forbidden (và ADMIN cũng bị từ chối truy cập /residents)', () => {
    setAuthSession('tech-tok', { id: 3, role: 'TECHNICIAN' });
    const decisionTech = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decisionTech.status, 403);
    assert.strictEqual(decisionTech.allowed, false);
    assert.strictEqual(decisionTech.reason, 'ROLE_UNAUTHORIZED');

    // Kiểm tra ADMIN cũng bị từ chối truy cập route nghiệp vụ của BQL
    setAuthSession('admin-tok', { id: 1, role: 'ADMIN' });
    const decisionAdmin = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decisionAdmin.status, 403);
    assert.strictEqual(decisionAdmin.allowed, false);
    assert.strictEqual(decisionAdmin.reason, 'ROLE_UNAUTHORIZED');
  });

  it('TC15: TECHNICIAN truy cập /technician/tasks - Cho phép (status 200)', () => {
    setAuthSession('tech-tok', { id: 3, role: 'TECHNICIAN' });
    const decision = evaluateRouteAccess(getStoredUser(), ['TECHNICIAN']);
    assert.strictEqual(decision.status, 200);
    assert.strictEqual(decision.allowed, true);
  });

  it('TC16: BQL truy cập các chức năng quản lý (/residents, /billing, /tickets/dispatch) - Cho phép (status 200)', () => {
    setAuthSession('bql-tok', { id: 2, role: 'BQL' });
    const decisionResidents = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decisionResidents.status, 200);
    assert.strictEqual(decisionResidents.allowed, true);

    const decisionBilling = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decisionBilling.status, 200);
    assert.strictEqual(decisionBilling.allowed, true);

    const decisionTickets = evaluateRouteAccess(getStoredUser(), ['BQL']);
    assert.strictEqual(decisionTickets.status, 200);
    assert.strictEqual(decisionTickets.allowed, true);
  });

  it('TC17: Chưa đăng nhập truy cập route nội bộ - Chuyển hướng 302 về /login', () => {
    const decision = evaluateRouteAccess(null, ['ADMIN', 'BQL']);
    assert.strictEqual(decision.status, 302);
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.redirect, '/login');
    assert.strictEqual(decision.reason, 'UNAUTHENTICATED');
  });

  it('TC18: RESIDENT cố tình vượt rào truy cập - 403 Forbidden', () => {
    // Ngay cả khi có token trong storage
    mockStorage.setItem('token', 'fake-resident-token');
    const decision = evaluateRouteAccess({ id: 99, role: 'RESIDENT' }, ['ADMIN', 'BQL']);
    assert.strictEqual(decision.status, 403);
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, 'RESIDENT_OR_INVALID_ROLE');
  });

  it('TC19: getRootRedirectPath điều hướng chuẩn xác theo từng vai trò', () => {
    assert.strictEqual(getRootRedirectPath('ADMIN'), '/admin/accounts');
    assert.strictEqual(getRootRedirectPath('BQL'), '/residents');
    assert.strictEqual(getRootRedirectPath('TECHNICIAN'), '/technician/tasks');
    assert.strictEqual(getRootRedirectPath('RESIDENT'), '/login');
    assert.strictEqual(getRootRedirectPath(undefined), '/login');
  });

  it('TC20: Kiểm tra MENU_ITEMS production - Không chứa role MANAGER và không chứa RESIDENT', () => {
    assert.strictEqual(MENU_ITEMS.length, 7);
    MENU_ITEMS.forEach((item) => {
      assert.strictEqual(
        item.roles.includes('MANAGER'),
        false,
        `Menu ${item.title} không được chứa role không tồn tại MANAGER`
      );
      assert.strictEqual(
        item.roles.includes('RESIDENT'),
        false,
        `Menu ${item.title} không được cấp quyền cho RESIDENT trên Web`
      );
      assert(item.roles.every((r) => WEB_PORTAL_ROLES.includes(r)));
    });
  });
});

describe('3. Axios HTTP Client & Interceptor Logic', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('TC21: applyRequestAuth - Tự động đính kèm Bearer token khi đã đăng nhập', () => {
    setAuthSession('valid-bearer-token', { role: 'ADMIN' });
    const config = { headers: {} };
    const processed = applyRequestAuth(config, getStoredToken);
    assert.strictEqual(processed.headers.Authorization, 'Bearer valid-bearer-token');
  });

  it('TC22: applyRequestAuth - Không đính Authorization khi chưa đăng nhập (token = null)', () => {
    const config = { headers: {} };
    const processed = applyRequestAuth(config, () => null);
    assert.strictEqual(processed.headers.Authorization, undefined);
  });

  it('TC23: applyRequestAuth - Xóa Content-Type đối với FormData để trình duyệt tự gán boundary', () => {
    class MockFormData {}
    const config = {
      headers: { 'Content-Type': 'application/json' },
      data: new MockFormData(),
    };
    // Giả lập đối tượng FormData toàn cục trong node
    const originalFormData = globalThis.FormData;
    globalThis.FormData = MockFormData;
    try {
      const processed = applyRequestAuth(config, () => 'sample-token');
      assert.strictEqual(processed.headers['Content-Type'], undefined);
      assert.strictEqual(processed.headers.Authorization, 'Bearer sample-token');
    } finally {
      globalThis.FormData = originalFormData;
    }
  });

  it('TC24: formatAxiosError - HTTP 401 trên route bảo vệ xóa phiên và gọi redirect về /login', () => {
    setAuthSession('expired-token', { role: 'ADMIN' });
    let redirectedTo = null;
    const redirectMock = (url) => {
      redirectedTo = url;
    };

    const error = {
      config: { url: '/api/v1/residents' },
      response: { status: 401, data: { message: 'Token hết hạn' } },
    };

    const formatted = formatAxiosError(error, clearAuthSession, '/residents', redirectMock);
    assert.strictEqual(formatted.status, 401);
    assert.strictEqual(formatted.message, 'Token hết hạn');
    assert.strictEqual(getStoredToken(), null, 'Phiên đăng nhập phải được xóa sạch');
    assert.strictEqual(redirectedTo, '/login', 'Phải điều hướng về /login');
  });

  it('TC25: formatAxiosError - HTTP 401 tại API Login không gây vòng lặp redirect', () => {
    let redirectCalled = false;
    const redirectMock = () => {
      redirectCalled = true;
    };

    const error = {
      config: { url: '/api/v1/auth/login' },
      response: { status: 401, data: { message: 'Tài khoản hoặc mật khẩu không chính xác' } },
    };

    const formatted = formatAxiosError(error, clearAuthSession, '/login', redirectMock);
    assert.strictEqual(formatted.status, 401);
    assert.strictEqual(formatted.message, 'Tài khoản hoặc mật khẩu không chính xác');
    assert.strictEqual(redirectCalled, false, 'Không được gọi redirect khi lỗi tại chính trang login');
  });

  it('TC26: formatAxiosError - HTTP 401 khi đã ở trang /login không gọi redirect lặp', () => {
    let redirectCalled = false;
    const redirectMock = () => {
      redirectCalled = true;
    };

    const error = {
      config: { url: '/api/v1/some-check' },
      response: { status: 401, data: { message: 'Unauthorized' } },
    };

    const formatted = formatAxiosError(error, clearAuthSession, '/login', redirectMock);
    assert.strictEqual(formatted.status, 401);
    assert.strictEqual(redirectCalled, false, 'Đang ở /login thì không kích hoạt redirect lặp');
  });

  it('TC27: formatAxiosError - HTTP 403 Forbidden không xóa session và không chuyển về login', () => {
    setAuthSession('active-bql-token', { role: 'BQL' });
    let redirectCalled = false;
    const redirectMock = () => {
      redirectCalled = true;
    };

    const error = {
      config: { url: '/api/v1/admin/accounts' },
      response: { status: 403, data: { message: 'Từ chối truy cập tài nguyên này' } },
    };

    const formatted = formatAxiosError(error, clearAuthSession, '/residents', redirectMock);
    assert.strictEqual(formatted.status, 403);
    assert.strictEqual(formatted.message, 'Từ chối truy cập tài nguyên này');
    assert.strictEqual(redirectCalled, false, '403 không kích hoạt redirect /login');
    assert.strictEqual(getStoredToken(), 'active-bql-token', '403 không làm mất session');
  });

  it('TC28: formatAxiosError - Bảo toàn message và data từ backend envelope', () => {
    const error = {
      response: {
        status: 422,
        data: {
          success: false,
          message: 'Dữ liệu căn hộ không hợp lệ',
          data: { field: 'roomId', error: 'Phòng đang bảo trì' },
        },
      },
    };
    const formatted = formatAxiosError(error);
    assert.strictEqual(formatted.status, 422);
    assert.strictEqual(formatted.message, 'Dữ liệu căn hộ không hợp lệ');
    assert.deepStrictEqual(formatted.data, { field: 'roomId', error: 'Phòng đang bảo trì' });
  });

  it('TC29: formatAxiosError - Tạo thông báo tiếng Việt chuẩn cho các HTTP Status Code khi backend không gửi message', () => {
    const checkFallback = (status, pattern) => {
      const err = { response: { status, data: {} } };
      const formatted = formatAxiosError(err);
      assert.match(formatted.message, pattern);
    };

    checkFallback(400, /Yêu cầu không hợp lệ/);
    checkFallback(401, /Phiên đăng nhập đã hết hạn/);
    checkFallback(403, /Bạn không có quyền/);
    checkFallback(404, /Không tìm thấy tài nguyên/);
    checkFallback(409, /xung đột trạng thái/);
    checkFallback(422, /logic của hệ thống/);
    checkFallback(429, /Quá nhiều yêu cầu/);
    checkFallback(500, /Lỗi máy chủ nội bộ/);
    checkFallback(502, /không sẵn sàng hoặc đang bảo trì/);

    const netErr = formatAxiosError({});
    assert.match(netErr.message, /Không thể kết nối đến máy chủ/);
  });
});

describe('4. Direct Production Source Assertions & Integrity Checks', () => {
  it('TC30: Kiểm tra tính toàn vẹn cấu trúc menu.ts', () => {
    const menuPath = path.join(__dirname, '../src/constants/menu.ts');
    assert.strictEqual(fs.existsSync(menuPath), true, 'menu.ts phải tồn tại');
    const menuSource = fs.readFileSync(menuPath, 'utf8');

    assert(menuSource.includes('export const MENU_ITEMS: MenuItem[]'), 'menu.ts phải export MENU_ITEMS');
    assert(menuSource.includes("'/admin/accounts'"), 'Chứa route /admin/accounts');
    assert(menuSource.includes("'/residents'"), 'Chứa route /residents');
    assert(menuSource.includes("'/tickets/dispatch'"), 'Chứa route /tickets/dispatch');
    assert(menuSource.includes("'/technician/tasks'"), 'Chứa route /technician/tasks');
    assert(!menuSource.includes("'MANAGER'"), 'Tuyệt đối không chứa role legacy MANAGER');
  });

  it('TC31: Kiểm tra tính toàn vẹn tiện ích auth.ts', () => {
    const authPath = path.join(__dirname, '../src/utils/auth.ts');
    assert.strictEqual(fs.existsSync(authPath), true, 'auth.ts phải tồn tại');
    const authSource = fs.readFileSync(authPath, 'utf8');

    assert(authSource.includes('export function getStoredToken'), 'auth.ts phải export getStoredToken');
    assert(authSource.includes('export function getStoredUser'), 'auth.ts phải export getStoredUser');
    assert(authSource.includes('export function setAuthSession'), 'auth.ts phải export setAuthSession');
    assert(authSource.includes('export function clearAuthSession'), 'auth.ts phải export clearAuthSession');
    assert(authSource.includes('export function isAuthenticated'), 'auth.ts phải export isAuthenticated');
    assert(authSource.includes('WEB_PORTAL_ROLES'), 'auth.ts phải định nghĩa WEB_PORTAL_ROLES');
    assert(authSource.includes('evaluateRouteAccess'), 'auth.ts phải export evaluateRouteAccess');
  });

  it('TC32: Kiểm tra RouteGuard.tsx sử dụng evaluateRouteAccess và getRootRedirectPath từ auth.ts', () => {
    const guardPath = path.join(__dirname, '../src/routes/RouteGuard.tsx');
    assert.strictEqual(fs.existsSync(guardPath), true, 'RouteGuard.tsx phải tồn tại');
    const guardSource = fs.readFileSync(guardPath, 'utf8');

    assert(guardSource.includes('evaluateRouteAccess(user'), 'RouteGuard phải gọi evaluateRouteAccess');
    assert(guardSource.includes('getRootRedirectPath(user'), 'RouteGuard phải gọi getRootRedirectPath');
    assert(guardSource.includes('<UnauthorizedPage'), 'RouteGuard phải render UnauthorizedPage');
    assert(guardSource.includes('to="/login"'), 'RouteGuard phải điều hướng về /login');
  });

  it('TC33: Kiểm tra axiosClient.ts sử dụng applyRequestAuth và formatAxiosError', () => {
    const clientPath = path.join(__dirname, '../src/api/axiosClient.ts');
    assert.strictEqual(fs.existsSync(clientPath), true, 'axiosClient.ts phải tồn tại');
    const clientSource = fs.readFileSync(clientPath, 'utf8');

    assert(clientSource.includes('applyRequestAuth'), 'axiosClient phải sử dụng applyRequestAuth');
    assert(clientSource.includes('formatAxiosError'), 'axiosClient phải sử dụng formatAxiosError');
    assert(clientSource.includes('interceptors.request.use'), 'axiosClient phải đăng ký request interceptor');
    assert(clientSource.includes('interceptors.response.use'), 'axiosClient phải đăng ký response interceptor');
  });

  it('TC34: Kiểm tra LoginPage.tsx chặn vai trò RESIDENT và sử dụng getRootRedirectPath', () => {
    const loginPath = path.join(__dirname, '../src/pages/LoginPage.tsx');
    assert.strictEqual(fs.existsSync(loginPath), true, 'LoginPage.tsx phải tồn tại');
    const loginSource = fs.readFileSync(loginPath, 'utf8');

    assert(loginSource.includes("user.role === 'RESIDENT'"), 'LoginPage phải có check chặn RESIDENT');
    assert(loginSource.includes('getRootRedirectPath(user.role)'), 'LoginPage phải gọi getRootRedirectPath');
    assert(loginSource.includes('setAuthSession(token, user)'), 'LoginPage phải gọi setAuthSession');
  });

  it('TC35: formatAxiosError - Khi AxiosError có error.message mặc định và Backend không có message, fallback tiếng Việt phải được ưu tiên', () => {
    // 1. Network Error: có message mặc định của Axios là 'Network Error' nhưng không có response
    const netErr = formatAxiosError({ message: 'Network Error' });
    assert.match(netErr.message, /Không thể kết nối đến máy chủ/);
    assert.notStrictEqual(netErr.message, 'Network Error', 'error.message không được đè fallback tiếng Việt');

    // 2. Các HTTP Status codes khi Backend trả về body rỗng nhưng Axios sinh error.message mặc định
    const testCases = [
      { status: 400, expected: /Yêu cầu không hợp lệ/ },
      { status: 401, expected: /Phiên đăng nhập đã hết hạn/ },
      { status: 403, expected: /Bạn không có quyền/ },
      { status: 404, expected: /Không tìm thấy tài nguyên/ },
      { status: 409, expected: /xung đột trạng thái/ },
      { status: 422, expected: /logic của hệ thống/ },
      { status: 429, expected: /Quá nhiều yêu cầu/ },
      { status: 500, expected: /Lỗi máy chủ nội bộ/ },
      { status: 502, expected: /không sẵn sàng hoặc đang bảo trì/ },
      { status: 503, expected: /không sẵn sàng hoặc đang bảo trì/ },
    ];

    testCases.forEach(({ status, expected }) => {
      const axiosErr = {
        message: `Request failed with status code ${status}`,
        response: { status, data: {} },
      };
      const formatted = formatAxiosError(axiosErr);
      assert.match(
        formatted.message,
        expected,
        `Status ${status} phải ưu tiên fallback tiếng Việt thay vì '${axiosErr.message}'`
      );
    });

    // 3. Đảm bảo bảo toàn message khi Backend có gửi thông báo cụ thể
    const backendCustomErr = {
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: { success: false, message: 'Số điện thoại cư dân đã tồn tại trong hệ thống' },
      },
    };
    const formattedCustom = formatAxiosError(backendCustomErr);
    assert.strictEqual(formattedCustom.message, 'Số điện thoại cư dân đã tồn tại trong hệ thống');
  });

  it('TC36: calculatePageRecovery - Xử lý chuyển trang, giảm dữ liệu và ngăn lặp vô hạn', async () => {
    const { calculatePageRecovery } = await import('../src/utils/adminPagination.ts');

    // 1. Đang ở trang 3, tổng số dữ liệu trở thành 0 -> Hồi phục về trang 1
    const recZero = calculatePageRecovery(3, 1, 0, false);
    assert.strictEqual(recZero.shouldRecover, true, 'Khi total = 0 và đang ở trang > 1, phải hồi phục');
    assert.strictEqual(recZero.targetPage, 1, 'Mục tiêu hồi phục khi total = 0 phải là trang 1');

    // 2. Đang ở trang 1, tổng số dữ liệu = 0 -> Không cần hồi phục
    const recZeroPage1 = calculatePageRecovery(1, 1, 0, false);
    assert.strictEqual(recZeroPage1.shouldRecover, false);
    assert.strictEqual(recZeroPage1.targetPage, 1);

    // 3. Đang ở trang 3, tổng số trang giảm xuống 2 (total = 15, limit = 10) -> Hồi phục về trang 2
    const recOvershoot = calculatePageRecovery(3, 2, 15, false);
    assert.strictEqual(recOvershoot.shouldRecover, true);
    assert.strictEqual(recOvershoot.targetPage, 2);

    // 4. Khi đang trong lần hồi phục (isRecovery = true) mà trang vẫn vượt (data giảm tiếp) -> dừng vòng lặp
    const recLoopHalt = calculatePageRecovery(3, 2, 15, true);
    assert.strictEqual(recLoopHalt.shouldRecover, false, 'Phải dừng recovery loop khi isRecovery = true');
    assert.strictEqual(recLoopHalt.targetPage, 2);

    // 5. Đang ở trang hợp lệ (trang 2 / 5) -> không hồi phục
    const recNormal = calculatePageRecovery(2, 5, 50, false);
    assert.strictEqual(recNormal.shouldRecover, false);
    assert.strictEqual(recNormal.targetPage, 2);

    // 6. Kiểm tra isRecovery ngay cả trong trường hợp totalRecords = 0 (Tech Leader requirement)
    const recZeroHalt = calculatePageRecovery(3, 1, 0, true);
    assert.strictEqual(recZeroHalt.shouldRecover, false, 'Khi total = 0 và isRecovery = true, phải dừng loop');
    assert.strictEqual(recZeroHalt.attemptsExceeded, true, 'attemptsExceeded phải là true');
    assert.strictEqual(recZeroHalt.targetPage, 1);
  });

  it('TC37: getApiBaseUrl - Chuẩn hóa API URL theo môi trường và loại bỏ trailing /api', async () => {
    const { getApiBaseUrl } = await import('../src/api/axiosClient.ts');

    // Test URL origin chuẩn
    assert.strictEqual(getApiBaseUrl('http://localhost:5000'), 'http://localhost:5000');
    assert.strictEqual(getApiBaseUrl('https://api.chungcu.vn'), 'https://api.chungcu.vn');

    // Test loại bỏ trailing slash và trailing /api tránh lặp prefix
    assert.strictEqual(getApiBaseUrl('https://api.chungcu.vn/'), 'https://api.chungcu.vn');
    assert.strictEqual(getApiBaseUrl('http://localhost:5000/api'), 'http://localhost:5000');
    assert.strictEqual(getApiBaseUrl('https://api.chungcu.vn/api/'), 'https://api.chungcu.vn');

    // Test fallback theo môi trường
    assert.strictEqual(getApiBaseUrl('', true), 'http://localhost:5000', 'Dev mode fallback localhost:5000');
    assert.strictEqual(getApiBaseUrl('', false), '', 'Prod mode không có URL fallback same-origin');
  });

  it('TC38: Phân quyền vai trò và tính tương thích của AppRoutes.tsx & menu.ts', () => {
    const routesPath = path.join(__dirname, '../src/routes/AppRoutes.tsx');
    assert.strictEqual(fs.existsSync(routesPath), true, 'AppRoutes.tsx phải tồn tại');
    const routesSource = fs.readFileSync(routesPath, 'utf8');

    // Kiểm tra tương thích redirect cho hai đường dẫn cũ từ Ngày 1
    assert(routesSource.includes('path="/ticket-dispatch"'), 'Phải có route tương thích /ticket-dispatch');
    assert(routesSource.includes('to="/tickets/dispatch"'), 'Chuyển hướng /ticket-dispatch về /tickets/dispatch');
    assert(routesSource.includes('path="/technician-tasks"'), 'Phải có route tương thích /technician-tasks');
    assert(routesSource.includes('to="/technician/tasks"'), 'Chuyển hướng /technician-tasks về /technician/tasks');

    // Kiểm tra phân quyền:
    // ADMIN chỉ được truy cập Admin Accounts
    // BQL được truy cập các module nghiệp vụ
    // TECHNICIAN chỉ được truy cập nhiệm vụ kỹ thuật
    const menuPath = path.join(__dirname, '../src/constants/menu.ts');
    const menuSource = fs.readFileSync(menuPath, 'utf8');
    assert(menuSource.includes("path: '/admin/accounts'"), 'menu có /admin/accounts');
    assert(menuSource.includes("path: '/technician/tasks'"), 'menu có /technician/tasks');

    // Đảm bảo các lazy import không sử dụng fallback () => null âm thầm
    assert(!routesSource.includes('() => null'), 'Không sử dụng fallback () => null âm thầm trong lazy import');
  });
});

describe('5. Pagination Recovery & Request Flow Regression Suite', () => {
  // Mock dữ liệu nhân viên chuẩn cho các bài test phân trang
  const makeMockStaff = (id, role = 'BQL') => ({
    id,
    username: `staff_user_${id}`,
    fullName: `Nhân Viên Số ${id}`,
    role,
    isApproved: true,
  });

  it('TC39: Trang 3 giảm xuống 2 trang - Kiểm tra logic recovery và luồng request thực tế', async () => {
    const { calculatePageRecovery, executePaginatedRequestFlow } = await import(
      '../src/utils/adminPagination.ts'
    );

    // 1. Kiểm tra logic recovery
    const rec = calculatePageRecovery(3, 2, 15, 0);
    assert.strictEqual(rec.shouldRecover, true);
    assert.strictEqual(rec.targetPage, 2);

    // 2. Kiểm tra luồng request thực tế
    const requestedPages = [];
    const mockFetch = async (page) => {
      requestedPages.push(page);
      if (page === 3) {
        // Trang 3 đã bị trống vì tổng dữ liệu giảm xuống 15 (2 trang)
        return {
          success: true,
          data: [],
          pagination: { page: 3, limit: 10, total: 15, totalPages: 2 },
        };
      }
      if (page === 2) {
        // Trang 2 chứa 5 bản ghi cuối cùng (11 -> 15)
        return {
          success: true,
          data: [
            makeMockStaff(11),
            makeMockStaff(12),
            makeMockStaff(13),
            makeMockStaff(14),
            makeMockStaff(15),
          ],
          pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
        };
      }
      throw new Error(`Unexpected page requested: ${page}`);
    };

    const result = await executePaginatedRequestFlow(3, mockFetch, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.requestsCount, 2, 'Tổng số request phải là 2 (trang 3 -> trang 2)');
    assert.deepStrictEqual(requestedPages, [3, 2]);
    assert.strictEqual(result.pagination.page, 2, 'Trang cuối cùng phải là trang 2');
    assert.strictEqual(result.pagination.totalPages, 2);
    assert.strictEqual(result.users.length, 5);
    assert.strictEqual(result.users[0].id, 11);
  });

  it('TC40: Trang 3 giảm xuống 1 trang - Hồi phục trực tiếp về trang 1 và đồng nhất metadata', async () => {
    const { calculatePageRecovery, executePaginatedRequestFlow } = await import(
      '../src/utils/adminPagination.ts'
    );

    // 1. Kiểm tra logic recovery
    const rec = calculatePageRecovery(3, 1, 8, 0);
    assert.strictEqual(rec.shouldRecover, true);
    assert.strictEqual(rec.targetPage, 1);

    // 2. Kiểm tra luồng request thực tế
    const requestedPages = [];
    const mockFetch = async (page) => {
      requestedPages.push(page);
      if (page === 3) {
        return {
          success: true,
          data: [],
          pagination: { page: 3, limit: 10, total: 8, totalPages: 1 },
        };
      }
      if (page === 1) {
        return {
          success: true,
          data: [makeMockStaff(1), makeMockStaff(2)],
          pagination: { page: 1, limit: 10, total: 8, totalPages: 1 },
        };
      }
      throw new Error(`Unexpected page: ${page}`);
    };

    const result = await executePaginatedRequestFlow(3, mockFetch, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.requestsCount, 2, 'Request 1: trang 3, Request 2: hồi phục về trang 1');
    assert.deepStrictEqual(requestedPages, [3, 1]);
    assert.strictEqual(result.pagination.page, 1);
    assert.strictEqual(result.pagination.totalPages, 1);
    assert.strictEqual(result.users.length, 2);
  });

  it('TC41: Dữ liệu bị xóa hết (totalRecords = 0) - Kiểm tra isRecovery và ngăn chặn lặp vô hạn', async () => {
    const { calculatePageRecovery, executePaginatedRequestFlow } = await import(
      '../src/utils/adminPagination.ts'
    );

    // 1. Logic check: Khi chưa recovery, total = 0 và page > 1 -> Phải hồi phục về trang 1
    const recFirst = calculatePageRecovery(3, 1, 0, false);
    assert.strictEqual(recFirst.shouldRecover, true);
    assert.strictEqual(recFirst.targetPage, 1);

    // 2. Logic check: Khi đã recovery (isRecovery = true hoặc attempt >= maxAttempts) -> PHẢI DỪNG
    const recSecond = calculatePageRecovery(3, 1, 0, true);
    assert.strictEqual(
      recSecond.shouldRecover,
      false,
      'Phải dừng loop khi isRecovery = true ngay cả khi total = 0'
    );
    assert.strictEqual(recSecond.attemptsExceeded, true);

    // 3. Luồng request thực tế khi dữ liệu bị xóa hết trong lúc ở trang 3
    let callCount = 0;
    const requestedPages = [];
    const mockFetch = async (page) => {
      callCount++;
      requestedPages.push(page);
      return {
        success: true,
        data: [],
        pagination: { page, limit: 10, total: 0, totalPages: 1 },
      };
    };

    const result = await executePaginatedRequestFlow(3, mockFetch, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.requestsCount, 2, 'Chỉ thực hiện đúng 2 request (trang 3 -> trang 1)');
    assert.deepStrictEqual(requestedPages, [3, 1]);
    assert.strictEqual(result.pagination.page, 1);
    assert.strictEqual(result.pagination.total, 0);
    assert.strictEqual(result.pagination.totalPages, 1);
    assert.deepStrictEqual(result.users, []);
  });

  it('TC42: Dữ liệu tiếp tục thay đổi trong lúc recovery (Page 3 -> Page 2 -> Page 1)', async () => {
    const { executePaginatedRequestFlow } = await import('../src/utils/adminPagination.ts');

    // Mô phỏng dữ liệu liên tục bị xóa trong quá trình phục hồi:
    // Lần 1: request trang 3 -> total = 15 (cần về trang 2)
    // Lần 2: request trang 2 -> dữ liệu vừa bị xóa tiếp, total = 5 (cần về trang 1)
    // Lần 3: request trang 1 -> dữ liệu ổn định ở 5 bản ghi
    const requestedPages = [];
    const mockDynamicFetch = async (page) => {
      requestedPages.push(page);
      if (page === 3) {
        return {
          success: true,
          data: [],
          pagination: { page: 3, limit: 10, total: 15, totalPages: 2 },
        };
      }
      if (page === 2) {
        return {
          success: true,
          data: [],
          pagination: { page: 2, limit: 10, total: 5, totalPages: 1 },
        };
      }
      if (page === 1) {
        return {
          success: true,
          data: [
            makeMockStaff(1),
            makeMockStaff(2),
            makeMockStaff(3),
            makeMockStaff(4),
            makeMockStaff(5),
          ],
          pagination: { page: 1, limit: 10, total: 5, totalPages: 1 },
        };
      }
      throw new Error(`Unexpected page: ${page}`);
    };

    const result = await executePaginatedRequestFlow(3, mockDynamicFetch, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.requestsCount, 3, 'Phải thực hiện 3 requests: 3 -> 2 -> 1');
    assert.deepStrictEqual(requestedPages, [3, 2, 1]);
    assert.strictEqual(result.pagination.page, 1);
    assert.strictEqual(result.pagination.totalPages, 1);
    assert.strictEqual(result.pagination.total, 5);
    assert.strictEqual(result.users.length, 5);
  });

  it('TC43: Dữ liệu biến động liên tục vượt quá retry limit - Dừng dứt khoát không lặp vô hạn và báo lỗi rõ ràng', async () => {
    const { executePaginatedRequestFlow } = await import('../src/utils/adminPagination.ts');

    // Mô phỏng server trả về lỗi đồng bộ khiến trang yêu cầu luôn lớn hơn totalPages
    let callCount = 0;
    const requestedPages = [];
    const mockBrokenServer = async (page) => {
      callCount++;
      requestedPages.push(page);
      return {
        success: true,
        data: [],
        pagination: { page, limit: 10, total: 5, totalPages: Math.max(1, page - 1) },
      };
    };

    // Giới hạn maxAttempts = 2 -> tối đa 3 requests (1 initial + 2 recoveries)
    const result = await executePaginatedRequestFlow(5, mockBrokenServer, 2);
    assert.strictEqual(result.success, false, 'Phải đánh dấu thất bại khi vượt quá giới hạn thử lại');
    assert.strictEqual(result.requestsCount, 3, 'Tuyệt đối không chạy quá maxAttempts + 1');
    assert.strictEqual(callCount, 3, 'Không phát sinh request vô hạn');
    assert.match(result.error, /Không thể đồng bộ trang dữ liệu sau các lần thử phục hồi/);
    assert.deepStrictEqual(result.users, [], 'Không trả về danh sách dữ liệu khi phục hồi thất bại');
  });

  it('TC44: Bảo đảm tính đồng nhất giữa dữ liệu và metadata (Tuyệt đối không hiển thị dữ liệu trang 2 với nhãn trang 1)', async () => {
    const { executePaginatedRequestFlow } = await import('../src/utils/adminPagination.ts');

    // Kiểm tra trường hợp trả về hợp lệ: dữ liệu trang 2 đi kèm metadata trang 2
    const mockFetchValidPage2 = async (page) => {
      return {
        success: true,
        data: [makeMockStaff(21), makeMockStaff(22)],
        pagination: { page: 2, limit: 10, total: 20, totalPages: 2 },
      };
    };

    const result = await executePaginatedRequestFlow(2, mockFetchValidPage2, 2);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.pagination.page, 2);
    assert.strictEqual(result.users.length, 2);
    assert.strictEqual(result.users[0].id, 21, 'Dữ liệu phải đúng của trang 2');

    // Không được có hiện tượng metadata ép về trang 1 trong khi dữ liệu là của trang 2
    assert.notStrictEqual(
      result.pagination.page,
      1,
      'Metadata không được hiển thị trang 1 khi data là trang 2'
    );
  });

  it('TC45: Kiểm tra template môi trường web/.env.example không chứa localhost làm giá trị mặc định', () => {
    const envPath = path.join(__dirname, '../.env.example');
    assert.strictEqual(fs.existsSync(envPath), true, '.env.example phải tồn tại');
    const envSource = fs.readFileSync(envPath, 'utf8');

    // Giá trị active VITE_API_URL= phải để trống, không được gán sẵn localhost
    assert(
      envSource.includes('VITE_API_URL=\n') || envSource.endsWith('VITE_API_URL='),
      'VITE_API_URL mặc định phải để trống (same-origin)'
    );

    // Đảm bảo không có dòng active VITE_API_URL=http://localhost:5000 (chỉ xuất hiện trong chú thích #)
    const lines = envSource.split(/\r?\n/).map((l) => l.trim());
    const activeUrlLine = lines.find((l) => !l.startsWith('#') && l.startsWith('VITE_API_URL='));
    assert.strictEqual(
      activeUrlLine,
      'VITE_API_URL=',
      'Dòng active VITE_API_URL phải là VITE_API_URL= (không chứa localhost)'
    );

    // Kiểm tra có đầy đủ hướng dẫn Development và Production
    assert(envSource.includes('Development'), 'Chứa hướng dẫn Development');
    assert(envSource.includes('Production'), 'Chứa hướng dẫn Production');
    assert(envSource.includes('Same-Origin'), 'Chứa hướng dẫn Same-Origin');
  });
});
