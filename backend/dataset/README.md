# DATASET HỆ THỐNG QUẢN LÝ VÀ VẬN HÀNH CHUNG CƯ
## Phân hệ Dữ liệu Giả lập Độc lập (Independent Dataset Foundation)

**Vị trí:** `backend/dataset/`  
**Công nghệ:** TypeScript, Prisma Client 5, Node.js (>= 20), PostgreSQL 16, Bcryptjs  
**Trạng thái:** Milestone 2 — Dataset Folder Foundation  

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
│   │   └── notification.generator.ts
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
│   ├── validate.ts                # Runner chạy toàn bộ kiểm tra
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
4. **Chính sách MediaAsset & Tích hợp Tài sản Thật (Milestone 8)**:
   - **Zero-Asset Default**: Mặc định dataset có 0 bản ghi `MediaAsset`.
   - **Chống tài nguyên giả mạo**: Tuyệt đối không tự sinh Cloudinary URL, publicId, signature hoặc metadata giả mạo; không tự đặt `isConfirmed = true`.
   - **Quy trình upload & confirm hợp lệ của Backend**:
     1. Client gửi yêu cầu cấp chữ ký tới `POST /api/media/signature` kèm mục đích (`purpose`: `tickets`, `materials`, `announcements`), `resourceType` (`image` hoặc `video`) và `ticketId` (nếu có).
     2. Backend xác thực vai trò (RBAC), tạo `folder` an toàn, sinh HMAC-SHA256 `intentToken` có thời hạn 15 phút và chữ ký Cloudinary Direct Upload.
     3. Client tải trực tiếp tệp lên Cloudinary thông qua URL được cấp chữ ký.
     4. Client gửi yêu cầu xác nhận tới `POST /api/media/confirm` kèm `intentToken` và `publicId`.
     5. Backend xác thực `intentToken`, truy vấn Cloudinary Admin API (`cloudinary.api.resource`) để lấy kích thước bytes và format thực tế:
        - Ảnh: tối đa 5 MB (5,242,880 bytes), format: `jpg`, `jpeg`, `png`, `webp`.
        - Video: tối đa 20 MB (20,971,520 bytes), format: `mp4`, `mov`.
     6. Chỉ khi vượt qua kiểm duyệt, Backend mới lưu bản ghi vào bảng `MediaAsset` với `isConfirmed = true` và `confirmedAt = now()`.
   - **Seed Engine**: Không gọi Cloudinary API và không upload file giả trong quá trình seed. Chỉ các tài sản thật đã qua quy trình trên mới được hợp thức hóa.

---

## 5. HƯỚNG DẪN VẬN HÀNH DỰ KIẾN

### 5.1. Khởi tạo dữ liệu (Seeding)
Sau khi hoàn thiện các generator tại các milestone tiếp theo, seed script sẽ được chạy độc lập thông qua lệnh:
```bash
# Di chuyển vào thư mục backend
cd backend

# Chạy seed dữ liệu giả lập
npx ts-node dataset/seed/index.ts
```

### 5.2. Kiểm tra tính toàn vẹn (Validation)
Sau khi seed thành công vào database, bộ kiểm tra chất lượng dữ liệu được kích hoạt:
```bash
# Kiểm tra 5 tiêu chí: Counts, Relations, Financials, Tickets, Media
npx ts-node dataset/validation/validate.ts
```
Toàn bộ kết quả kiểm tra sẽ được xuất báo cáo chi tiết vào thư mục `backend/dataset/reports/`.

