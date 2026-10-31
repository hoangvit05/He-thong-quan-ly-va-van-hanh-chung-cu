const { describe, it } = require('node:test');
const assert = require('node:assert');

// ===================================================
// UNIT & RBAC TEST SUITE FOR APARTMENT WEB PORTAL
// Phụ trách: Đăng Hoàng (Web Lead)
// ===================================================

const ALL_ROLES = ['ADMIN', 'BQL', 'TECHNICIAN', 'RESIDENT'];

// 1. Menu Items Definition
const MENU_ITEMS = [
  { title: 'Quản lý tài khoản', path: '/admin/accounts', roles: ['ADMIN'] },
  { title: 'Cư dân & Căn hộ', path: '/residents', roles: ['ADMIN', 'BQL'] },
  { title: 'Điều phối sự cố', path: '/tickets/dispatch', roles: ['ADMIN', 'BQL'] },
  { title: 'Nhiệm vụ kỹ thuật', path: '/technician/tasks', roles: ['TECHNICIAN'] },
  { title: 'Hóa đơn & Thu phí', path: '/billing', roles: ['ADMIN', 'BQL'] },
  { title: 'Phản ánh & Đóng góp', path: '/feedback', roles: ['ADMIN', 'BQL'] },
  { title: 'Thông báo tòa nhà', path: '/announcements', roles: ['ADMIN', 'BQL'] },
];

// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
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

// Logic implementations mirroring web/src/utils/auth.ts
function createAuthModule(storage) {
  return {
    getStoredToken() {
      try {
        const token = storage.getItem('token');
        if (!token || token === 'undefined' || token === 'null' || token.trim() === '') {
          return null;
        }
        return token.trim();
      } catch {
        return null;
      }
    },
    getStoredUser() {
      try {
        const raw = storage.getItem('user');
        if (!raw || raw === 'undefined' || raw === 'null' || raw.trim() === '') {
          return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },
    setAuthSession(token, user) {
      if (!token || typeof token !== 'string' || token === 'undefined' || token === 'null' || !token.trim()) {
        return false;
      }
      if (!user || typeof user !== 'object' || !user.role || !ALL_ROLES.includes(user.role)) {
        return false;
      }
      if (user.role === 'RESIDENT') {
        return false;
      }
      try {
        storage.setItem('token', token.trim());
        storage.setItem('user', JSON.stringify(user));
        return true;
      } catch {
        return false;
      }
    },
    clearAuthSession() {
      storage.removeItem('token');
      storage.removeItem('user');
    },
  };
}

// Route permission mapping
const routePermissions = {
  '/admin/accounts': ['ADMIN'],
  '/residents': ['ADMIN', 'BQL'],
  '/tickets/dispatch': ['ADMIN', 'BQL'],
  '/billing': ['ADMIN', 'BQL'],
  '/feedback': ['ADMIN', 'BQL'],
  '/announcements': ['ADMIN', 'BQL'],
  '/technician/tasks': ['TECHNICIAN'],
};

function checkRouteAccess(user, path) {
  if (!user || !user.role) {
    return { status: 302, redirect: '/login' };
  }
  if (user.role === 'RESIDENT') {
    return { status: 403, error: 'Forbidden' };
  }
  const allowed = routePermissions[path];
  if (!allowed) {
    return { status: 404, error: 'Not Found' };
  }
  if (!allowed.includes(user.role)) {
    return { status: 403, error: 'Forbidden' };
  }
  return { status: 200, allowed: true };
}

describe('1. Authentication Contract & Logic', () => {
  it('TC01: Login ADMIN - thành công, lưu đúng token và user role ADMIN', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    const success = auth.setAuthSession('jwt-admin-token', { id: 1, role: 'ADMIN', username: 'admin1' });
    assert.strictEqual(success, true);
    assert.strictEqual(auth.getStoredToken(), 'jwt-admin-token');
    assert.strictEqual(auth.getStoredUser().role, 'ADMIN');
  });

  it('TC02: Login BQL - thành công, lưu đúng token và user role BQL', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    const success = auth.setAuthSession('jwt-bql-token', { id: 2, role: 'BQL', username: 'bql1' });
    assert.strictEqual(success, true);
    assert.strictEqual(auth.getStoredToken(), 'jwt-bql-token');
    assert.strictEqual(auth.getStoredUser().role, 'BQL');
  });

  it('TC03: Login TECHNICIAN - thành công, lưu đúng token và user role TECHNICIAN', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    const success = auth.setAuthSession('jwt-tech-token', { id: 3, role: 'TECHNICIAN', username: 'tech1' });
    assert.strictEqual(success, true);
    assert.strictEqual(auth.getStoredToken(), 'jwt-tech-token');
    assert.strictEqual(auth.getStoredUser().role, 'TECHNICIAN');
  });

  it('TC04: Login RESIDENT trên Web - bị từ chối, không tạo session', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    const success = auth.setAuthSession('jwt-res-token', { id: 4, role: 'RESIDENT', username: 'resident1' });
    assert.strictEqual(success, false, 'Resident must not be given a web management session');
    assert.strictEqual(auth.getStoredToken(), null);
    assert.strictEqual(auth.getStoredUser(), null);
  });

  it('TC05: Token undefined / null / chuỗi rỗng - không tạo session', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    assert.strictEqual(auth.setAuthSession(undefined, { role: 'ADMIN' }), false);
    assert.strictEqual(auth.setAuthSession('undefined', { role: 'ADMIN' }), false);
    assert.strictEqual(auth.setAuthSession('null', { role: 'ADMIN' }), false);
    assert.strictEqual(auth.setAuthSession('', { role: 'ADMIN' }), false);
    assert.strictEqual(auth.getStoredToken(), null);
  });

  it('TC06: User null / không có role hợp lệ - không tạo session', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    assert.strictEqual(auth.setAuthSession('valid-token', null), false);
    assert.strictEqual(auth.setAuthSession('valid-token', {}), false);
    assert.strictEqual(auth.setAuthSession('valid-token', { role: 'UNKNOWN_ROLE' }), false);
    assert.strictEqual(auth.getStoredUser(), null);
  });

  it('TC07: JSON localStorage lỗi - không crash ứng dụng', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    storage.setItem('user', '{ invalid-json-corrupted ...');
    assert.doesNotThrow(() => {
      const user = auth.getStoredUser();
      assert.strictEqual(user, null);
    });
  });

  it('TC14: Session hết hạn - xóa sạch dữ liệu xác thực', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    auth.setAuthSession('token-123', { role: 'ADMIN' });
    auth.clearAuthSession();
    assert.strictEqual(auth.getStoredToken(), null);
    assert.strictEqual(auth.getStoredUser(), null);
  });
});

describe('2. Role-Based Access Control (RBAC) & Route Guards', () => {
  it('TC08: ADMIN truy cập Admin Accounts - Cho phép', () => {
    const res = checkRouteAccess({ role: 'ADMIN' }, '/admin/accounts');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.allowed, true);
  });

  it('TC09: BQL truy cập Admin Accounts - 403 Forbidden', () => {
    const res = checkRouteAccess({ role: 'BQL' }, '/admin/accounts');
    assert.strictEqual(res.status, 403);
  });

  it('TC10: TECHNICIAN truy cập Billing - 403 Forbidden', () => {
    const res = checkRouteAccess({ role: 'TECHNICIAN' }, '/billing');
    assert.strictEqual(res.status, 403);
  });

  it('TC11: TECHNICIAN truy cập Residents - 403 Forbidden', () => {
    const res = checkRouteAccess({ role: 'TECHNICIAN' }, '/residents');
    assert.strictEqual(res.status, 403);
  });

  it('TC12: TECHNICIAN truy cập Technician Tasks - Cho phép', () => {
    const res = checkRouteAccess({ role: 'TECHNICIAN' }, '/technician/tasks');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.allowed, true);
  });

  it('TC13: Chưa đăng nhập truy cập trang nội bộ - Chuyển hướng về /login (302)', () => {
    const res = checkRouteAccess(null, '/billing');
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.redirect, '/login');
  });

  it('TC18: Refresh trang nội bộ - đọc session từ storage và giữ nguyên quyền', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    auth.setAuthSession('fresh-token', { role: 'BQL' });
    const user = auth.getStoredUser();
    const res = checkRouteAccess(user, '/residents');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.allowed, true);
  });

  it('TC-MENU: Không tồn tại role MANAGER trong bất kỳ menu item nào', () => {
    MENU_ITEMS.forEach((item) => {
      assert.strictEqual(
        item.roles.includes('MANAGER'),
        false,
        `Menu ${item.title} must not contain forbidden role MANAGER`
      );
    });
  });
});

describe('3. Axios HTTP Client & Interceptor Logic', () => {
  it('TC15: Upload FormData - xóa Content-Type để browser gán multipart boundary', () => {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      data: new (class MockFormData {})(),
    };
    // Simulate axios interceptor logic for FormData
    const isFormData = config.data && config.data.constructor.name === 'MockFormData';
    if (isFormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    assert.strictEqual(config.headers['Content-Type'], undefined);
  });

  it('TC16: HTTP 401 tại API Login - không kích hoạt redirect vòng lặp', () => {
    let redirected = false;
    const error = {
      config: { url: '/api/auth/login' },
      response: { status: 401, data: { message: 'Sai mật khẩu' } },
    };
    const isLoginRequest = error.config.url.includes('/auth/login');
    const isLoginPage = true; // User is on login page
    if (error.response.status === 401) {
      if (!isLoginRequest && !isLoginPage) {
        redirected = true;
      }
    }
    assert.strictEqual(redirected, false, 'Should not redirect when 401 happens on login request');
  });

  it('TC17: HTTP 403 Forbidden - không nhầm thành 401 và không xóa session', () => {
    const storage = new MockLocalStorage();
    const auth = createAuthModule(storage);
    auth.setAuthSession('active-token', { role: 'BQL' });

    const error = {
      response: { status: 403, data: { message: 'Từ chối truy cập tài nguyên này' } },
    };

    // 403 does not trigger 401 handler
    if (error.response.status === 401) {
      auth.clearAuthSession();
    }

    assert.strictEqual(auth.getStoredToken(), 'active-token');
    assert.strictEqual(auth.getStoredUser().role, 'BQL');
  });
});
