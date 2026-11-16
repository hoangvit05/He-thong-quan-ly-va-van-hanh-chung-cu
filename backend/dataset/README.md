# DATASET HỆ THỐNG QUẢN LÝ VÀ VẬN HÀNH CHUNG CƯ
## Phân hệ Dữ liệu Giả lập Độc lập (Independent Dataset Foundation)

**Vị trí:** `backend/dataset/`  
**Công nghệ:** TypeScript, Prisma Client 5, Node.js (>= 20), PostgreSQL 16, Bcryptjs  
**Trạng thái:** Milestone 10 — Dataset Validation & Quality Assurance Runner  

---

## 1. MỤC ĐÍCH
Bộ dataset này được xây dựng nhằm cung cấp dữ liệu giả lập phong phú, thực tế, nhất quán và tuân thủ 100% ràng buộc của Prisma schema cũng như logic nghiệp vụ backend của dự án Quản lý Chung cư.

Dataset phục vụ:
1. Môi trường phát triển cục bộ (Local Development).
2. Kiểm thử liên tích hợp (Integration & E2E Testing).
3. Môi trường thử nghiệm / Demo (Staging / Demo Sandbox).

---

## 2. CẤU TRÚC THƯ MỤC
```text
backend/dataset/
├── README.md                      # Tài liệu tổng quan và hướng dẫn vận hành
├── SPEC.md                        # Đặc tả kỹ thuật chi tiết của dataset
├── DATA_DICTIONARY.md             # Từ điển dữ liệu toàn diện (8 models)
├── config/
│   └── dataset.config.ts          # Cấu hình quy mô, phân bổ và random seed
├── seed/
│   ├── index.ts                   # Entry point chính của seed engine
│   ├── generators/                # Các bộ sinh dữ liệu theo từng entity
│   │   ├── room.generator.ts
│   │   ├── user.generator.ts
│   │   ├── ticket.generator.ts
│   │   ├── invoice.generator.ts
│   │   ├── payment.generator.ts
│   │   ├── feedback.generator.ts
│   │   ├── notification.generator.ts
│   │   └── media-asset.generator.ts
│   └── utils/                     # Tiện ích bổ trợ (PRNG, Decimal, Password)
│       ├── random.ts
│       ├── password.ts
│       └── decimal.ts
├── reference-data/                # Dữ liệu tham chiếu tiếng Việt (JSON)
│   ├── ticket-categories.json
│   └── vietnamese-content.json
├── fixtures/                      # Dữ liệu kiểm thử cố định (Deterministic fixtures)
│   └── README.md
├── validation/                    # Bộ kiểm tra tính toàn vẹn dataset (M10 Runner)
│   ├── validate.ts                # Runner chạy toàn bộ kiểm tra nghiệm thu (In-Memory & Database)
│   ├── debug.test.ts              # Kiểm tra nhanh sanity checks
│   ├── reference-data.test.ts     # Kiểm thử dữ liệu tham chiếu (M3)
│   ├── room-user-generator.test.ts # Kiểm thử Room & User generator (M4)
│   ├── invoice-payment-generator.test.ts # Kiểm thử Invoice & Payment generator (M5)
│   ├── ticket-generator.test.ts   # Kiểm thử Ticket generator (M6)
│   ├── feedback-notification-generator.test.ts # Kiểm thử Feedback & Notification (M7)
│   ├── media-asset-generator.test.ts # Kiểm thử chính sách Zero-Asset & RBAC (M8/M8.1)
│   ├── seed-orchestration.test.ts # Kiểm thử điều phối seed, ID mapping & an toàn DB (M9)
│   ├── validation-suite.test.ts   # Kiểm thử toàn diện 8 nhóm tiêu chuẩn kiểm toán (M10)
│   └── checks/                    # Các check logic chuyên biệt (8 nhóm kiểm toán)
│       ├── types.ts               # Định nghĩa giao diện Snapshot & CheckResult
│       ├── counts.check.ts        # 5.1 Quy mô số lượng 8 models
│       ├── relational.check.ts    # 5.2 Khóa ngoại và toàn vẹn quan hệ
│       ├── financial.check.ts     # 5.3 Tính nhất quán Decimal, dòng tiền và hóa đơn
│       ├── ticket.check.ts        # 5.4 Vòng đời sự cố, phân công thợ và cờ trùng 24h
│       ├── feedback.check.ts      # 5.5 Góp ý cư dân, phân quyền RBAC và phạm vi phòng
│       ├── notification.check.ts  # 5.6 Thông báo tòa nhà, tác giả và số phòng
│       ├── media.check.ts         # 5.7 Chính sách Zero-Asset và an toàn URL media
│       └── privacy.check.ts       # 5.8 Quét PII (SĐT, CCCD, Base64, domain email, Bcrypt hash)
└── reports/                       # Thư mục chứa báo cáo nghiệm thu phát sinh
    └── .gitkeep
```

---

## 3. CÔNG NGHỆ & ĐẶC TÍNH KỸ THUẬT
- **TypeScript thuần**: Toàn bộ generator, cấu hình và validator được viết bằng TypeScript với strict typechecking.
- **Deterministic (Đơn định)**: Sử dụng bộ sinh số ngẫu nhiên giả lập (PRNG) với seed cố định (`RANDOM_SEED: 20261111`), đảm bảo kết quả sinh dữ liệu giữa các lần chạy luôn giống hệt nhau.
- **Prisma Client**: Tương thích hoàn toàn với `@prisma/client` hiện có của backend, sử dụng `Prisma.Decimal` cho toàn bộ các trường tài chính tiền tệ.
- **Bcryptjs Hash**: Mật khẩu của mọi tài khoản được băm chuẩn định dạng Bcrypt ($2a$/$2b$, salt rounds = 10) tương thích với `auth.controller.ts`.

---

## 4. QUY TẮC AN TOÀN DATABASE (DATABASE SAFETY RULES)
Để đảm bảo an toàn tuyệt đối cho cơ sở dữ liệu:
1. **Nghiêm cấm chạy trên môi trường Production**:
   - Seed script bắt buộc kiểm tra biến môi trường: Từ chối thực thi nếu `NODE_ENV === 'production'`.
   - Phải có cờ xác nhận rõ ràng `ALLOW_DATASET_SEED=true` trước khi ghi dữ liệu.
2. **Không dùng câu lệnh phá hủy (No Destructive Commands)**:
   - Tuyệt đối **KHÔNG dùng `TRUNCATE`**.
   - Tuyệt đối **KHÔNG dùng `prisma.model.deleteMany()` bừa bãi** làm thao tác dọn dẹp thường quy.
3. **Chính sách Ghi mới Thuần túy & Không Hỗ trợ Rerun (Non-Idempotent / Create-Only Policy)**:
   - Seed chỉ sử dụng lệnh `create` thuần túy để nạp bản ghi mới.
   - Tuyệt đối **không dùng `upsert`, `update`, hoặc `findFirst`** để nhận diện hoặc ghi đè dữ liệu.
   - Cơ sở dữ liệu bắt buộc phải **rỗng hoàn toàn trên cả 8 models** trước khi seed.
   - Nếu phát hiện bất kỳ bảng nào có bất kỳ dữ liệu nào: Hệ thống lập tức từ chối seed (Fail-Closed) để bảo vệ toàn vẹn dữ liệu ứng dụng.
   - **Không hỗ trợ rerun an toàn** trên database đã seed: Do schema hiện tại chưa có trường định danh nguồn gốc dataset (`datasetBatchId`), việc chạy lại trên database đã có dữ liệu sẽ bị từ chối tuyệt đối.
   - Muốn chạy lại, bắt buộc phải sử dụng một database sandbox chuyên dụng mới, rỗng hoàn toàn và được chỉ định trong allowlist (`DATASET_DB_ALLOWLIST`).
   - Tuyệt đối **không tự ý xóa dữ liệu** (`deleteMany`, `delete`, `TRUNCATE`) để chuẩn bị cho việc rerun.
4. **Chính sách MediaAsset & Quy trình Tải lên Hợp lệ của Backend (Milestone 8 & 8.1)**:
   - **Zero-Asset Default**: Mặc định dataset có **0** bản ghi `MediaAsset` (`MAX_VERIFIED = 0`). Dataset seed engine tuyệt đối không tự tạo hoặc giả lập tài nguyên đa phương tiện.
   - **Chống tài nguyên giả mạo**: Tuyệt đối không tự sinh Cloudinary URL, publicId, signature hoặc metadata giả; không tự đặt `isConfirmed = true`; không có API nhận dữ liệu tự khai báo từ caller để hợp thức hóa thành MediaAsset.
   - **Quy trình Media Upload & Xác thực hợp lệ của Backend**:
     Tài sản MediaAsset thật chỉ được tạo ra thông qua luồng nghiệp vụ chính thống của backend application:
     1. **Cấp chữ ký & Intent Token (`POST /api/media/signature`)**:
        - **Phân quyền vai trò (RBAC)**:
          - `tickets`: `RESIDENT`, `BQL`, `ADMIN`. Nếu có `ticketId`: Cư dân chỉ được tải ảnh cho phiếu của chính mình hoặc cùng căn hộ; thợ kỹ thuật bị cấm (`FORBIDDEN_TECH_PURPOSE`).
          - `materials`: `TECHNICIAN`, `BQL`, `ADMIN`. Bắt buộc phải có `ticketId` (`MISSING_TICKET_ID`); cư dân bị cấm (`FORBIDDEN_RESIDENT_MATERIALS`).
          - `announcements`: `BQL`, `ADMIN` (thông báo tòa nhà).
        - **Ràng buộc phân công thợ & trạng thái Ticket đối với `materials`**:
          - Thợ kỹ thuật bắt buộc phải là người được chỉ định phụ trách phiếu sự cố đó (`ticket.technicianId === currentUser.id`).
          - Phiếu sự cố bắt buộc phải đang ở trạng thái `IN_PROGRESS` hoặc `COMPLETED`.
        - **Chính sách Delivery Type**:
          - `announcements`: `'upload'` (công khai CDN cho toàn cư dân).
          - `tickets` & `materials`: `'authenticated'` (riêng tư, chỉ truy cập qua Signed URL).
        - **Giới hạn tệp**:
          - Ảnh: Tối đa 5 MB (5,242,880 bytes), định dạng: `jpg`, `jpeg`, `png`, `webp`.
          - Video: Tối đa 20 MB (20,971,520 bytes), định dạng: `mp4`, `mov`.
        - Máy chủ sinh Upload Intent Token (HMAC-SHA256) có thời hạn 15 phút (900 giây) kèm chữ ký Cloudinary Direct Upload.
     2. **Tải lên trực tiếp**: Client tải tệp trực tiếp từ thiết bị lên Cloudinary qua URL đã ký.
     3. **Xác nhận & Kiểm duyệt qua Admin API (`POST /api/media/confirm`)**:
        - Client gửi `publicId`, `intentToken` và `resourceType` lên backend.
        - Backend xác thực chữ ký và hạn 15 phút của `intentToken`, kiểm tra khớp chủ sở hữu (`userId`) và `publicId`.
        - Backend truy vấn Cloudinary Admin API (`cloudinary.api.resource`) để lấy kích thước bytes và định dạng thực tế. Nếu vượt dung lượng hoặc sai định dạng, backend tự động xóa tệp trên Cloudinary (`cloudinary.uploader.destroy`) và từ chối.
        - Chỉ sau khi xác minh thành công qua Admin API, Backend mới lưu bản ghi vào bảng `MediaAsset` trên PostgreSQL với `isConfirmed = true` và `confirmedAt = now()`.
   - **Seed Engine Scope**: Dataset seed không gọi Cloudinary API, không gọi backend API, và không giả lập quy trình xác minh. Generator luôn duy trì chế độ Zero-Asset.

---

5. **Điều phối Seed & Bảo vệ An toàn Cơ sở Dữ liệu (Milestone 9.1.1 - Atomic Empty Check & Production Guard)**:
   - **Khai báo Database Target Allowlist bắt buộc**:
     - Cấu hình qua biến môi trường `DATASET_DB_ALLOWLIST` (chuỗi phân tách dấu phẩy `host:port/dbname` hoặc JSON array `[{"host":"...","port":5432,"database":"..."}]`).
     - Tuyệt đối không hardcode allowlist mặc định trong source code.
     - So sánh mục tiêu thực tế trích xuất từ `DATABASE_URL` (host, port, dbName) với allowlist. Mọi trường hợp thiếu allowlist hoặc mismatch target đều bị từ chối (Fail-Closed) trước khi kết nối DB.
     - Không bao giờ mặc định ngầm hiểu `localhost`, `postgres`, hay `apartment_db` là môi trường an toàn.
   - **Bật Opt-in & Production Guard Toàn diện (Substring Pattern)**:
     - Bắt buộc `NODE_ENV !== 'production'`.
     - Bắt buộc cờ xác nhận rõ ràng `ALLOW_DATASET_SEED=true`.
     - Quét từ khóa Production (`prod`, `production`, `live`, `main`, `master`, `release`) trong cả hostname và tên database dưới dạng chuỗi con (substring) không phụ thuộc dấu phân cách (ngăn chặn triệt để các trường hợp như `production-db`, `myproductiondb`, `myprodserver`, `apartment-main`, `release-db`).
     - Target có dấu hiệu Production tuyệt đối bị chặn kể cả khi caller cố ý đưa vào allowlist.
     - Che giấu thông tin nhạy cảm: Tuyệt đối không log username/password hay raw DATABASE_URL.
   - **Thẩm tra Rỗng Nguyên tử (Atomic Empty Database Check - Anti-TOCTOU)**:
     - Việc kiểm tra cơ sở dữ liệu rỗng và toàn bộ thao tác `create` được thực thi **bên trong cùng một Prisma Interactive Transaction** với mức cô lập cao nhất: `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`.
     - Kiểm tra toàn bộ 8 models: Room, User, Invoice, Payment, Ticket, Feedback, Notification, MediaAsset.
     - **Điều kiện từ chối seed**: Nếu bất kỳ model nào có count > 0, transaction lập tức throw lỗi và rollback sạch sẽ. Tuyệt đối không có lệnh `create` nào xảy ra trước khi kiểm tra rỗng hoàn tất.
     - **Xử lý Serialization Conflict**: Nếu xảy ra xung đột tuần tự do ghi đồng thời (`P2034` hoặc Serialization Failure), transaction bị hủy an toàn và rollback; hệ thống không tự động retry thiếu kiểm soát.
     - **Không ghi đè dữ liệu ứng dụng**: Tuyệt đối không dùng `upsert`, `update`, hoặc `findFirst` với các trường nghiệp vụ. Mọi thao tác ghi mới chỉ sử dụng `create` thuần túy.
     - Tuyệt đối không sử dụng `deleteMany`, `delete`, `TRUNCATE` hay raw SQL để dọn dẹp dữ liệu.
   - **Giới hạn Rerun & Đề xuất Kiến trúc Identity Marker**:
     - Do Prisma schema hiện tại không có trường định danh nguồn gốc dataset (như `datasetBatchId String?` hoặc `isDataset Boolean @default(false)`), hệ thống không thể phân biệt bản ghi dataset với bản ghi người dùng thực tế.
     - Do đó, **hệ thống từ chối rerun trên database đã có dữ liệu**. Muốn seed lại, cần chạy trên database rỗng chuyên dụng được chỉ định trong allowlist.
     - Để hỗ trợ rerun an toàn và idempotency thực thụ trong tương lai, kiến trúc khuyến nghị bổ sung trường `datasetBatchId` vào schema thông qua migration chính thức.
   - **Giao dịch Interactive Transaction (Atomicity Guard)**:
     - Toàn bộ quá trình tạo bản ghi được thực thi trong Prisma Interactive Transaction với `isolationLevel: Serializable` và `timeout: 60000` (60 giây).
     - **Lưu ý quan trọng**: Transaction rollback là cơ chế bảo vệ tính nguyên tử (Atomicity - All or Nothing) khi có lỗi phát sinh trong quá trình nạp, **không phải** cơ chế bảo vệ khỏi việc ghi đè dữ liệu ứng dụng (việc này được đảm bảo bởi Atomic Empty Check ở trên).
   - **Ánh xạ ID Động (Dynamic ID Mapping)**:
     - Ghi nhận ID thực tế do database tự sinh cho Room, User, Invoice để ánh xạ chính xác 100% vào các quan hệ khóa ngoại (User.roomId, Invoice.roomId, Payment.invoiceId, Ticket.residentId/technicianId/roomId, Feedback.residentId/roomId, Notification.authorId).

---

## 5. HƯỚNG DẪN VẬN HÀNH & KIỂM ĐỊNH (MILESTONE 10)

Hệ thống phân định rạch ròi giữa 3 hình thức kiểm tra:
1. **Unit & Component Tests**: Kiểm thử đơn vị từng generator (M3 - M9) và các trường hợp biên.
2. **In-Memory Validation**: Kiểm định toàn diện 8 nhóm tiêu chuẩn trên snapshot bộ nhớ (không chạm database, chạy cực nhanh, phục vụ CI/CD).
3. **Database Validation (Read-Only)**: Kiểm định dữ liệu thực tế sau khi seed trên PostgreSQL, sử dụng Prisma transaction chỉ đọc (`findMany`), có safety guard độc lập, tuyệt đối không sửa hay seed tự động.

---

### 5.1. Khởi tạo dữ liệu (Dataset Seeding)
Seed script chạy độc lập với kiểm soát an toàn nghiêm ngặt (Fail-Closed, create-only, yêu cầu database rỗng):
```bash
# Di chuyển vào thư mục backend
cd backend

# Chạy seed dữ liệu giả lập (bắt buộc chỉ định ALLOW_DATASET_SEED=true và DATASET_DB_ALLOWLIST)
ALLOW_DATASET_SEED=true DATASET_DB_ALLOWLIST="localhost:5432/apartment_demo" npx ts-node dataset/seed/index.ts
```

---

### 5.2. Chạy bộ kiểm thử toàn diện (Unit & Regression Test Suites)
```bash
cd backend

# Chạy bộ test kiểm định M10 (Validation Runner & 8 Check Groups)
npx ts-node -T dataset/validation/validation-suite.test.ts

# Chạy toàn bộ các suites M3 - M10
npx ts-node -T dataset/validation/reference-data.test.ts
npx ts-node -T dataset/validation/room-user-generator.test.ts
npx ts-node -T dataset/validation/invoice-payment-generator.test.ts
npx ts-node -T dataset/validation/ticket-generator.test.ts
npx ts-node -T dataset/validation/feedback-notification-generator.test.ts
npx ts-node -T dataset/validation/media-asset-generator.test.ts
npx ts-node -T dataset/validation/seed-orchestration.test.ts
npx ts-node -T dataset/validation/validation-suite.test.ts
npx ts-node -T dataset/validation/debug.test.ts
```

---

### 5.3. Kiểm định chất lượng Dataset Runner (Validation Runner)

#### Chế độ A: In-Memory Validation (Mặc định)
Kiểm tra toàn bộ 8 nhóm tiêu chuẩn trên dữ liệu do generator sinh ra, không yêu cầu kết nối cơ sở dữ liệu:
```bash
cd backend
npx ts-node dataset/validation/validate.ts
# hoặc chỉ định rõ flag:
npx ts-node dataset/validation/validate.ts --mode=in-memory
```

#### Chế độ B: Database Validation (Read-Only)
Kiểm tra dữ liệu đã nạp trong cơ sở dữ liệu PostgreSQL thực tế:
- **Nguyên tắc an toàn**:
  - Bắt buộc bật cờ xác nhận độc lập: `ALLOW_DATASET_VALIDATION=true`. (Tuyệt đối không dùng `ALLOW_DATASET_SEED`).
  - Bắt buộc chỉ định danh sách allowlist khớp mục tiêu: `DATASET_DB_ALLOWLIST="host:port/dbname"`.
  - Từ chối ngay lập tức nếu target chứa từ khóa Production (`prod`, `production`, `apartment-main`, `release-db`).
  - **Thuần túy Read-Only**: Chỉ sử dụng `findMany()` trong Prisma transaction với `isolationLevel: RepeatableRead` để chụp snapshot nhất quán. Tuyệt đối KHÔNG có lệnh `create`, `update`, `upsert`, `delete`, `deleteMany` hay migration.
  - **Phân biệt Cấp độ Bảo vệ**: Cơ chế Read-Only ở cấp mã nguồn (code-level transaction) không thay thế cho phân quyền tài khoản cơ sở dữ liệu. Khi chạy trên môi trường thực tế, khuyến nghị sử dụng tài khoản PostgreSQL chỉ có quyền `SELECT` (Read-Only database user).
  - **Không tự động seed**: Nếu phát hiện cơ sở dữ liệu rỗng (0 bản ghi), runner lập tức báo cáo FAIL; tuyệt đối không tự ý seed hoặc nạp dữ liệu thay thế.
  - **Không tự ý sửa dữ liệu**: Nếu phát hiện bản ghi lỗi, runner ghi nhận chi tiết vi phạm; tuyệt đối không tự sửa hoặc xóa dữ liệu ứng dụng.

```bash
cd backend
ALLOW_DATASET_VALIDATION=true DATASET_DB_ALLOWLIST="localhost:5432/apartment_sandbox" npx ts-node dataset/validation/validate.ts --mode=database
```

---

### 5.4. Chi tiết 8 Nhóm Tiêu Chuẩn Kiểm Định (Milestone 10.1 & 10.1.1)

Hệ thống kiểm định áp dụng nguyên tắc **Fail-Closed**, đối chiếu trực tiếp với Prisma Schema và Backend Application Controller:

1. **Kiểm toán Trùng lặp Ticket (Nhóm A — Backend Controller Parity)**:
   - Đối chiếu chính xác 100% thuật toán backend tại `backend/src/modules/tickets/tickets.controller.ts` (dòng 408–428).
   - **Các điều kiện trùng lặp thực tế của Backend**:
     - `category.trim()` khớp chính xác (sau khi trim khoảng trắng).
     - Trạng thái của phiếu trước thuộc tập hợp: `PENDING`, `ASSIGNED`, `IN_PROGRESS`.
     - Cửa sổ thời gian 24 giờ: `createdAt >= now - 24 giờ` (sử dụng toán tử `gte`, mốc đúng 24h00m00s vẫn tính là hợp lệ).
     - Phạm vi (Scope):
       - Nếu là sự cố phòng (`roomId !== null`): So sánh cùng `roomId`.
       - Nếu là sự cố khu vực chung (`roomId === null`): So sánh cùng `residentId` và `roomId: null`.
     - **Backend TUYỆT ĐỐI KHÔNG so sánh `title`**: Các phiếu khác tiêu đề nhưng cùng category và scope trong 24h vẫn được tính là duplicate.
     - **Backend TUYỆT ĐỐI KHÔNG lọc bỏ `isDuplicate = true`**: Phiếu trước đó dù đã mang cờ trùng lặp vẫn là ứng viên hợp lệ cho các phiếu tiếp theo (cho phép chuỗi trùng lặp liên tiếp T1 -> T2 -> T3).
   - **Phân định Kiến trúc & Quy ước Kiểm định**:
     - *Query runtime của Backend*: Thực hiện động tại thời điểm request đến, Prisma truy vấn `createdAt: { gte: oneDayAgo }` so với `Date.now()`.
     - *Kiểm tra lịch sử của Validator*: Để kiểm định dataset tĩnh đã nạp, validator sử dụng quy ước thứ tự thời gian (chronological ordering) dựa trên `createdAt` và `id` (làm tie-breaker) để xác định vé nào tạo trước vé nào. Đây là quy ước kiểm tra dữ liệu lịch sử tĩnh nhằm xác minh tính nhất quán logic nghiệp vụ, không phải là sự thay thế hay tương đương tuyệt đối với câu query runtime của controller.
   - **Kiểm tra Hai chiều (Bi-directional Parity)**:
     - Nếu có ticket trước đó thỏa mãn điều kiện trùng lặp, ticket sau **bắt buộc** phải có `isDuplicate = true`.
     - Nếu không có ticket trước đó thỏa mãn, ticket **bắt buộc** phải có `isDuplicate = false`.
   - **Kiểm toán Phân quyền & Quan hệ**:
     - Cư dân tạo phiếu sự cố phòng (`roomId != null`) phải thuộc đúng căn hộ đó; thợ kỹ thuật tuyệt đối không được là người tạo phiếu (`residentId.role != TECHNICIAN`).
     - Thợ được phân công (`technicianId`) bắt buộc phải có vai trò `TECHNICIAN`.
     - Đánh giá sự cố (`rating` 1–5 sao) chỉ hợp lệ khi phiếu đã đóng (`status = CLOSED`).

2. **Kiểm toán Tài chính & Decimal (Blocker B — Financial Audit)**:
   - Áp dụng `Prisma.Decimal` cho toàn bộ 7 trường tiền tệ: `Invoice.{managementFee, parkingFee, waterFee, otherFee, totalAmount, paidAmount}` và `Payment.amount`.
   - **Scale Audit**: Tất cả giá trị Decimal không được vượt quá 2 chữ số thập phân (`dec.decimalPlaces() <= 2`).
   - **Precision Audit**: Giá trị không được vượt quá giới hạn schema `DECIMAL(12,2)` (`<= 9,999,999,999.99`).
   - **Toán học chính xác**:
     - Mọi khoản phí phải không âm (`fee >= 0`); số tiền thanh toán phải dương (`Payment.amount > 0`).
     - Tổng tiền hóa đơn bằng chính xác tổng 4 thành phần phí: `totalAmount == managementFee + parkingFee + waterFee + otherFee`.
     - Tổng số tiền đã thanh toán bằng chính xác tổng các phiếu thanh toán: `paidAmount == sum(Payment.amount)`.
     - Không cho phép thanh toán vượt (`paidAmount <= totalAmount`).
     - Trạng thái hóa đơn nhất quán: `UNPAID` (paidAmount = 0), `PARTIAL` (0 < paidAmount < totalAmount), `PAID` (paidAmount = totalAmount).

3. **Bộ lọc Quyền Riêng Tư, Quét PII & Bảo Vệ Báo Cáo (Nhóm B — Privacy Guard)**:
   - **Số điện thoại**: Quét và phát hiện số điện thoại Việt Nam với các định dạng phân tách (khoảng trắng, dấu chấm, gạch ngang). Che giấu `098***456`.
   - **Số CCCD / CMND**: Phát hiện chuỗi 12 chữ số định danh công dân. Che giấu `001200******`.
   - **Email & Domain Masking**: Quét email trong các trường văn bản tự do. Cấm domain công cộng thực tế (`gmail.com`, `yahoo.com`, ...). Hàm `maskEmail` che giấu cả username và domain (`re***@ch***.internal`, `ad***@gm***.com`), tuyệt đối không để lộ nguyên domain nhạy cảm.
   - **Username Masking**: Hàm `maskUsername` che giấu username trong error log (`ad***n`, `re***1`), loại bỏ hoàn toàn việc in username nguyên văn.
   - **Tài khoản Ngân hàng (STK)**: Quét chuỗi 8–19 chữ số đi kèm từ khóa ngữ cảnh ngân hàng. Che giấu `1903****9123`.
   - **Mật khẩu Băm**: Xác minh 100% mật khẩu User được băm Bcrypt chuẩn (`$2a$`, `$2b$`, `$2y$`).
   - **Bảo Vệ Đường Đi Báo Cáo, CLI Output & Serializer Allowlist (Milestone 10.1.3/10.1.4/10.1.5 Hardening)**:
     - **Allowlist Serializer**: `saveValidationReport()` tuyệt đối không sử dụng spread operator (`{ ...report }`, `{ ...r }`). Chỉ tuần tự hóa các trường thuộc danh mục an toàn được phê duyệt (`timestamp`, `mode`, `targetDatabase`, `totalChecks`, `passedChecks`, `failedChecks`, `overallStatus`, `modelCounts`, `results`). Mọi trường lạ, raw exception, stack trace hoặc nested objects nhạy cảm ngoài allowlist đều bị triệt tiêu hoàn toàn.
     - **Thẩm định Lịch ISO 8601 Nghiêm ngặt (`isValidIsoTimestamp` - Milestone 10.1.4/10.1.5 Blocker B)**: Thẩm định đầy đủ theo lịch thực tế. Kiểm tra năm, tháng (1..12), số ngày thực tế trong tháng (kể cả năm nhuận 29/02, từ chối 29/02 ở năm thường, từ chối 30/02, từ chối ngày 00 hoặc vượt số ngày trong tháng). Từ chối giờ 24 (chỉ chấp nhận 00..23), từ chối phút/giây ngoài 00..59. Thẩm định đối xứng timezone offset trong phạm vi `[-14:00, +14:00]` (khi trị tuyệt đối bằng 14 giờ thì phút bắt buộc bằng 00, từ chối offset ngoài phạm vi và phút offset không hợp lệ). Nếu timestamp chứa nội dung tùy ý hoặc dấu hiệu PII/secrets, hệ thống tự động thay thế bằng ISO timestamp hệ thống an toàn trong cả JSON report và CLI output.
     - **Bảo toàn Số liệu Thống kê An toàn (`invalidPasswords` - Milestone 10.1.4 Blocker A)**: Hàm `sanitizeValueForReport()` phân biệt dữ liệu bí mật thực sự với các số liệu thống kê an toàn. Trường `invalidPasswords` khi mang giá trị số hữu hạn (`number`) được bảo toàn nguyên vẹn kiểu dữ liệu số trong `details` của JSON report. Nếu mang giá trị string, object hoặc non-number, trường sẽ bị che giấu an toàn thành `[REDACTED_SENSITIVE_FIELD]`. Các trường `password`, `passwordHash`, `secret`, `token`, `credential`, `stack` luôn được bảo vệ/che kín tuyệt đối.
     - **Làm sạch Database Target (`sanitizeDatabaseTarget`)**: Che giấu cả username và password (`postgres://***:***@...`), loại bỏ hoàn toàn query parameters chứa token, secrets hoặc credentials, đồng thời quét sạch PII nếu vô tình nằm trong hostname hoặc database name.
     - **Bảo vệ Toàn diện CLI Output (`printValidationReport`)**: Toàn bộ chuỗi động in ra console (`timestamp`, `targetDatabase`, `name`, `message`, `errors`) đều được làm sạch qua sanitizer. Tuyệt đối không phát tán email, SĐT, STK, username, mật khẩu, Bcrypt hash, Bearer token, database credentials hay stack trace. Trạng thái kiểm định PASS/FAIL và thống kê số lượng 8 models an toàn luôn được bảo toàn nguyên vẹn.
     - **Khử sạch PII đa tầng**: Mọi chuỗi văn bản trong `message`, `errors`, `details` và `targetDatabase` đều được khử sạch:
       - Email (che giấu cả username và domain nhạy cảm).
       - Số điện thoại Việt Nam (kể cả định dạng có dấu cách, dấu chấm, dấu gạch ngang, đầu số `+84` hay `0`).
       - Số tài khoản ngân hàng (STK) 8–19 chữ số kèm ngữ cảnh.
       - Định danh người dùng (Username) dạng `username: ...` hoặc `người dùng '...'`.
       - Chuỗi băm Bcrypt (`$2a$`, `$2b$`, `$2x$`, `$2y$`) được thay bằng `[REDACTED_BCRYPT_HASH]`.
       - Mật khẩu, token, secret, credential, Bearer token (`[REDACTED_SECRET]`, `[REDACTED_TOKEN]`).
       - Stack trace và đường dẫn mã nguồn nội bộ (`[REDACTED_STACK_TRACE]`, `[REDACTED_SOURCE_PATH]`).
     - **CLI Sanitized Error Logging**: `runValidationCLI()` bọc toàn bộ thông báo lỗi trong `sanitizeTextForReport()`, tuyệt đối không in raw exception message hay stack trace nhạy cảm ra `console.error` hoặc `console.warn`.
   - *Lưu ý*: Quét regex có giới hạn kỹ thuật, không thể đảm bảo 100% nếu PII bị biến dạng; nghiêm cấm tuyệt đối đưa dữ liệu cư dân thật vào mã nguồn.

4. **Kiểm toán Quan hệ & Ràng Buộc Duy Nhất (Blocker F — Relational Audit)**:
   - Ràng buộc duy nhất: `Room.roomNumber`, `User.username`, `User.email` (khi khác null), và toàn bộ ID của cả 8 models.
   - Định dạng tháng: `Invoice.month` bắt buộc chuẩn ISO `YYYY-MM` (tháng từ 01 đến 12).
   - Toàn vẹn khóa ngoại: Kiểm tra 100% các liên kết giữa 8 models (`User.roomId`, `Invoice.roomId`, `Payment.invoiceId`, `Ticket.{residentId, technicianId, roomId}`, `Feedback.{residentId, roomId}`, `Notification.authorId`).

5. **Nhất Quán Báo Cáo & Khả Năng Kháng Lỗi (Blocker E — Report Consistency)**:
   - Bất biến kiểm toán: Runner luôn trả về đúng 8 nhóm kết quả (`results.length === 8`).
   - Luôn thỏa mãn đẳng thức: `totalChecks === 8` và `passedChecks + failedChecks === totalChecks`.
   - Kháng lỗi độc lập: Mỗi runner được bao bọc trong khối `try/catch` độc lập; lỗi phát sinh ở một nhóm không làm triệt tiêu hay gián đoạn 7 nhóm còn lại.

6. **Chính Sách Tài Sản Truyền Thông (Milestone 8 Policy)**:
   - Xác minh `MediaAsset` mặc định là 0 bản ghi (`count === 0`).
   - Nếu có tài sản thật, bắt buộc phải có `isConfirmed = true` và `confirmedAt != null`.

---

### 5.5. Kiểm Tra Tính Xác Định Toàn Diện & Báo Cáo Kết Quả (Nhóm C — Full Determinism Audit)

- **So Sánh Canonical Business Snapshot trên Cả 8 Models**:
  Hàm `compareDatasetSnapshots()` và `verifyDatasetDeterminism()` thực hiện so sánh toàn diện 100% tất cả bản ghi và mọi trường nghiệp vụ của toàn bộ 8 Prisma models (Room: 100, User: 128, Ticket: 175, Invoice: 500, Payment: 472, Feedback: 40, Notification: 25, MediaAsset: 0 — Tổng cộng **1,440 bản ghi**):
  - **Thẩm Tra Ràng Buộc Schema & So Sánh Giá Trị Chuẩn Hóa (Milestone 10.1.2/10.1.3 Schema Hardening)**:
    - **Thẩm tra Nghiêm ngặt Sự Hiện Diện Của 8 Model Keys (Milestone 10.1.3 Blocker C)**:
      Bắt buộc cả hai snapshots phải chứa đầy đủ 8 canonical models: `rooms`, `users`, `tickets`, `invoices`, `payments`, `feedbacks`, `notifications`, `mediaAssets`.
      - Thiếu model ở snapshot 1: Ghi nhận vi phạm và kết luận FAIL.
      - Thiếu model ở snapshot 2: Ghi nhận vi phạm và kết luận FAIL.
      - Thiếu model ở cả hai snapshots: Ghi nhận vi phạm và kết luận FAIL (tuyệt đối không tự ý gán mặc định thành mảng rỗng `[]`).
      - Model có giá trị null, undefined hoặc kiểu dữ liệu không phải array: Ghi nhận vi phạm và kết luận FAIL.
      - Model có mảng rỗng `[]` (ví dụ `mediaAssets` theo chính sách Zero-Asset): Hợp lệ và PASS sau khi đã xác thực đúng kiểu mảng.
    - **Tập trường mong đợi theo Prisma Schema (`PRISMA_SCHEMA_EXPECTED_FIELDS`)**:
      Đối chiếu 100% tất cả các trường vô hướng (scalar fields) của toàn bộ 8 models theo `schema.prisma`:
      - `Room` (7 trường): `id`, `roomNumber`, `floor`, `area`, `status`, `createdAt`, `updatedAt`.
      - `User` (11 trường): `id`, `username`, `password`, `fullName`, `phone`, `email`, `role`, `roomId`, `isApproved`, `createdAt`, `updatedAt`.
      - `Ticket` (16 trường): `id`, `title`, `category`, `description`, `mediaUrl`, `status`, `roomId`, `residentId`, `technicianId`, `materials`, `completedMediaUrl`, `rating`, `ratingComment`, `isDuplicate`, `createdAt`, `updatedAt`.
      - `Invoice` (13 trường): `id`, `roomId`, `month`, `managementFee`, `parkingFee`, `waterFee`, `otherFee`, `totalAmount`, `paidAmount`, `dueDate`, `status`, `createdAt`, `updatedAt`.
      - `Payment` (7 trường): `id`, `invoiceId`, `amount`, `paymentMethod`, `transactionCode`, `note`, `paidAt` (không có createdAt/updatedAt theo schema).
      - `Feedback` (10 trường): `id`, `residentId`, `roomId`, `title`, `content`, `reply`, `isResolved`, `repliedAt`, `createdAt`, `updatedAt`.
      - `Notification` (6 trường): `id`, `title`, `content`, `targetRoom`, `authorId`, `createdAt` (không có updatedAt theo schema).
      - `MediaAsset` (17 trường): `id`, `publicId`, `url`, `resourceType`, `deliveryType`, `purpose`, `bytes`, `format`, `width`, `height`, `duration`, `uploaderId`, `ticketId`, `isConfirmed`, `confirmedAt`, `createdAt`, `updatedAt`.
    - **Thẩm định Sự Hiện Diện Của Trường Schema Trên Từng Bản Ghi**:
      Validator kiểm tra sự tồn tại của 100% các trường schema trên mọi bản ghi. Nếu bất kỳ trường schema nào bị thiếu ở snapshot 1, snapshot 2, hoặc thiếu ở cả hai snapshots, phép so sánh lập tức ghi nhận vi phạm và kết luận FAIL.
    - **Chính Sách Loại Trừ Nghiêm Ngặt (`Strict excludeFields`)**:
      Hệ thống áp dụng chính sách Fail-Closed đối với danh sách loại trừ: **CHỈ DUY NHẤT trường `users.password` được phép đưa vào `excludeFields`** do tính chất muối ngẫu nhiên của thuật toán Bcrypt. Bất kỳ yêu cầu loại trừ trường nghiệp vụ nào khác (ví dụ: `rooms.status`, `tickets.category`, `invoices.totalAmount`, ...) đều bị từ chối tuyệt đối và làm hỏng kết quả kiểm định (`isDeterministic = false`).
    - **So Sánh Bình Đẳng Ngữ Nghĩa Trực Tiếp (`areCanonicalValuesEqual`)**:
      So sánh trực tiếp giá trị giữa hai bản ghi mà không dựa vào chuỗi sentinel `'__UNDEFINED__'`, triệt tiêu hoàn toàn nguy cơ va chạm chuỗi (sentinel collision) khi dữ liệu thực tế chứa chuỗi `'__UNDEFINED__'`. Hỗ trợ so sánh Decimal chính xác tuyệt đối qua `equals()`, Date qua timestamp `getTime()`, và đệ quy cấu trúc mảng / đối tượng đã sắp xếp khóa ổn định.
  - **Chính sách về Mật Khẩu Băm (Password Hash Determinism)**:
    - Khi kiểm định determinism, generator nhận cùng một hash Bcrypt đầu vào cố định (`fixedPasswordHash`). Nhờ đó, **100% tất cả các trường (bao gồm cả `User.password`) đều trùng khớp tuyệt đối, không có bất kỳ trường nào bị loại trừ (`excludedFields = {}`)**.
    - Nếu hai lần chạy độc lập không truyền `passwordHash`, trường duy nhất có sự khác biệt là `User.password` do cơ chế sinh muối ngẫu nhiên (`crypto.randomBytes`) của thuật toán Bcrypt. Bộ so sánh hỗ trợ tham số `excludeFields: { users: ['password'] }` với lý do kỹ thuật rõ ràng này.
  - **Độ nhạy phát hiện vi phạm**: Bất kỳ thay đổi nào trên từng trường nghiệp vụ của bất kỳ model nào (kể cả các trường như `Ticket.materials`, `Invoice.waterFee`, `Feedback.reply`, `Payment.note`, `Notification.targetRoom`, `Room.status`) đều bị phát hiện ngay lập tức.
- **Lưu Báo Cáo Kiểm Định JSON**:
  Hàm `saveValidationReport()` tự động xuất báo cáo kết quả chi tiết ra tệp `backend/dataset/reports/validation-report.json`, bao gồm trạng thái tổng thể, số lượng kiểm tra, chi tiết lỗi từng nhóm và siêu dữ liệu môi trường đã được sanitize qua Allowlist Serializer.

---

> [!NOTE]
> **Hiện trạng Kiểm chứng & Giới hạn Thực thi Cơ sở Dữ liệu**:  
> 1. **In-Memory Validation**: Đã được kiểm thử 100% và đạt kết quả PASS toàn diện trên cả 8 nhóm tiêu chuẩn nghiệp vụ.
> 2. **Stateful Mock Transactions**: Đã được kiểm chứng 100% (88/88 tests PASS trong validation suite, 279/279 tests toàn bộ dự án PASS).
> 3. **PostgreSQL Sandbox Integration**: **Chưa được thực hiện trên cơ sở dữ liệu PostgreSQL thật**. Hệ thống tuân thủ nghiêm ngặt nguyên tắc an toàn: chỉ thực thi seed và database validation khi người dùng cung cấp và xác nhận một môi trường database sandbox chuyên dụng (tuyệt đối không chạy trên môi trường production).

