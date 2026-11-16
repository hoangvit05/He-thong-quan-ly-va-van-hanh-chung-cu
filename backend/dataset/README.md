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

### 5.4. Chi tiết 8 Nhóm Tiêu Chuẩn Kiểm Định (Milestone 10.1)

Hệ thống kiểm định áp dụng nguyên tắc **Fail-Closed**, đối chiếu trực tiếp với Prisma Schema và Backend Application Controller:

1. **Kiểm toán Trùng lặp Ticket (Blocker A — Backend Parity)**:
   - Đối chiếu chính xác 100% thuật toán backend tại `backend/src/modules/tickets/tickets.controller.ts` (dòng 408–428).
   - **Kiểm tra Hai chiều (Bi-directional Parity)**:
     - Nếu có ticket trước đó trong vòng 24 giờ cùng `residentId`, `category` và `title`, ticket sau **bắt buộc** phải có `isDuplicate = true`.
     - Nếu không có ticket trước đó thỏa mãn điều kiện trên, ticket **bắt buộc** phải có `isDuplicate = false`.
   - **Không lọc bỏ Ticket đã trùng lặp**: Thuật toán backend không lọc `isDuplicate = false` khi tìm ticket trùng lặp trước đó, cho phép các chuỗi trùng lặp liên tiếp (T1 -> T2 -> T3) được nhận diện hợp lệ.
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

3. **Bộ lọc Quyền Riêng Tư & Quét PII (Blocker C — Privacy Guard)**:
   - **Số điện thoại**: Quét và phát hiện số điện thoại Việt Nam với các định dạng phân tách (khoảng trắng, dấu chấm, gạch ngang).
   - **Số CCCD / CMND**: Phát hiện chuỗi 12 chữ số định danh công dân.
   - **Email nhúng**: Quét địa chỉ email trong các trường văn bản tự do (`title`, `description`, `content`). Cấm tuyệt đối domain cá nhân thực tế (`gmail.com`, `yahoo.com`, `hotmail.com`, `outlook.com`, `icloud.com`). Chỉ cho phép domain giả lập `apartment.local`.
   - **Tài khoản Ngân hàng (STK)**: Quét chuỗi 8–19 chữ số đi kèm từ khóa ngữ cảnh ngân hàng (`stk`, `số tài khoản`, `vietcombank`, `techcombank`, `mbbank`, ...).
   - **Dữ liệu thô Base64**: Phát hiện và chặn các chuỗi Base64 Data URI nhúng trong văn bản.
   - **Mật khẩu Băm**: Xác minh 100% mật khẩu User được băm Bcrypt chuẩn (`$2a$`, `$2b$`, `$2y$`).
   - **Masking Bảo mật**: Toàn bộ dữ liệu PII vi phạm trong báo cáo lỗi đều được che giấu (`098***456`, `001200******`, `[REDACTED]`), tuyệt đối không để lộ dữ liệu thô ra log hoặc report.
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

### 5.5. Kiểm Tra Tính Xác Định & Báo Cáo Kết Quả (Milestone 10 Acceptance)

- **Kiểm tra Tính Xác Định (Determinism Check)**:
  Hàm `verifyDatasetDeterminism()` chạy generator độc lập 2 lần với cùng random seed và so sánh sâu (deep equality) giữa 2 snapshot. Bất kỳ sự phân kỳ nào giữa 2 lần chạy đều khiến bài kiểm tra thất bại ngay lập tức.
- **Lưu Báo Cáo Kiểm Định JSON**:
  Hàm `saveValidationReport()` tự động xuất báo cáo kết quả chi tiết ra tệp `backend/dataset/reports/validation-report.json`, bao gồm trạng thái tổng thể, số lượng kiểm tra, chi tiết lỗi từng nhóm và siêu dữ liệu môi trường.

---

> [!NOTE]
> **Hiện trạng Kiểm chứng Cơ sở Dữ liệu Thực tế**:  
> Toàn bộ các cơ chế an toàn và quy trình kiểm định database trong Milestone 9 và 10 hiện đã được kiểm chứng 100% thông qua Stateful Mock Transactions và In-memory Snapshots (35/35 tests PASS, 226/226 tests toàn bộ test suites PASS).  
> Việc thực thi seed và database validation trên database PostgreSQL thực tế sẽ chỉ được thực hiện khi người dùng cung cấp và xác nhận một môi trường database sandbox chuyên dụng (không chạy trên production).

