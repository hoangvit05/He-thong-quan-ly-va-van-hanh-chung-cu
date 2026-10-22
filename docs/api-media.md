# TÀI LIỆU KỸ THUẬT & API CONTRACT: CLOUDINARY MEDIA UPLOAD
**Phân hệ:** Tải lên & Quản lý Tệp Đa phương tiện (Media Upload)
**Phụ trách:** Việt Hoàng — Backend Lead
**Công nghệ:** Node.js, Express, TypeScript, Cloudinary v2 SDK, HMAC-SHA256 Intent Tokens
**Trạng thái:** Hoàn thiện Backend, Signed Direct Upload, Fail-Closed Security, Sẵn sàng tích hợp Web/Mobile

---

## 1. TỔNG QUAN KIẾN TRÚC TẢI LÊN TRỰC TIẾP (DIRECT SIGNED UPLOAD)

Hệ thống triển khai cơ chế **Signed Direct Upload** nhằm:
1. Giảm tải tuyệt đối lưu lượng băng thông và bộ nhớ cho máy chủ Backend (tránh việc gửi Base64 hoặc stream nhị phân dung lượng lớn qua Express).
2. Tận dụng CDN toàn cầu và khả năng nén ảnh/video tự động của Cloudinary.
3. Bảo đảm an ninh tối đa: Máy chủ Backend kiểm soát 100% cấu hình bảo mật (Folder, Public ID, Whitelist mục đích, Giới hạn kích thước, Overwrite policy, Chữ ký và Thời hạn hiệu lực).
4. **Không tin tưởng Client:** Sau khi tải lên, Client phải gửi yêu cầu xác nhận kèm **Upload Intent Token** có chữ ký HMAC-SHA256 để Backend kiểm duyệt chéo dung lượng, định dạng và quyền sở hữu trước khi chấp nhận lưu vào cơ sở dữ liệu.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web / Mobile App
    participant Backend as Backend API Server
    participant Cloudinary as Cloudinary CDN
    participant DB as PostgreSQL Database

    Note over Client,Backend: BƯỚC 1: YÊU CẦU CẤP CHỮ KÝ TẢI LÊN
    Client->>Backend: POST /api/media/signature (Bearer Token, purpose, ticketId)
    Backend->>Backend: Kiểm tra RBAC, Ticket Ownership, sinh Public ID ngẫu nhiên
    Backend->>Backend: Ký parameters bằng Cloudinary SDK & sinh Intent Token
    Backend-->>Client: 200 OK (uploadUrl, signature, publicId, intentToken, limits)

    Note over Client,Cloudinary: BƯỚC 2: TẢI LÊN TRỰC TIẾP
    Client->>Cloudinary: POST uploadUrl (File binary, signature, timestamp, public_id...)
    Cloudinary-->>Client: 200 OK (public_id, secure_url, bytes, format)

    Note over Client,Backend: BƯỚC 3: XÁC NHẬN VÀ KIỂM DUYỆT TÀI SẢN
    Client->>Backend: POST /api/media/confirm (publicId, intentToken, resourceType)
    Backend->>Backend: Xác minh tính toàn vẹn chữ ký HMAC của Intent Token
    Backend->>Cloudinary: Truy vấn Admin API kiểm tra bytes và format thực tế
    alt Dung lượng hoặc định dạng vi phạm
        Backend->>Cloudinary: Thu hồi & Xóa tệp ngay lập tức (destroy)
        Backend-->>Client: 400 Bad Request (Tệp vi phạm chính sách)
    else Tệp hợp lệ
        Backend-->>Client: 200 OK (Confirmed Asset Metadata, secureUrl)
    end

    Note over Client,DB: BƯỚC 4: GẮN URL VÀO NGHIỆP VỤ
    Client->>Backend: POST /api/tickets hoặc PUT /api/tickets/:id/status (kèm secureUrl)
    Backend->>DB: Lưu URL ảnh vào CSDL (mediaUrl / completedMediaUrl)
```

---

## 2. QUY ĐỊNH MỤC ĐÍCH TẢI LÊN & MA TRẬN PHÂN QUYỀN (RBAC)

Máy chủ áp dụng Whitelist nghiêm ngặt cho trường `purpose`. Tuyệt đối không cho phép client tự gửi đường dẫn thư mục (`folder`).

| Mục đích (`purpose`) | Vai trò được phép (`Role`) | Yêu cầu `ticketId` | Thư mục lưu trữ trên Cloudinary (`folder`) |
| :--- | :--- | :---: | :--- |
| `tickets` | `RESIDENT`, `BQL`, `ADMIN` | Không bắt buộc (Nếu có: Cư dân phải là chủ phiếu hoặc cùng căn hộ) | `apartment/tickets/${ticketId ? 'ticket_' + ticketId : 'general'}` |
| `materials` | `TECHNICIAN`, `BQL`, `ADMIN` | **BẮT BUỘC** (Thợ phải được phân công xử lý phiếu và phiếu đang `IN_PROGRESS` / `COMPLETED`) | `apartment/materials/ticket_${ticketId}` |
| `announcements` | `BQL`, `ADMIN` | Không | `apartment/announcements` |

---

## 3. GIỚI HẠN TỆP & CHÍNH SÁCH BẢO MẬT (FILE LIMITS & POLICY)

| Loại tài nguyên (`resourceType`) | Định dạng cho phép (`allowedFormats`) | Dung lượng tối đa (`maxFileSize`) | Hành vi khi vi phạm |
| :--- | :--- | :---: | :--- |
| **Ảnh (`image`)** | `jpg`, `jpeg`, `png`, `webp` | **5 MB** (5,242,880 bytes) | Bị từ chối xác nhận (400), Backend tự động kích hoạt `destroy` để xóa tệp khỏi Cloudinary CDN |
| **Video (`video`)** | `mp4`, `mov` | **20 MB** (20,971,520 bytes) | Bị từ chối xác nhận (400), Backend tự động xóa tệp |

- **Chính sách Overwrite:** Toàn bộ chữ ký được sinh ra với `overwrite: false`. Không ai có thể tải đè hoặc phá hủy ảnh cũ bằng cách gửi trùng tên file.
- **Tính ngẫu nhiên của Public ID:** Máy chủ sinh định danh duy nhất chứa dấu thời gian và chuỗi ngẫu nhiên mã hóa entropy cao (`crypto.randomBytes(6)`), ngăn chặn việc đoán trước đường dẫn ảnh sự cố của căn hộ khác.

---

## 4. CHI TIẾT API CONTRACTS

### 4.1. Cấp chữ ký tải lên trực tiếp (`POST /api/media/signature`)
- **URL:** `/api/media/signature`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`, `Content-Type: application/json`

#### Request Body:
```json
{
  "purpose": "tickets",
  "resourceType": "image",
  "ticketId": 12
}
```

#### Response Success (HTTP 200 OK):
```json
{
  "success": true,
  "data": {
    "cloudName": "apartment_cloud",
    "apiKey": "123456789012345",
    "timestamp": 1729600000,
    "signature": "a1b2c3d4e5f67890abcdef1234567890abcdef12",
    "folder": "apartment/tickets/ticket_12",
    "publicId": "tickets_u42_1729600000_3a8b9c1d2e",
    "resourceType": "image",
    "uploadUrl": "https://api.cloudinary.com/v1_1/apartment_cloud/image/upload",
    "allowedFormats": ["jpg", "jpeg", "png", "webp"],
    "maxFileSize": 5242880,
    "tags": "apartment,tickets,u_42,t_12",
    "context": "uploaded_by=42|purpose=tickets|ticket_id=12",
    "intentToken": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjQyfQ.signature_hash_here"
  },
  "message": "Cấp chữ ký tải lên Cloudinary thành công."
}
```
> [!NOTE]
> `apiSecret` tuyệt đối không được trả về trong response.

---

### 4.2. Hướng dẫn Client thực hiện Direct Upload lên Cloudinary
Sau khi nhận được thông tin từ endpoint `/api/media/signature`, Client gửi `multipart/form-data` trực tiếp lên `uploadUrl`:

```javascript
// Ví dụ JavaScript / React Web / React Native:
const formData = new FormData();
formData.append('file', fileObject); // File từ input file hoặc ImagePicker
formData.append('api_key', data.apiKey);
formData.append('timestamp', data.timestamp);
formData.append('signature', data.signature);
formData.append('folder', data.folder);
formData.append('public_id', data.publicId);
formData.append('tags', data.tags);
formData.append('context', data.context);

const uploadResponse = await fetch(data.uploadUrl, {
  method: 'POST',
  body: formData,
});
const uploadResult = await uploadResponse.json();
// uploadResult chứa: public_id, secure_url, bytes, format
```

---

### 4.3. Xác nhận và kiểm duyệt tài sản (`POST /api/media/confirm`)
- **URL:** `/api/media/confirm`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`, `Content-Type: application/json`

#### Request Body:
```json
{
  "publicId": "apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e",
  "intentToken": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjQyfQ.signature_hash_here",
  "resourceType": "image"
}
```

#### Response Success (HTTP 200 OK):
```json
{
  "success": true,
  "data": {
    "publicId": "apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e",
    "secureUrl": "https://res.cloudinary.com/apartment_cloud/image/upload/v1729600010/apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e.png",
    "resourceType": "image",
    "format": "png",
    "bytes": 1048576,
    "purpose": "tickets",
    "ticketId": 12,
    "width": 1920,
    "height": 1080,
    "confirmedAt": "2026-10-22T23:05:00.000Z"
  },
  "message": "Xác nhận tệp tải lên thành công."
}
```

---

### 4.4. Lấy đường dẫn truy cập có chữ ký có thời hạn (`GET /api/media/access/:publicId(*)`)
- **Route Backend:** `/api/media/access/:publicId(*)`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`
- **Query Params:** `resourceType=image|video` (mặc định là `image` nếu không truyền)
- **Mục đích:** Cấp URL tạm thời có chữ ký bảo mật từ Cloudinary (`cloudinary.utils.private_download_url`) cho các tài sản riêng tư (private/authenticated assets) với thời hạn hiệu lực (TTL) cố định là **1 giờ** (3600 giây).

#### Cách truyền `publicId` chứa dấu gạch chéo (`/`):
Do `publicId` trên Cloudinary được tổ chức theo cấu trúc thư mục (ví dụ: `apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e`), Backend sử dụng cú pháp route wildcard của Express `/:publicId(*)` để tiếp nhận toàn bộ chuỗi đường dẫn phân cấp:

- **Cách 1 (Khuyến nghị chuẩn REST / Wildcard):** Truyền trực tiếp chuỗi `publicId` vào path segments:
  ```http
  GET /api/media/access/apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e?resourceType=image
  ```
  Express sẽ tự động gán toàn bộ chuỗi `apartment/tickets/ticket_12/...` vào `req.params.publicId`. Đây là cách tương thích tự nhiên nhất với route wildcard hiện tại.

- **Cách 2 (Mã hóa URL qua HTTP Client):**
  Nếu client sử dụng `encodeURIComponent(publicId)`:
  ```http
  GET /api/media/access/apartment%2Ftickets%2Fticket_12%2Ftickets_u42_1729600000_3a8b9c1d2e?resourceType=image
  ```
  *Lưu ý kiến trúc mạng:* Trong môi trường Node.js/Express, ký tự `%2F` trong path có thể được giải mã trước khi khớp route. Tuy nhiên, nếu hệ thống được triển khai đằng sau Reverse Proxy (như Nginx, AWS CloudFront, Cloudflare), một số proxy có cấu hình mặc định từ chối hoặc chuẩn hóa ký tự `%2F` trong URL path. Do đó, nếu môi trường proxy gặp lỗi định tuyến khi mã hóa `%2F`, client nên chuyển sang **Cách 1** (truyền path trực tiếp không encode dấu `/`).

#### Ma trận phân quyền truy cập (Record-Level Access Control):
Backend kiểm tra quyền xem tài sản ngay tại controller trước khi cấp URL:
1. `ADMIN` và `BQL`: Toàn quyền lấy link truy cập tất cả tài sản trong tòa nhà.
2. Tài sản thông báo chung (`announcements`): Cho phép mọi người dùng đã đăng nhập (`RESIDENT`, `TECHNICIAN`) truy cập.
3. Tài sản sự cố (`tickets`) và vật tư (`materials`):
   - `RESIDENT`: Chỉ được truy cập nếu là chủ tạo phiếu hoặc cùng thuộc căn hộ (`roomId`) của phiếu đó.
   - `TECHNICIAN`: Chỉ được truy cập nếu phiếu sự cố được phân công trực tiếp cho mình (`ticket.technicianId === currentUser.id`).
   - Nếu `publicId` chưa gắn với `ticketId` cụ thể: Kiểm tra `uploaderId` trích xuất từ tên file (`u<userId>`) có trùng với `currentUser.id` hay không.

#### Response Thành công (HTTP 200 OK):
```json
{
  "success": true,
  "data": {
    "publicId": "apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e",
    "accessUrl": "https://res.cloudinary.com/apartment_cloud/image/authenticated/s--signature_hash--/v1729600000/apartment/tickets/ticket_12/tickets_u42_1729600000_3a8b9c1d2e.jpg"
  },
  "message": "Tạo đường dẫn truy cập có chữ ký thành công."
}
```

#### Các mã lỗi thường gặp:
- `400 Bad Request`: Thiếu định danh `publicId`.
- `401 Unauthorized`: Thiếu Bearer Token hoặc token không hợp lệ.
- `403 Forbidden`: Người dùng không có quyền truy cập tài sản của căn hộ/thợ khác.
- `404 Not Found`: Không tìm thấy phiếu sự cố liên quan trong CSDL.
- `500 Internal Error`: Lỗi máy chủ hoặc lỗi cấu hình Cloudinary.

---

## 5. BẢO VỆ QUYỀN RIÊNG TƯ & TÍCH HỢP VỚI MODULE TICKETS

1. **Khi Cư dân tạo phiếu sự cố (`POST /api/tickets`):**
   - Cư dân thực hiện quy trình Signed Upload mục đích `tickets`.
   - Sau khi xác nhận thành công nhận `secureUrl`, gửi `mediaUrl: secureUrl` khi gọi `POST /api/tickets`.
   - Validator kiểm tra URL Cloudinary hợp lệ, chặn Base64 và chặn URL bên ngoài không an toàn.
2. **Khi Thợ kỹ thuật hoàn thành sửa chữa (`PUT /api/tickets/:id/status`):**
   - Thợ gửi yêu cầu cấp chữ ký với `purpose: 'materials'`, `ticketId: :id`.
   - Backend xác minh thợ kỹ thuật đúng là người được giao việc và phiếu ở trạng thái `IN_PROGRESS`.
   - Sau khi upload và confirm thành công, thợ gọi API cập nhật tiến độ với `status: 'COMPLETED'` và `completedMediaUrl: secureUrl`.

---

## 6. DANH MỤC MÃ LỖI HTTP CHUẨN

| HTTP Status | Mã lỗi nội bộ / Thông báo | Nguyên nhân |
|:---:|---|---|
| **400** | `Mục đích tải lên không được chấp nhận` | `purpose` không nằm trong whitelist |
| **400** | `Không được tự ý chỉ định thư mục` | Client tự ý truyền trường `folder` |
| **400** | `FILE_TOO_LARGE` | Dung lượng tệp thực tế trên Cloudinary vượt quá 5MB (ảnh) hoặc 20MB (video) |
| **400** | `INVALID_FORMAT` | Định dạng tệp thực tế không nằm trong danh sách whitelist |
| **400** | `EXPIRED_INTENT_TOKEN` | Intent Token đã phát hành quá 15 phút chưa xác nhận |
| **401** | `Mã xác thực không hợp lệ` | Thiếu hoặc sai Bearer Token |
| **403** | `FORBIDDEN_PURPOSE` | Vai trò người dùng không có quyền với purpose này |
| **403** | `FORBIDDEN_TECH_TICKET` | Thợ kỹ thuật cố tải ảnh cho phiếu không được giao |
| **403** | `FORBIDDEN_TICKET_ACCESS` | Cư dân cố tải ảnh cho phiếu của căn hộ khác |
| **403** | `FORBIDDEN_OWNERSHIP` | Người dùng B dùng Intent Token của Người dùng A để xác nhận |
| **404** | `NOT_FOUND_TICKET` | `ticketId` không tồn tại trong CSDL |
| **404** | `ASSET_NOT_FOUND` | Tệp chưa được upload lên Cloudinary hoặc publicId sai |
| **503** | `Dịch vụ lưu trữ tệp Cloudinary chưa được cấu hình` | Thiếu biến môi trường `CLOUDINARY_*` trên máy chủ |

---

## 7. CẤU HÌNH BIẾN MÔI TRƯỜNG CẦN THIẾT (.ENV)

```ini
# Cloudinary Media Upload Credentials
CLOUDINARY_CLOUD_NAME="your_cloud_name_here"
CLOUDINARY_API_KEY="your_api_key_here"
CLOUDINARY_API_SECRET="your_api_secret_here"
```
