# DATASET HỆ THỐNG QUẢN LÝ VÀ VẬN HÀNH CHUNG CƯ
## Phân hệ Dữ liệu Giả lập Độc lập (Independent Dataset Foundation)

**Vị trí:** `backend/dataset/`  
**Công nghệ:** TypeScript, Prisma Client 5, Node.js (>= 20), PostgreSQL 16, Bcryptjs  
**Trạng thái:** Milestone 9 — Prisma Seed Orchestration  

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
├── validation/                    # Bộ kiểm tra tính toàn vẹn dataset
│   ├── validate.ts                # Runner chạy toàn bộ kiểm tra nghiệm thu
│   ├── debug.test.ts              # Kiểm tra nhanh sanity checks
│   ├── reference-data.test.ts     # Kiểm thử dữ liệu tham chiếu (M3)
│   ├── room-user-generator.test.ts # Kiểm thử Room & User generator (M4)
│   ├── invoice-payment-generator.test.ts # Kiểm thử Invoice & Payment generator (M5)
│   ├── ticket-generator.test.ts   # Kiểm thử Ticket generator (M6)
│   ├── feedback-notification-generator.test.ts # Kiểm thử Feedback & Notification (M7)
│   ├── media-asset-generator.test.ts # Kiểm thử chính sách Zero-Asset & RBAC (M8/M8.1)
│   ├── seed-orchestration.test.ts # Kiểm thử điều phối seed, ID mapping & an toàn DB (M9)
│   └── checks/                    # Các check logic chuyên biệt
│       ├── counts.check.ts
│       ├── relational.check.ts
│       ├── financial.check.ts
│       ├── ticket.check.ts
│       └── media.check.ts
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
3. **Idempotent / Upsert an toàn**:
   - Sử dụng khóa duy nhất (unique keys như `roomNumber`, `username`, `[roomId, month]`) để đảm bảo việc chạy lại (rerun) không gây trùng lặp bản ghi hoặc crash hệ thống.
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

5. **Điều phối Seed & Đảm bảo Toàn vẹn (Milestone 9 - Prisma Seed Orchestration)**:
   - **Fail-Closed Safety Guard**: Kiểm tra đa tầng an toàn môi trường cơ sở dữ liệu:
     - Từ chối tuyệt đối khi `NODE_ENV === 'production'`.
     - Bắt buộc cờ xác nhận `ALLOW_DATASET_SEED === 'true'`.
     - Phân tích `DATABASE_URL`: Từ chối nếu hostname hoặc database name chứa các từ khóa production (`prod`, `production`, `live`, `main`, `master`, `release`).
     - Đối với cloud database providers (Neon, Supabase, RDS, v.v.), bắt buộc tên database phải chứa nhãn an toàn (`dev`, `test`, `local`, `seed`, `sandbox`).
     - Không bao giờ mặc định ngầm hiểu `localhost` là môi trường phát triển nếu thiếu cấu hình tường minh.
   - **Interactive Transaction & Timeout**:
     - Toàn bộ 8 models được ghi trong một Prisma Interactive Transaction (`prisma.$transaction(..., { timeout: 60000 })`).
     - Tự động rollback 100% nếu có bất kỳ lỗi nào xảy ra ở bất kỳ bước nào.
   - **Dynamic Database ID Mapping**:
     - Không bao giờ giả định ID bộ nhớ trùng với ID tự tăng của cơ sở dữ liệu.
     - Xây dựng bản đồ ánh xạ thực tế (`roomIdMap`, `userIdMap`, `invoiceIdMap`) để tham chiếu chính xác toàn bộ quan hệ khóa ngoại (`residentId`, `technicianId`, `roomId`, `invoiceId`).
   - **Pre-write In-Memory Validation**:
     - Thẩm tra cấu trúc dữ liệu toàn diện trước khi mở transaction ghi DB: số lượng, Zero-Asset, tính duy nhất khóa, vai trò người tạo Ticket/Feedback, và tính nhất quán tài chính (tổng tiền các phí = tổng hóa đơn, trạng thái hóa đơn = tổng tiền thanh toán).
   - **Guaranteed Cleanup**:
     - Đảm bảo đóng kết nối Prisma (`prisma.$disconnect()`) trong khối `finally` ở mọi trường hợp thành công hoặc thất bại.

---

## 5. HƯỚNG DẪN VẬN HÀNH

### 5.1. Khởi tạo dữ liệu (Seeding)
Seed script chạy độc lập với kiểm soát an toàn nghiêm ngặt:
```bash
# Di chuyển vào thư mục backend
cd backend

# Chạy seed dữ liệu giả lập (yêu cầu cờ ALLOW_DATASET_SEED=true)
ALLOW_DATASET_SEED=true npx ts-node dataset/seed/index.ts
```

### 5.2. Chạy bộ kiểm thử (Unit & Regression Tests)
```bash
# Chạy kiểm thử điều phối seed M9
npx ts-node -T dataset/validation/seed-orchestration.test.ts

# Chạy kiểm định toàn bộ các bộ generator (M3 - M9)
npx ts-node -T dataset/validation/debug.test.ts
npx ts-node -T dataset/validation/reference-data.test.ts
npx ts-node -T dataset/validation/room-user-generator.test.ts
npx ts-node -T dataset/validation/invoice-payment-generator.test.ts
npx ts-node -T dataset/validation/ticket-generator.test.ts
npx ts-node -T dataset/validation/feedback-notification-generator.test.ts
npx ts-node -T dataset/validation/media-asset-generator.test.ts
npx ts-node -T dataset/validation/seed-orchestration.test.ts
```

### 5.3. Kiểm tra tính toàn vẹn (Validation)
Sau khi seed thành công vào database, bộ kiểm tra chất lượng dữ liệu được kích hoạt:
```bash
# Kiểm tra 5 tiêu chí: Counts, Relations, Financials, Tickets, Media
npx ts-node dataset/validation/validate.ts
```
Toàn bộ kết quả kiểm tra sẽ được xuất báo cáo chi tiết vào thư mục `backend/dataset/reports/`.

