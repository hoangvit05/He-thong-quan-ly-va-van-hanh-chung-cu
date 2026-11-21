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
    useFocusEffect: callback => React.useEffect(callback, [callback]),
    NavigationContainer: ({ children }) => React.createElement('NavigationContainer', null, children),
  };
  // Keep AppNavigator and its first real screen; replace only the native tab renderer.
  if (name === '@react-navigation/bottom-tabs') return { createBottomTabNavigator: () => ({
    Navigator: ({ children }) => React.createElement(React.Children.toArray(children)[0].props.component),
    Screen: () => null,
  }) };
  return load.call(this, name, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const { default: App } = require('../App.tsx');
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


// Exercise the real entry point and navigation composition, not a manually wrapped screen.
test('app entry shows login without a saved session and does not fetch private data', async () => {
  await mount(App);
  assert.match(text(), /Chào mừng về nhà/);
  assert.equal(calls.length, 0);
  assert.equal(renderer.root.findAllByType('NavigationContainer').length, 0);
});

test('app entry holds the loading gate until session restoration finishes', async () => {
  await setAuthToken('saved');
  let finish;
  adapter(config => new Promise(resolve => { finish = () => resolve(ok(config, resident)); }));
  await mount(App);
  assert.equal(renderer.root.findAllByType('ActivityIndicator').length, 1);
  assert.equal(renderer.root.findAllByType('TextInput').length, 0);
  assert.equal(renderer.root.findAllByType('NavigationContainer').length, 0);
  adapter(config => ok(config, resident));
  await act(async () => finish());
  assert.match(text(), /Căn hộ của tôi/);
  assert.match(text(), /A101/);
});

test('app entry completes login and logout through the actual session gate', async () => {
  adapter(config => ok(config, config.url.endsWith('/login')
    ? { token: 'login-token', user: resident } : resident));
  await mount(App);
  await input('Tên đăng nhập, email hoặc số điện thoại', 'resident');
  await input('Mật khẩu', 'password');
  await press('Đăng nhập');
  assert.match(text(), /Căn hộ của tôi/);
  assert.equal(renderer.root.findAllByType('NavigationContainer').length, 1);
  await press('Đăng xuất');
  assert.match(text(), /Chào mừng về nhà/);
  assert.equal(renderer.root.findAllByType('NavigationContainer').length, 0);
  assert.equal(await getAuthToken(), null);
});

test('app entry returns an expired saved session to login without a retry loop', async () => {
  await setAuthToken('expired');
  adapter(config => fail(config, 401, 'Expired'));
  await mount(App);
  assert.match(text(), /Chào mừng về nhà/);
  assert.doesNotMatch(text(), /Kết nối lại phiên đăng nhập/);
  assert.equal(await getAuthToken(), null);
});

test('app entry retries an offline restore and opens the resident profile', async () => {
  await setAuthToken('saved');
  adapter(config => { throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config); });
  await mount(App);
  assert.match(text(), /Kết nối lại phiên đăng nhập/);
  assert.equal(await getAuthToken(), 'saved');
  adapter(config => ok(config, resident));
  await press('Thử lại');
  assert.match(text(), /Căn hộ của tôi/);
  assert.doesNotMatch(text(), /Kết nối lại phiên đăng nhập/);
});

test('app entry allows abandoning an offline session and signing in again', async () => {
  await setAuthToken('saved');
  adapter(config => { throw new axios.AxiosError('Network Error', 'ERR_NETWORK', config); });
  await mount(App);
  await press('Xóa phiên và đăng nhập lại');
  assert.match(text(), /Chào mừng về nhà/);
  assert.equal(await getAuthToken(), null);
});

test('app entry removes private screens when an active session receives 401', async () => {
  await setAuthToken('saved');
  await mount(App);
  assert.match(text(), /Căn hộ của tôi/);
  adapter(config => fail(config, 401, 'Expired'));
  await act(async () => { await assert.rejects(apiClient.get('/private')); });
  assert.match(text(), /Chào mừng về nhà/);
  assert.equal(renderer.root.findAllByType('NavigationContainer').length, 0);
});

test('unapproved resident cannot save a login token', async () => {
  adapter(config => ok(config, { token: 'pending-token', user: { ...resident, isApproved: false } }));
  await mount(AuthScreen, true);
  await input('Tên đăng nhập, email hoặc số điện thoại', 'pending');
  await input('Mật khẩu', 'password');
  await press('Đăng nhập');
  assert.match(text(), /chờ Ban quản lý phê duyệt/);
  assert.equal(auth.user, null);
  assert.equal(await getAuthToken(), null);
});

test('late ineligible restore cannot revoke a newer valid login', async () => {
  await setAuthToken('old-session');
  let finishOld;
  adapter(config => new Promise(resolve => {
    finishOld = () => resolve(ok(config, { ...resident, isApproved: false }));
  }));
  await mount(() => null, true);
  adapter(config => ok(config, { token: 'new-session', user: resident }));
  await act(async () => auth.signIn('resident', 'password'));
  await act(async () => finishOld());
  assert.equal(auth.user.id, resident.id);
  assert.equal(await getAuthToken(), 'new-session');
  assert.equal(auth.restoreError, '');
  assert.equal(auth.restoring, false);
});

const { CreateTicketScreen } = require('../src/screens/CreateTicketScreen.tsx');
const { TicketTimelineScreen } = require('../src/screens/TicketTimelineScreen.tsx');
const { RatingScreen } = require('../src/screens/RatingScreen.tsx');
const { FeedbackScreen } = require('../src/screens/FeedbackScreen.tsx');
const { validateTicket, validateFeedback } = require('../src/api/maintenance.ts');
const ticketFixture = { id: 42, title: 'Rò nước', category: 'Nước', description: 'Ống nước dưới bồn bị rò',
  residentId: 1, roomId: 2, room: { roomNumber: 'A101' }, status: 'PENDING', isDuplicate: false,
  createdAt: '2026-11-20T01:00:00Z', updatedAt: '2026-11-20T02:00:00Z', rating: null, ratingComment: null };
const feedbackFixture = { id: 9, title: 'Vệ sinh hành lang', content: 'Đề nghị vệ sinh hành lang tầng một',
  reply: 'Đã lên lịch vệ sinh.', isResolved: true, createdAt: '2026-11-20T01:00:00Z', repliedAt: '2026-11-20T02:00:00Z' };
const pagination = (page = 1, totalPages = 1) => ({ page, totalPages, limit: 10, total: totalPages * 10 });
async function fillTicket() {
  await input('Danh mục sự cố', ' Nước ');
  await input('Mô tả sự cố', ' Ống nước dưới bồn bị rò ');
}
function visibleButton(title) {
  return renderer.root.findAllByType('Pressable').find(node => node.findAllByType('Text').some(child => child.props.children === title));
}

test('ticket form validates before POST and sends only resident input; duplicate remains accepted', async () => {
  adapter(config => ok(config, { ...ticketFixture, isDuplicate: true }));
  await mount(CreateTicketScreen);
  await press('Gửi báo hỏng');
  assert.equal(calls.length, 0);
  assert.match(text(), /Danh mục cần/);
  await fillTicket();
  await press('Gửi báo hỏng');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/tickets');
  assert.deepEqual(JSON.parse(calls[0].data), { category: 'Nước', description: 'Ống nước dưới bồn bị rò' });
  assert.match(text(), /Đã tiếp nhận phiếu #42/);
  assert.match(text(), /Phiếu vẫn được tiếp nhận/);
  assert.equal(visibleButton('Gửi báo hỏng'), undefined);
  await press('Tạo phiếu khác');
  assert.equal(renderer.root.findAllByType('TextInput').find(n => n.props.accessibilityLabel === 'Danh mục sự cố').props.value, '');
});

test('ticket common area explicitly sends null and immediate double tap makes one POST', async () => {
  let finish;
  adapter(config => new Promise(resolve => { finish = () => resolve(ok(config, ticketFixture)); }));
  await mount(CreateTicketScreen); await fillTicket(); await press('Chuyển sang khu vực chung');
  const handler = visibleButton('Gửi báo hỏng').props.onPress;
  await act(async () => { handler(); handler(); });
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].data).roomId, null);
  assert.equal(visibleButton('Đang gửi...').props.disabled, true);
  await act(async () => finish());
});

test('ticket POST conflict keeps input and displays backend reason without auto-retry', async () => {
  adapter(config => fail(config, 409, 'Vui lòng đợi trước khi gửi phiếu tiếp theo.'));
  await mount(CreateTicketScreen); await fillTicket(); await press('Gửi báo hỏng');
  assert.equal(calls.length, 1);
  assert.match(text(), /Vui lòng đợi/);
  assert.equal(renderer.root.findAllByType('TextInput').find(n => n.props.accessibilityLabel === 'Danh mục sự cố').props.value, ' Nước ');
  assert.equal(visibleButton('Gửi báo hỏng').props.disabled, false);
});

test('leaving ticket form cancels the request and ignores its late success', async () => {
  let finish;
  adapter(config => new Promise(resolve => { finish = () => resolve(ok(config, ticketFixture)); }));
  await mount(CreateTicketScreen); await fillTicket(); await press('Gửi báo hỏng');
  const signal = calls[0].signal;
  await act(async () => renderer.unmount()); renderer = null;
  assert.equal(signal.aborted, true);
  await act(async () => finish());
});

test('ticket list paginates only own endpoint and detail reload shows current status', async () => {
  let detailStatus = 'ASSIGNED';
  adapter(config => config.url === '/api/tickets/42'
    ? ok(config, { ...ticketFixture, status: detailStatus, technician: { fullName: 'Thợ A', phone: '0900000000' } })
    : ok(config, [ticketFixture], pagination(config.url.includes('page=2') ? 2 : 1, 2)));
  await mount(TicketTimelineScreen); await press('Trang sau');
  assert.equal(calls.at(-1).url, '/api/tickets/my-tickets?page=2&limit=10');
  await press('Xem phiếu #42');
  assert.equal(calls.at(-1).url, '/api/tickets/42');
  assert.match(text(), /Đã gán thợ — Hiện tại/); assert.match(text(), /Thợ A/);
  detailStatus = 'COMPLETED';
  await press('Cập nhật tiến độ');
  assert.match(text(), /Đã sửa xong — Hiện tại/);
  assert.doesNotMatch(text(), /Đã gán thợ — Hiện tại/);
  assert.ok(calls.every(c => !c.url.includes('residentId') && !c.url.includes('roomId')));
});

test('closed ticket without rating is not presented as accepted repair', async () => {
  adapter(config => ok(config, config.url === '/api/tickets/42'
    ? { ...ticketFixture, status: 'CLOSED' } : [ticketFixture], pagination()));
  await mount(TicketTimelineScreen); await press('Xem phiếu #42');
  assert.match(text(), /Đóng phiếu — Hiện tại/);
  assert.doesNotMatch(text(), /Đã sửa xong — Hiện tại/);
  assert.match(text(), /Phiếu đóng có thể là phiếu đã hủy/);
  assert.doesNotMatch(text(), /null\/5/);
});

test('ticket list and detail errors are retryable and do not show private stale data', async () => {
  adapter(config => fail(config, 500, 'Tạm thời không tải được phiếu.'));
  await mount(TicketTimelineScreen);
  assert.match(text(), /Tạm thời không tải được phiếu/);
  adapter(config => ok(config, [ticketFixture], pagination()));
  await press('Thử lại');
  adapter(config => fail(config, 403, 'Bạn không có quyền xem phiếu này.'));
  await press('Xem phiếu #42');
  assert.match(text(), /Bạn không có quyền xem phiếu này/);
  assert.doesNotMatch(text(), /Ống nước dưới bồn bị rò/);
});

test('rating requires stars and explicit acceptance, sends ratingComment and refreshes pending list', async () => {
  let rated = false;
  adapter(config => {
    if (config.method === 'post') { rated = true; return ok(config, { ...ticketFixture, status: 'CLOSED', rating: 4 }); }
    return ok(config, config.url === '/api/tickets/42'
      ? { ...ticketFixture, status: 'COMPLETED' }
      : rated ? [] : [{ ...ticketFixture, status: 'COMPLETED' }], pagination());
  });
  await mount(RatingScreen);
  assert.equal(calls[0].url, '/api/tickets/my-tickets?page=1&limit=10&status=COMPLETED');
  await press('Nghiệm thu phiếu #42');
  await press('Gửi đánh giá và đóng phiếu');
  assert.match(text(), /Chọn điểm đánh giá/);
  await press('4 sao'); await press('Gửi đánh giá và đóng phiếu');
  assert.match(text(), /Vui lòng xác nhận/);
  assert.equal(calls.filter(c => c.method === 'post').length, 0);
  await input('Nhận xét nghiệm thu (không bắt buộc)', ' Sửa tốt ');
  await press('Xác nhận đã kiểm tra sửa chữa');
  await press('Gửi đánh giá và đóng phiếu');
  const post = calls.find(c => c.method === 'post');
  assert.equal(post.url, '/api/tickets/42/rate');
  assert.deepEqual(JSON.parse(post.data), { rating: 4, ratingComment: 'Sửa tốt' });
  assert.match(text(), /Đã ghi nhận đánh giá/);
  assert.match(text(), /Không có phiếu đang chờ nghiệm thu/);
});

test('rating rechecks detail and refuses a ticket that was already closed', async () => {
  adapter(config => ok(config, config.url === '/api/tickets/42'
    ? { ...ticketFixture, status: 'CLOSED' } : [{ ...ticketFixture, status: 'COMPLETED' }], pagination()));
  await mount(RatingScreen); await press('Nghiệm thu phiếu #42');
  assert.match(text(), /Phiếu không còn ở trạng thái chờ nghiệm thu/);
  assert.equal(visibleButton('Gửi đánh giá và đóng phiếu'), undefined);
  assert.equal(calls.filter(c => c.method === 'post').length, 0);
});

test('rating double tap sends once and backend rejection keeps the form', async () => {
  let rejectPost;
  adapter(config => {
    if (config.method === 'post') return new Promise((resolve, reject) => { rejectPost = () => {
      try { fail(config, 400, 'Phiếu đã đóng trước đó.'); } catch (error) { reject(error); }
    }; });
    return ok(config, config.url === '/api/tickets/42' ? { ...ticketFixture, status: 'COMPLETED' }
      : [{ ...ticketFixture, status: 'COMPLETED' }], pagination());
  });
  await mount(RatingScreen); await press('Nghiệm thu phiếu #42'); await press('5 sao'); await press('Xác nhận đã kiểm tra sửa chữa');
  const handler = visibleButton('Gửi đánh giá và đóng phiếu').props.onPress;
  await act(async () => { handler(); handler(); });
  assert.equal(calls.filter(c => c.method === 'post').length, 1);
  await act(async () => rejectPost());
  assert.match(text(), /Phiếu đã đóng trước đó/);
  assert.equal(visibleButton('Gửi đánh giá và đóng phiếu').props.disabled, false);
});

test('feedback shows BQL reply, validates form and posts only title/content then resets to first page', async () => {
  adapter(config => ok(config, config.method === 'post' ? feedbackFixture : [feedbackFixture],
    pagination(config.url.includes('page=2') ? 2 : 1, 2)));
  await mount(FeedbackScreen);
  assert.match(text(), /Đã lên lịch vệ sinh/); assert.match(text(), /Đã giải quyết/);
  await press('Gửi góp ý');
  assert.equal(calls.filter(c => c.method === 'post').length, 0);
  await press('Trang sau');
  await input('Tiêu đề góp ý', ' Vệ sinh hành lang ');
  await input('Nội dung góp ý', ' Đề nghị vệ sinh hành lang tầng một ');
  await press('Gửi góp ý');
  const post = calls.find(c => c.method === 'post');
  assert.equal(post.url, '/api/feedback');
  assert.deepEqual(JSON.parse(post.data), { title: 'Vệ sinh hành lang', content: 'Đề nghị vệ sinh hành lang tầng một' });
  assert.equal(calls.at(-1).url, '/api/feedback/my-feedback?page=1&limit=10');
  assert.match(text(), /Đã tiếp nhận góp ý #9/);
  assert.equal(renderer.root.findAllByType('TextInput').find(n => n.props.accessibilityLabel === 'Tiêu đề góp ý').props.value, '');
});

test('feedback failure preserves content, prevents double submission and leaves retry available', async () => {
  let finish;
  adapter(config => config.method === 'post' ? new Promise((resolve, reject) => { finish = () => {
    try { fail(config, 500, 'Chưa gửi được góp ý.'); } catch (error) { reject(error); }
  }; }) : ok(config, [], pagination()));
  await mount(FeedbackScreen);
  assert.match(text(), /Bạn chưa gửi góp ý nào/);
  await input('Tiêu đề góp ý', 'Vệ sinh'); await input('Nội dung góp ý', 'Cần vệ sinh hành lang');
  const handler = visibleButton('Gửi góp ý').props.onPress;
  await act(async () => { handler(); handler(); });
  assert.equal(calls.filter(c => c.method === 'post').length, 1);
  await act(async () => finish());
  assert.match(text(), /Chưa gửi được góp ý/);
  assert.equal(renderer.root.findAllByType('TextInput').find(n => n.props.accessibilityLabel === 'Nội dung góp ý').props.value, 'Cần vệ sinh hành lang');
  assert.equal(visibleButton('Gửi góp ý').props.disabled, false);
});

test('feedback list error can retry without resending a feedback', async () => {
  adapter(config => fail(config, 500, 'Lỗi danh sách góp ý.'));
  await mount(FeedbackScreen); assert.match(text(), /Lỗi danh sách góp ý/);
  adapter(config => ok(config, [{ ...feedbackFixture, reply: null, repliedAt: null, isResolved: false }], pagination()));
  await press('Thử lại');
  assert.match(text(), /Chưa có phản hồi/); assert.match(text(), /Đang xử lý/);
  assert.ok(calls.every(config => config.method === 'get'));
});

test('maintenance input limits match backend contracts, including no Base64 feedback', () => {
  assert.equal(validateTicket('a'.repeat(100), 'a'.repeat(50), 'a'.repeat(2000)), '');
  assert.ok(validateTicket('a'.repeat(101), 'Nước', 'Rò nước'));
  assert.ok(validateTicket('', ' ', 'Rò nước'));
  assert.ok(validateTicket('', 'Nước', ' 1234 '));
  assert.ok(validateTicket('', 'a'.repeat(51), 'Rò nước'));
  assert.ok(validateTicket('', 'Nước', 'a'.repeat(2001)));
  assert.equal(validateFeedback('abc', '12345'), '');
  assert.equal(validateFeedback('a'.repeat(200), 'a'.repeat(2000)), '');
  assert.ok(validateFeedback('ab', '12345'));
  assert.ok(validateFeedback('a'.repeat(201), '12345'));
  assert.ok(validateFeedback('abc', '1234'));
  assert.ok(validateFeedback('abc', 'a'.repeat(2001)));
  assert.ok(validateFeedback('abc', 'data:image/png;base64,aaaa'));
});
