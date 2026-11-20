const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
const axios = require('axios');

// Native rendering/storage are replaced only at the platform boundary.
// Screens, hooks, AuthProvider and Axios interceptors are the production modules.
const memory = new Map();
const storage = {
  getItem: async key => memory.get(key) ?? null,
  setItem: async (key, value) => { memory.set(key, value); },
  removeItem: async key => { memory.delete(key); },
};
const native = { Platform: { OS: 'android', select: values => values.android ?? values.default },
  StyleSheet: { create: styles => styles } };
for (const name of ['View', 'Text', 'TextInput', 'Pressable', 'ScrollView', 'RefreshControl',
  'ActivityIndicator', 'KeyboardAvoidingView', 'Image', 'Modal']) native[name] = name;
const load = Module._load;
Module._load = function(name, ...args) {
  if (name === 'react-native') return native;
  if (name === '@react-native-async-storage/async-storage') return storage;
  if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView', SafeAreaProvider: React.Fragment };
  if (name === '@react-navigation/native') return {
    useFocusEffect: callback => React.useEffect(callback, [callback]), NavigationContainer: React.Fragment,
  };
  return load.call(this, name, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const { apiClient, tokenStore, getAuthToken, setAuthToken, clearAuthToken } = require('../src/api/apiClient.ts');
const { createTokenStore } = require('../src/api/tokenStore.ts');
const { AuthProvider, useAuth } = require('../src/auth/AuthContext.tsx');
const { AuthScreen } = require('../src/screens/AuthScreen.tsx');
const { ProfileScreen } = require('../src/screens/ProfileScreen.tsx');
const { InvoiceScreen } = require('../src/screens/InvoiceScreen.tsx');
const { NotificationScreen } = require('../src/screens/NotificationScreen.tsx');
const { useResource } = require('../src/api/useResource.ts');
const { validatePassword, validMonth, safeQrUrl } = require('../src/api/resident.ts');
const resident = { id: 1, username: 'resident', fullName: 'Test Resident', role: 'RESIDENT', isApproved: true,
  email: null, phone: null, roomId: 2, room: { id: 2, roomNumber: 'A101', floor: 1, area: '72.5', status: 'OCCUPIED' } };
const invoice = { id: 7, month: '2026-11', managementFee: '100.00', parkingFee: '10.00', waterFee: '20.00',
  otherFee: '0.00', totalAmount: '130.00', paidAmount: '30.00', status: 'PARTIALLY_PAID', dueDate: null, payments: [] };
let renderer;
let calls;
let auth;
function ok(config, data, pagination) {
  return { config, status: 200, statusText: 'OK', headers: {}, data: { success: true, data, pagination } };
}
function fail(config, status, message) {
  throw new axios.AxiosError(message, 'ERR_BAD_RESPONSE', config, undefined, {
    config, status, statusText: 'Error', headers: {}, data: { success: false, data: null, message },
  });
}
function adapter(handler) {
  apiClient.defaults.adapter = async config => { calls.push(config); return handler(config); };
}
function Probe() { auth = useAuth(); return React.createElement('AuthState', { user: auth.user, restoring: auth.restoring }); }
async function mount(component, provider = false) {
  await act(async () => { renderer = create(provider
    ? React.createElement(AuthProvider, null, React.createElement(Probe), React.createElement(component))
    : React.createElement(component)); });
}
async function flush() { await act(async () => { await new Promise(resolve => setImmediate(resolve)); }); }
function text() { return renderer.root.findAllByType('Text').map(node => node.children.filter(child => typeof child === 'string' || typeof child === 'number').join('')).join(' '); }
async function input(label, value) {
  await act(async () => renderer.root.findAllByType('TextInput').find(node => node.props.accessibilityLabel === label).props.onChangeText(value));
}
async function press(title) {
  const button = renderer.root.findAllByType('Pressable').find(node =>
    node.findAllByType('Text').some(child => child.props.children === title));
  assert.ok(button, 'Missing button ' + title);
  assert.equal(button.props.disabled, false);
  await act(async () => { button.props.onPress(); });
}
beforeEach(async () => {
  calls = [];
  await clearAuthToken();
  auth = null;
  adapter(config => ok(config, resident));
});
afterEach(async () => { if (renderer) { await act(async () => renderer.unmount()); renderer = null; } });

test('token interceptor attaches JWT and clears current session on 401', async () => {
  await setAuthToken(' valid-token ');
  adapter(config => {
    assert.equal(config.headers.get('Authorization'), 'Bearer valid-token');
    return fail(config, 401, 'Expired');
  });
  await assert.rejects(apiClient.get('/private'));
  assert.equal(await getAuthToken(), null);
});
test('late 401 cannot revoke a new login, even if JWT text is identical', async () => {
  await setAuthToken('same-token');
  let finish;
  adapter(config => new Promise((resolve, reject) => { finish = () => {
    try { fail(config, 401, 'Old response'); } catch (error) { reject(error); }
  }; }));
  const pending = apiClient.get('/slow');
  await new Promise(resolve => setImmediate(resolve));
  await setAuthToken('same-token');
  finish();
  await assert.rejects(pending);
  assert.equal(await getAuthToken(), 'same-token');
});
test('login 401 does not attach or erase an existing token', async () => {
  await setAuthToken('existing-token');
  adapter(config => { assert.equal(config.headers.get('Authorization'), undefined); return fail(config, 401, 'Wrong password'); });
  await assert.rejects(apiClient.post('/api/auth/login', {}));
  assert.equal(await getAuthToken(), 'existing-token');
});
test('serialized storage prevents a slow login write from surviving logout', async () => {
  let finish;
  let stored = null;
  const store = createTokenStore({ getItem: async () => stored, removeItem: async () => { stored = null; },
    setItem: async (key, value) => { await new Promise(resolve => { finish = resolve; }); stored = value; } });
  const login = store.set('token');
  await Promise.resolve();
  const logout = store.clear();
  finish();
  await Promise.all([login, logout]);
  assert.equal(stored, null);
  assert.equal((await store.snapshot()).token, null);
});
test('storage failure revokes memory, notifies subscribers and remains retryable', async () => {
  let broken = true, notified = 0;
  const store = createTokenStore({ getItem: async () => 'old', setItem: async () => {},
    removeItem: async () => { if (broken) throw new Error('Disk error'); } });
  await store.snapshot();
  store.subscribe(() => { notified++; });
  await assert.rejects(store.clear());
  assert.equal((await store.snapshot()).token, null);
  assert.equal(notified, 1);
  broken = false;
  await store.clear();
});
test('successful form login sends identifier, persists token and blocks duplicate submit', async () => {
  let finish;
  adapter(config => new Promise(resolve => { finish = () => resolve(ok(config, { token: 'login-token', user: resident })); }));
  await mount(AuthScreen, true);
  await input('Tên đăng nhập, email hoặc số điện thoại', ' resident ');
  await input('Mật khẩu', 'password');
  await press('Đăng nhập');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].data), { identifier: 'resident', password: 'password' });
  assert.equal(renderer.root.findAllByType('Pressable').find(node => node.props.disabled).props.disabled, true);
  await act(async () => finish());
  assert.equal(auth.user.id, 1);
  assert.equal(await getAuthToken(), 'login-token');
});
test('empty login form makes no request; rejected login displays backend message', async () => {
  await mount(AuthScreen, true);
  await press('Đăng nhập');
  assert.equal(calls.length, 0);
  adapter(config => fail(config, 403, 'Account awaiting approval'));
  await input('Tên đăng nhập, email hoặc số điện thoại', 'resident');
  await input('Mật khẩu', 'password');
  await press('Đăng nhập');
  assert.match(text(), /Account awaiting approval/);
  assert.equal(auth.user, null);
});
test('non-resident login is rejected before persisting its JWT', async () => {
  adapter(config => ok(config, { token: 'admin-token', user: { ...resident, role: 'ADMIN' } }));
  await mount(AuthScreen, true);
  await input('Tên đăng nhập, email hoặc số điện thoại', 'admin');
  await input('Mật khẩu', 'password');
  await press('Đăng nhập');
  assert.equal(auth.user, null);
  assert.equal(await getAuthToken(), null);
});
test('restores valid session, and logout removes user and persisted token', async () => {
  await setAuthToken('saved');
  await mount(() => null, true);
  assert.equal(auth.user.id, 1);
  assert.equal(auth.restoring, false);
  await act(async () => auth.signOut());
  assert.equal(auth.user, null);
  assert.equal(await getAuthToken(), null);
});
test('offline restore preserves token and offers retry; 401 ends the session', async () => {
  await setAuthToken('saved');
  adapter(config => { throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config); });
  await mount(() => null, true);
  assert.ok(auth.restoreError);
  assert.equal(await getAuthToken(), 'saved');
  adapter(config => fail(config, 401, 'Expired'));
  await act(async () => auth.restore());
  assert.equal(auth.user, null);
  assert.equal(auth.restoring, false);
  assert.equal(await getAuthToken(), null);
});
test('late profile response after logout cannot restore the previous user', async () => {
  await setAuthToken('saved');
  let finish;
  adapter(config => new Promise(resolve => { finish = () => resolve(ok(config, resident)); }));
  await mount(() => null, true);
  await act(async () => auth.signOut());
  await act(async () => finish());
  assert.equal(auth.user, null);
  assert.equal(await getAuthToken(), null);
});
test('profile renders real room fields and change-password validates before POST', async () => {
  adapter(config => ok(config, config.url.endsWith('change-password') ? null : resident));
  await mount(ProfileScreen, true);
  assert.match(text(), /A101/);
  assert.match(text(), /72.5/);
  await press('Đổi mật khẩu');
  await input('Mật khẩu hiện tại', 'oldpass');
  await input('Mật khẩu mới (6–100 ký tự)', 'newpass');
  await input('Nhập lại mật khẩu mới', 'wrong');
  await press('Lưu mật khẩu mới');
  assert.equal(calls.filter(c => c.method === 'post').length, 0);
  await input('Nhập lại mật khẩu mới', 'newpass');
  await press('Lưu mật khẩu mới');
  const request = calls.find(c => c.method === 'post');
  assert.deepEqual(JSON.parse(request.data), { currentPassword: 'oldpass', newPassword: 'newpass', confirmPassword: 'newpass' });
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
});
test('profile without a linked room renders an explanation instead of crashing', async () => {
  adapter(config => ok(config, { ...resident, roomId: null, room: null }));
  await mount(ProfileScreen, true);
  assert.match(text(), /chưa được gắn căn hộ/);
});
test('invoice flow uses server QR and remaining balance, never a payment write', async () => {
  adapter(config => ok(config, config.url.includes('/vietqr')
    ? { invoiceId: 7, remainingAmount: '100.00', paidAmount: '30.00', isFullyPaid: false, vietQrUrl: 'https://img.vietqr.io/test.png' }
    : [invoice]));
  await mount(InvoiceScreen);
  await press('Xem chi tiết và thanh toán');
  const image = renderer.root.findByType('Image');
  assert.equal(image.props.source.uri, 'https://img.vietqr.io/test.png');
  assert.match(text(), /Ban quản lý đối soát/);
  await act(async () => image.props.onError());
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  await press('Thử lại');
  assert.equal(renderer.root.findAllByType('Image').length, 1);
  await press('Kiểm tra lại thanh toán');
  assert.ok(calls.every(c => c.method === 'get'));
});
test('fully paid invoice has no QR image; invalid month never triggers a filtered request', async () => {
  adapter(config => ok(config, config.url.includes('/vietqr')
    ? { invoiceId: 7, remainingAmount: '0', paidAmount: '130', isFullyPaid: true, vietQrUrl: null } : [invoice]));
  await mount(InvoiceScreen);
  await input('Tháng (YYYY-MM, để trống để xem tất cả)', '2026-13');
  await press('Tra cứu');
  assert.equal(calls.length, 1);
  await input('Tháng (YYYY-MM, để trống để xem tất cả)', '2026-11');
  await press('Tra cứu');
  assert.ok(calls.some(c => c.url.endsWith('?month=2026-11')));
  await press('Xem chi tiết và thanh toán');
  assert.equal(renderer.root.findAllByType('Image').length, 0);
  assert.match(text(), /Đã thanh toán đầy đủ/);
});
test('notification pagination and detail use backend pages without supplying a room override', async () => {
  adapter(config => ok(config, [{ id: 1, title: 'Building notice', content: 'Full content', targetRoom: null, createdAt: '2026-11-18T00:00:00Z' }],
    { page: config.url.includes('page=2') ? 2 : 1, totalPages: 2, total: 21, limit: 20 }));
  await mount(NotificationScreen);
  await press('Đọc thông báo');
  assert.match(text(), /Full content/);
  await press('Đóng thông báo');
  await press('Trang sau');
  assert.ok(calls.some(c => c.url.includes('page=2')));
  assert.ok(calls.every(c => !c.url.includes('targetRoom')));
  await press('Trang trước');
  assert.match(calls.at(-1).url, /page=1/);
});
test('resource empty state, request error and retry are visible in notifications', async () => {
  adapter(config => fail(config, 500, 'Temporary failure'));
  await mount(NotificationScreen);
  assert.match(text(), /Temporary failure/);
  adapter(config => ok(config, [], { page: 1, totalPages: 0, total: 0, limit: 20 }));
  await press('Thử lại');
  assert.match(text(), /Chưa có thông báo/);
});
test('changing resource URL cancels an older response', async () => {
  let result, finishOld;
  function Resource({ url }) { result = useResource(url); return null; }
  adapter(config => config.url === '/old'
    ? new Promise(resolve => { finishOld = () => resolve(ok(config, 'old')); })
    : ok(config, 'new'));
  await act(async () => { renderer = create(React.createElement(Resource, { url: '/old' })); });
  await act(async () => renderer.update(React.createElement(Resource, { url: '/new' })));
  assert.equal(result.data, 'new');
  await act(async () => finishOld());
  await flush();
  assert.equal(result.data, 'new');
});
test('input policies match backend password bounds and reject unsafe QR schemes', () => {
  assert.ok(validatePassword('old', '12345', '12345'));
  assert.ok(validatePassword('samepass', 'samepass', 'samepass'));
  assert.equal(validatePassword('oldpass', 'newpass', 'newpass'), null);
  assert.equal(validMonth('2026-00'), false);
  assert.equal(validMonth('2026-12'), true);
  assert.equal(safeQrUrl('data:image/png;base64,xxx'), null);
  assert.equal(safeQrUrl('javascript:alert(1)'), null);
});
