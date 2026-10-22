# TÀI LIỆU KỸ THUẬT & HỢP ĐỒNG API: PHÂN HỆ THÔNG BÁO TÒA NHÀ & SOCKET.IO REALTIME
**Phiên bản:** 1.0 (V1 Baseline)
**Phụ trách:** Việt Hoàng (Backend Lead)
**Tương thích:** Web Portal (React Vite) & Mobile App (React Native)

---

## 1. TỔNG QUAN KIẾN TRÚC PHÂN HỆ NOTIFICATIONS V1

Phân hệ Thông báo V1 phục vụ 2 kênh tiếp cận:
1. **REST API:** Tra cứu lịch sử thông báo có phân trang và gửi thông báo mới.
2. **Socket.IO Realtime:** Đẩy sự kiện thông báo tức thời tới Web và Mobile đang mở trên màn hình.

> [!NOTE]
> **Quy ước mô hình dữ liệu V1 (Không có trạng thái đọc cá nhân):**
> Model CSDL hiện tại gồm: `id`, `title`, `content`, `targetRoom` (null hoặc số phòng), `authorId`, `createdAt`.
> V1 hoạt động theo cơ chế **Bảng tin & Thông báo theo căn hộ** (Broadcast & Apartment-targeted), chưa có tính năng đánh dấu đã đọc (`isRead`) hay đếm số thông báo chưa đọc riêng cho từng tài khoản.

---

## 2. ĐẶC TẢ RESTFUL API

### A. Lấy danh sách thông báo
- **Phương thức & Đường dẫn:** `GET /api/notifications`
- **Xác thực:** Bắt buộc Header `Authorization: Bearer <JWT_TOKEN>`.
- **Phân quyền truy cập (RBAC & Data Isolation):**
  - **ADMIN / BQL:** Xem toàn bộ thông báo tòa nhà (có thể lọc thêm theo `targetRoom`).
  - **RESIDENT (Cư dân):** Chỉ nhận thông báo chung toàn tòa nhà (`targetRoom IS NULL`) VÀ thông báo gửi riêng cho căn hộ mà cư dân đang cư trú theo CSDL Backend. Nếu cư dân chưa gán phòng, chỉ nhận thông báo chung.
  - **TECHNICIAN (Thợ kỹ thuật):** Chỉ nhận thông báo chung toàn tòa nhà (`targetRoom IS NULL`).

#### Query Parameters:
| Tham số | Kiểu dữ liệu | Mặc định | Giới hạn | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | `1` | $\ge 1$ | Số trang cần xem |
| `limit` | `number` | `20` | $1 \le \text{limit} \le 50$ | Số bản ghi trên mỗi trang |
| `targetRoom` | `string` | `undefined` | Tối đa 50 ký tự | Tùy chọn lọc theo số phòng (chỉ áp dụng cho ADMIN/BQL) |

#### Response Thành công (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "title": "Thông báo kiểm tra hệ thống PCCC",
      "content": "Ban Quản Lý sẽ tiến hành thử chuông báo cháy lúc 10h sáng thứ Bảy.",
      "targetRoom": null,
      "authorId": 2,
      "createdAt": "2026-10-22T08:30:00.000Z",
      "author": {
        "id": 2,
        "fullName": "Ban Quản Lý Tòa Nhà",
        "role": "BQL",
        "username": "bql_truong"
      }
    }
  ],
  "message": "Lấy danh sách thông báo thành công.",
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### B. Soạn và phát thông báo mới
- **Phương thức & Đường dẫn:** `POST /api/notifications`
- **Xác thực:** Bắt buộc Header `Authorization: Bearer <JWT_TOKEN>`.
- **Phân quyền vai trò:** Chỉ dành cho `ADMIN` và `BQL` (Chặn `TECHNICIAN` và `RESIDENT` với mã lỗi `403 Forbidden`).

#### Request Body (`application/json`):
```json
{
  "title": "Nhắc nhở kiểm tra đồng hồ nước",
  "content": "Kính mời quý cư dân căn hộ P.305 tạo điều kiện cho nhân viên kỹ thuật kiểm tra công tơ nước.",
  "targetRoom": "P.305"
}
```
*Ghi chú về trường `targetRoom`:*
- Nếu gửi thông báo chung toàn chung cư: truyền `null` hoặc bỏ qua trường này.
- Nếu gửi riêng căn hộ: truyền số phòng (ví dụ: `"P.305"`). Backend sẽ kiểm tra trong CSDL: nếu số phòng không tồn tại sẽ trả về lỗi `400 Bad Request`.
- Trường `authorId` được lấy tuyệt đối từ Token đã xác thực, client không thể can thiệp.

#### Response Thành công (`201 Created`):
```json
{
  "success": true,
  "data": {
    "id": 16,
    "title": "Nhắc nhở kiểm tra đồng hồ nước",
    "content": "Kính mời quý cư dân căn hộ P.305 tạo điều kiện cho nhân viên kỹ thuật kiểm tra công tơ nước.",
    "targetRoom": "P.305",
    "authorId": 2,
    "createdAt": "2026-10-22T08:35:00.000Z",
    "author": {
      "id": 2,
      "fullName": "Ban Quản Lý Tòa Nhà",
      "role": "BQL",
      "username": "bql_truong"
    }
  },
  "message": "Tạo và gửi thông báo tới căn hộ [P.305] thành công."
}
```

#### Các mã lỗi HTTP quan trọng:
| Mã lỗi | Nguyên nhân | Phản hồi mẫu |
| :--- | :--- | :--- |
| `400 Bad Request` | Tiêu đề < 3 ký tự, nội dung < 5 ký tự, chứa Base64, hoặc căn hộ đích không tồn tại | `{"success": false, "data": null, "message": "Căn hộ đích [P.999] không tồn tại trong hệ thống tòa nhà."}` |
| `401 Unauthorized` | Thiếu token, token sai chữ ký hoặc token đã hết hạn | `{"success": false, "data": null, "message": "Yêu cầu đăng nhập. Vui lòng cung cấp Authorization Bearer Token hợp lệ."}` |
| `403 Forbidden` | Cư dân hoặc thợ kỹ thuật cố tạo thông báo | `{"success": false, "data": null, "message": "Từ chối truy cập! Vai trò [RESIDENT] không có quyền thực hiện thao tác này."}` |
| `500 Internal Error` | Lỗi kết nối cơ sở dữ liệu PostgreSQL | `{"success": false, "data": null, "message": "Lỗi máy chủ khi tạo thông báo."}` |

---

## 3. ĐẶC TẢ SOCKET.IO REALTIME

### A. Kết nối, Xác thực Handshake & Vòng đời Token (Handshake Authentication & Lifecycle)
Backend lắng nghe kết nối WebSocket tại cổng HTTP Server chính (cùng cổng với Express, mặc định `5000`).

Client (Web React hoặc Mobile React Native) **bắt buộc** truyền JWT Bearer Token trong `auth`:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: getStoredToken(), // Token lấy từ localStorage hoặc SecureStore (TUYỆT ĐỐI KHÔNG in ra console)
  },
  transports: ['websocket', 'polling'],
  autoConnect: true,
});

socket.on('connect', () => {
  console.log('✅ Đã kết nối Socket.IO thành công, socket ID:', socket.id);
});
```

#### Quy tắc kiểm tra tính hợp lệ của Token trong Backend:
1. **Xác thực tại thời điểm Handshake:** Backend xác minh chữ ký HS256 và thời hạn hiệu lực (`exp`) của JWT thông qua middleware kết nối `ioInstance.use()`. Nếu token bị thiếu, sai chữ ký hoặc hết hạn (`TokenExpiredError`), middleware sẽ chặn kết nối ngay lập tức và trả về lỗi `AUTHENTICATION_ERROR`.
2. **Trong suốt phiên kết nối đang mở (Connected Phase):** Backend **không chạy tiến trình định kỳ kiểm tra hạn token** để ngắt socket đang duy trì. Do đó, việc token hết hạn trong lúc socket đang mở không làm kết nối hiện tại lập tức bị ngắt. Tuy nhiên, khi kết nối bị đứt (do mạng, reload trang, hoặc server restart) và client thực hiện kết nối lại (Reconnect), quá trình Handshake mới sẽ diễn ra và token hết hạn sẽ bị từ chối ngay.

#### Phân biệt 3 kịch bản ngắt kết nối & hướng dẫn Client xử lý:
1. **Mất kết nối mạng tạm thời (`ping timeout`, `transport close`):**
   - Socket.IO client sẽ tự động thử kết nối lại (`auto-reconnect`) theo chu kỳ lùi số mũ (exponential backoff). Client không cần can thiệp nếu token vẫn còn hiệu lực.
2. **Server chủ động ngắt kết nối (`io server disconnect`):**
   - Xảy ra khi máy chủ chủ động ngắt socket của client (ví dụ: kích hoạt cơ chế an toàn fail-closed khi điều chuyển phòng).
   - Khi sự kiện `disconnect` phát ra với lý do `io server disconnect`, **Socket.IO client mặc định sẽ KHÔNG tự động reconnect**.
   - Client phải lắng nghe sự kiện `disconnect` và gọi `socket.connect()` thủ công khi các điều kiện an toàn đã sẵn sàng:
     ```javascript
     socket.on('disconnect', (reason) => {
       console.log('ℹ️ Socket bị ngắt kết nối, lý do:', reason);
       if (reason === 'io server disconnect') {
         // Server chủ động ngắt kết nối; client cần gọi connect() thủ công
         setTimeout(() => {
           socket.connect();
         }, 1000);
       }
     });
     ```
3. **Handshake bị từ chối do Token hết hạn hoặc không hợp lệ (`connect_error`):**
   - Khi token hết hạn (sau 1 ngày) hoặc chữ ký không hợp lệ, middleware Backend từ chối handshake với thông báo: `AUTHENTICATION_ERROR: Phiên đăng nhập đã hết hạn (Token Expired).`
   - **Đặc thù xác thực của hệ thống:** Backend hiện tại chỉ cung cấp duy nhất cơ chế đăng nhập nhận token qua `POST /api/auth/login` và **hoàn toàn không có cơ chế Refresh Token ngầm** (silent token rotation). Do đó, client không thể tự động gia hạn token trong nền nếu không có thông tin xác thực từ người dùng.
   - **Cảnh báo an ninh:** Tuyệt đối **không lưu trữ mật khẩu người dùng** (trong `localStorage`, `sessionStorage`, hay biến bộ nhớ) chỉ để cố tự động đăng nhập lại ngầm. Đây là vi phạm nghiêm trọng về an toàn bảo mật (nguy cơ lộ mật khẩu dạng rõ).
   - **Quy trình xử lý chuẩn phía Client:**
     1. Lắng nghe sự kiện `connect_error`. Nếu thông báo lỗi chứa tiền tố `AUTHENTICATION_ERROR`:
     2. **Ngừng ngay lập tức việc thử kết nối lại** bằng cách gọi `socket.disconnect()` để chặn đứng vòng lặp reconnect vô hạn (tránh làm tràn băng thông mạng hoặc bị máy chủ chặn IP theo cơ chế Anti-Brute Force).
     3. Xóa token cũ đã hết hạn khỏi bộ nhớ lưu trữ client.
     4. Hiển thị thông báo phiên làm việc đã hết hạn và điều hướng người dùng về màn hình Đăng nhập để người dùng nhập lại thông tin xác thực qua `POST /api/auth/login`.
     5. Sau khi người dùng đã đăng nhập lại thành công và nhận được JWT token mới:
        - Cập nhật token mới vào socket: `socket.auth = { token: newToken };`
        - Gọi `socket.connect()` để tái thiết lập kết nối realtime.
     6. **Bảo mật:** Tuyệt đối không ghi hoặc in token, mật khẩu hay thông tin xác thực vào `console.log`.

#### Ví dụ A: Dành cho nền tảng React Web (Web Portal)
Áp dụng cho ứng dụng Web của Ban Quản Lý và Quản trị viên (`web/`):
```javascript
// Quản lý trạng thái xử lý lỗi xác thực phía Web (chống vòng lặp vô hạn):
let isHandlingWebAuthError = false;

socket.on('connect_error', (err) => {
  // Chỉ ghi nhận thông báo lỗi chung, TUYỆT ĐỐI KHÔNG ghi token hoặc mật khẩu ra console
  console.error('❌ Lỗi kết nối Socket.IO (Web):', err.message);

  if (err.message && err.message.includes('AUTHENTICATION_ERROR')) {
    // Ngăn chặn xử lý trùng lặp và chặn vòng lặp reconnect vô tận
    if (isHandlingWebAuthError) return;
    isHandlingWebAuthError = true;

    // 1. Chủ động ngắt kết nối để socket không tự gửi lại token cũ đã hết hạn
    socket.disconnect();

    // 2. Dọn dẹp token đã hết hạn khỏi bộ lưu trữ Web
    localStorage.removeItem('token');

    // 3. Điều hướng người dùng về trang Đăng nhập
    window.location.href = '/login';
  }
});

// Hàm được gọi sau khi người dùng hoàn tất đăng nhập lại thành công qua POST /api/auth/login:
export function reconnectSocketAfterWebLogin(newToken) {
  isHandlingWebAuthError = false;
  // Cập nhật token mới cho handshake
  socket.auth = { token: newToken };
  // Khởi động lại kết nối Socket.IO
  socket.connect();
}
```

#### Ví dụ B: Hướng dẫn tích hợp kiến trúc dành cho React Native (Mobile App)
> [!NOTE]
> **Lưu ý dành cho đội Mobile (Nguyệt & Thuần):** Phân hệ Mobile hiện tại mới ở giai đoạn scaffold điều hướng (`AppNavigator.tsx`) và màn hình xác thực (`AuthScreen.tsx`), chưa cấu hình thư viện lưu trữ chuyên dụng. Đoạn mã dưới đây là **hướng dẫn tích hợp kiến trúc (Integration Pattern)** cần được đội Mobile ánh xạ sang hệ thống State Management / Navigation / Storage thực tế của dự án, không phải mã nguồn chạy nguyên trạng.

```javascript
// Pattern xử lý lỗi xác thực phía React Native (Mobile):
let isHandlingMobileAuthError = false;

// Các hàm xử lý storage và navigation do đội Mobile cấu hình theo kiến trúc app:
// import { clearStoredToken } from '../services/authStorage';
// import { navigateToAuthScreen } from '../navigation/navigationRef';

socket.on('connect_error', async (err) => {
  // Chỉ ghi nhận mã lỗi chung, TUYỆT ĐỐI KHÔNG ghi token hoặc mật khẩu ra console
  console.error('❌ Lỗi kết nối Socket.IO (Mobile):', err.message);

  if (err.message && err.message.includes('AUTHENTICATION_ERROR')) {
    // Chặn vòng lặp reconnect vô hạn khi token hết hạn
    if (isHandlingMobileAuthError) return;
    isHandlingMobileAuthError = true;

    // 1. Chủ động ngắt kết nối để socket không tiếp tục gửi handshake với token hỏng
    socket.disconnect();

    // 2. Xóa access token khỏi cơ chế lưu trữ an toàn mà ứng dụng đang sử dụng
    // Ví dụ: await clearStoredToken();

    // 3. Sử dụng hệ thống navigation của ứng dụng chuyển người dùng về màn hình đăng nhập
    // Ví dụ: navigateToAuthScreen(); // Chuyển về AuthScreen
  }
});

// Hàm được gọi sau khi Cư dân đăng nhập lại thành công qua POST /api/auth/login trên Mobile:
export function reconnectSocketAfterMobileLogin(newToken) {
  isHandlingMobileAuthError = false;
  // Cập nhật token mới cho handshake Socket.IO
  socket.auth = { token: newToken };
  // Khởi động lại phiên kết nối
  socket.connect();
}
```

---

### B. Cơ chế Phân bổ Room Logic & Điều chuyển Căn hộ (Server-managed Rooms)
Client **không thể tự ý tham gia (join) room tùy ý**. Backend tự động phân bổ socket vào các room an toàn ngay khi xác thực thành công:

| Room Name | Thành viên tham gia | Mục đích |
| :--- | :--- | :--- |
| `building:all` | **Tất cả người dùng** (Admin, BQL, Thợ, Cư dân) | Nhận thông báo chung toàn chung cư |
| `staff:all` | `ADMIN` và `BQL` | Nhận mọi thông báo (kể cả thông báo gửi riêng cho từng căn hộ) để theo dõi |
| `technician:all` | `TECHNICIAN` | Nhận thông báo chuyên môn kỹ thuật |
| `room:<roomNumber>` | `RESIDENT` thuộc căn hộ đó (ví dụ: `room:P.305`) | Nhận thông báo gửi đích danh cho căn hộ của mình |
| `user:<userId>` | Cá nhân người dùng đó | Nhận các sự kiện cá nhân hóa (phiếu sự cố, hóa đơn) |

#### Cơ chế xử lý khi Cư dân được điều chuyển căn hộ mới (`updateUserSocketRoom`):
Khi Ban Quản Lý thực hiện đổi phòng cho cư dân (`PUT /api/apartments/residents/:id/room`), Backend kích hoạt quy trình đồng bộ Socket:
- **Trường hợp đồng bộ thành công:** Backend tự động thực hiện `socketsLeave('room:phòng_cũ')` và `socketsJoin('room:phòng_mới')` cho toàn bộ socket đang mở của cư dân đó. Cư dân sẽ lập tức nhận thông báo của phòng mới mà **không cần client phải gửi bất kỳ lệnh join room nào** hay reload ứng dụng.
- **Trường hợp đồng bộ gặp sự cố (Fail-Closed Security Fallback):** Nếu việc cập nhật room trên socket gặp lỗi ngoại lệ, để ngăn chặn nguy cơ rò rỉ thông báo của phòng cũ (Data Leakage), Backend sẽ kích hoạt cơ chế ngắt an toàn: **chủ động ngắt toàn bộ kết nối socket của cư dân** (`disconnectSockets(true)`). Lúc này, client sẽ nhận sự kiện `disconnect` với lý do `io server disconnect`. Client cần thực hiện kết nối lại (`socket.connect()`), và phiên kết nối mới sẽ truy vấn CSDL PostgreSQL để nạp đúng căn hộ mới nhất.

---

### C. Sự kiện Lắng nghe: `notification:new`
Khi Admin hoặc BQL tạo thông báo thành công qua REST API, sự kiện `notification:new` sẽ được phát tức thời tới đúng các client hợp lệ:

```javascript
socket.on('notification:new', (notification) => {
  console.log('🔔 Nhận thông báo mới:', notification.title);
  // Hiển thị Toast thông báo hoặc popup trên Web/Mobile
});
```

#### Payload sự kiện:
```json
{
  "id": 16,
  "title": "Nhắc nhở kiểm tra đồng hồ nước",
  "content": "Kính mời quý cư dân căn hộ P.305 tạo điều kiện cho nhân viên kỹ thuật kiểm tra công tơ nước.",
  "targetRoom": "P.305",
  "authorId": 2,
  "author": {
    "id": 2,
    "fullName": "Ban Quản Lý Tòa Nhà",
    "role": "BQL",
    "username": "bql_truong"
  },
  "createdAt": "2026-10-22T08:35:00.000Z"
}
```
