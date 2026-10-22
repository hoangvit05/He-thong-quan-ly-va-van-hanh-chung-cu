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

### A. Kết nối và Xác thực (Handshake Authentication)
Backend lắng nghe kết nối WebSocket tại cổng HTTP Server chính (cùng cổng với Express, mặc định `5000`).

Client (Web React hoặc Mobile React Native) **bắt buộc** truyền JWT Bearer Token trong `auth`:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: localStorage.getItem('token'), // Hoặc SecureStore trên Mobile
  },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('✅ Đã kết nối Socket.IO thành công, socket ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('❌ Lỗi kết nối Socket.IO:', err.message);
  // Ví dụ: "AUTHENTICATION_ERROR: Phiên đăng nhập đã hết hạn (Token Expired)."
});
```

### B. Cơ chế Phân bổ Room Logic (Server-managed Rooms)
Client **không thể tự ý tham gia (join) room tùy ý**. Backend tự động phân bổ socket vào các room an toàn ngay khi xác thực thành công:

| Room Name | Thành viên tham gia | Mục đích |
| :--- | :--- | :--- |
| `building:all` | **Tất cả người dùng** (Admin, BQL, Thợ, Cư dân) | Nhận thông báo chung toàn chung cư |
| `staff:all` | `ADMIN` và `BQL` | Nhận mọi thông báo (kể cả thông báo gửi riêng cho từng căn hộ) để theo dõi |
| `technician:all` | `TECHNICIAN` | Nhận thông báo chuyên môn kỹ thuật |
| `room:<roomNumber>` | `RESIDENT` thuộc căn hộ đó (ví dụ: `room:P.305`) | Nhận thông báo gửi đích danh cho căn hộ của mình |
| `user:<userId>` | Cá nhân người dùng đó | Nhận các sự kiện cá nhân hóa (phiếu sự cố, hóa đơn) |

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
