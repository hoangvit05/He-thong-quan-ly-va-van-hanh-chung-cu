# HƯỚNG DẪN KHỞI CHẠY & KIỂM THỬ BACKEND (CLEAN-ROOM GUIDE)

Tài liệu này cung cấp quy trình chuẩn để một nhà phát triển mới thiết lập môi trường, chạy unit tests và integration tests một cách an toàn và độc lập từ một môi trường sạch hoàn toàn.

---

## 1. Yêu cầu môi trường (Prerequisites)

- **Node.js**: Phiên bản 24.x LTS (khuyến nghị baseline, hỗ trợ đến 04/2028) hoặc 22.x LTS (Maintenance LTS, hỗ trợ đến 04/2027). Tuyệt đối không sử dụng Node.js 20 do đã hết vòng đời hỗ trợ (EOL 30/04/2026).
- **npm**: Đi kèm với Node.js (khuyến nghị npm 10.x trở lên).
- **Docker & Docker Compose**: Docker Desktop (Windows/macOS) hoặc Docker Engine (Linux) đang hoạt động.
- **Git**: Để quản lý mã nguồn.

---

## 2. Cài đặt Dependencies

Tại thư mục `backend/`, cài đặt các gói phụ thuộc bằng lệnh:

```bash
cd backend
npm ci
```

---

## 3. Cấu hình Môi trường Kiểm thử (Environment Setup)

Để chạy Integration Tests trên PostgreSQL thật, cần cấu hình các biến môi trường bắt buộc (không có mật khẩu mặc định):

1. **`POSTGRES_PASSWORD`**: Mật khẩu cho tài khoản quản trị `test_user` (dùng khi khởi động Docker Compose và đồng bộ Prisma schema).
2. **`POSTGRES_APP_PASSWORD`**: Mật khẩu cho tài khoản ứng dụng Least Privilege `test_app_user` (dùng khi khởi động Docker Compose).
3. **`DATABASE_URL`**: Connection string cho tiến trình test runner (phải trỏ vào `apartment_test` với user `test_app_user`).
4. **`POSTGRES_PORT`**: Cổng host map vào container (mặc định là `5432`). Safety Guard của bộ kiểm thử tích hợp hiện tại bắt buộc kết nối database phải sử dụng cổng `5432`. Nếu cổng 5432 trên máy đang bị chiếm dụng bởi dịch vụ khác, bạn cần giải phóng hoặc dừng dịch vụ đó để giải quyết xung đột cổng trước khi chạy kiểm thử tích hợp.

> [!IMPORTANT]
> **Quy tắc bảo mật & Cô lập:**
> - Không sử dụng mật khẩu mặc định hoặc hardcode mật khẩu vào file cấu hình.
> - `docker-compose.test.yml` không cố định `container_name` hoặc `volume name`, bảo đảm mọi tài nguyên được cô lập theo tiền tố project (`-p apartment-test`), hoàn toàn không ảnh hưởng tới container hoặc volume khác trên máy.

---

## 4. Khởi động PostgreSQL Test Container (Isolated Docker Compose)

Khởi động container kiểm thử bằng tệp `docker-compose.test.yml` với tên project riêng (`apartment-test`) để cô lập hoàn toàn container và volume:

### Trên Linux / macOS (Bash):
```bash
# Đứng tại thư mục gốc repository
export POSTGRES_PASSWORD="<YOUR_SECURE_ADMIN_PASSWORD>"
export POSTGRES_APP_PASSWORD="<YOUR_SECURE_APP_PASSWORD>"
# Lưu ý: Safety Guard của test runner yêu cầu cổng 5432; không đổi sang cổng khác khi chạy integration test

# Khởi chạy container với tên project riêng biệt
docker compose -f docker-compose.test.yml -p apartment-test up -d
```

### Trên Windows (PowerShell):
```powershell
# Đứng tại thư mục gốc repository
$env:POSTGRES_PASSWORD = "<YOUR_SECURE_ADMIN_PASSWORD>"
$env:POSTGRES_APP_PASSWORD = "<YOUR_SECURE_APP_PASSWORD>"
# Lưu ý: Safety Guard của test runner yêu cầu cổng 5432; không đổi sang cổng khác khi chạy integration test

# Khởi chạy container với tên project riêng biệt
docker compose -f docker-compose.test.yml -p apartment-test up -d
```

---

## 5. Chờ Database Đạt Trạng Thái Healthy

PostgreSQL container có cấu hình health check (`pg_isready`). Đảm bảo container đã sẵn sàng trước khi chạy các bước tiếp theo:

```bash
docker compose -f docker-compose.test.yml -p apartment-test ps
```
*Trạng thái cột `STATUS` phải hiển thị: `Up ... (healthy)`.*

---

## 6. Đồng bộ Schema Prisma vào Database Test

Trước khi chạy integration tests, schema cần được tạo trên database `apartment_test`. Thao tác này được thực hiện bởi tài khoản quản trị `test_user`:

### Trên Linux / macOS (Bash):
```bash
cd backend
DATABASE_URL="postgresql://test_user:<YOUR_SECURE_ADMIN_PASSWORD>@127.0.0.1:5432/apartment_test?schema=public" npx prisma db push --schema=src/database/schema.prisma
```

### Trên Windows (PowerShell):
```powershell
cd backend
$env:DATABASE_URL = "postgresql://test_user:<YOUR_SECURE_ADMIN_PASSWORD>@127.0.0.1:5432/apartment_test?schema=public"
npx prisma db push --schema=src/database/schema.prisma
```

*Lưu ý:* Khi `test_user` tạo các bảng, các quyền `SELECT`, `INSERT`, `UPDATE`, `DELETE` sẽ tự động được áp dụng cho `test_app_user` thông qua cơ chế `ALTER DEFAULT PRIVILEGES` đã được init script cấu hình trước.

---

## 7. Chạy Unit Tests

Unit tests không yêu cầu kết nối cơ sở dữ liệu thật (chạy hoàn toàn qua mock độc lập):

```bash
cd backend
npm test
```
*Kỳ vọng:* 197/197 unit tests đạt (PASS) trên cả 4 phân hệ Tickets, Feedback, Invoices và Auth.

---

## 8. Chạy Integration Tests (Least-Privilege Runner)

Integration tests **bắt buộc** phải chạy bằng tài khoản `test_app_user`. Safety Guard sẽ từ chối nếu phát hiện tài khoản superuser hoặc sai database:

### Trên Linux / macOS (Bash):
```bash
cd backend
export DATABASE_URL="postgresql://test_app_user:<YOUR_SECURE_TEST_PASSWORD>@127.0.0.1:5432/apartment_test?schema=public"
npm run test:integration
```

### Trên Windows (PowerShell):
```powershell
cd backend
$env:DATABASE_URL = "postgresql://test_app_user:<YOUR_SECURE_TEST_PASSWORD>@127.0.0.1:5432/apartment_test?schema=public"
npm run test:integration
```

*Kỳ vọng:* 178/178 assertions đạt (PASS) qua 4 phân hệ (Auth, Invoices, Tickets, Feedback) và Cleanup tự động xóa toàn bộ fixture.

---

## 9. Dọn dẹp Tài nguyên An toàn (Safe Cleanup)

Phân biệt rõ giữa việc dừng container tạm thời và xóa sạch volume dữ liệu:

### A. Dừng container tạm thời (Giữ nguyên dữ liệu cho lần test sau):
```bash
docker compose -f docker-compose.test.yml -p apartment-test stop
```
*Khi muốn chạy lại:* `docker compose -f docker-compose.test.yml -p apartment-test start`.

### B. Hủy hoàn toàn container và volume kiểm thử (Clean Slate):
> [!CAUTION]
> Lệnh này chỉ chạy khi bạn muốn xóa sạch môi trường test để bắt đầu lại từ đầu. Không chạy trên môi trường có dữ liệu phát triển chưa sao lưu.

```bash
docker compose -f docker-compose.test.yml -p apartment-test down -v
```

---

## 10. Xử lý Lỗi Thường Gặp (Troubleshooting)

| Lỗi gặp phải | Nguyên nhân khả dĩ | Cách khắc phục |
| :--- | :--- | :--- |
| `[SAFETY GUARD FAILED]: DATABASE_URL chưa được thiết lập` | Chưa export biến `DATABASE_URL` trong terminal hiện tại. | Chạy lệnh export `DATABASE_URL` trước khi thực hiện `npm run test:integration`. |
| `[SAFETY GUARD FAILED]: Username hợp lệ (test_app_user): false` | Đang dùng tài khoản `test_user` hoặc `postgres` để chạy integration test. | Đổi username trong `DATABASE_URL` thành `test_app_user`. Safety Guard cố tình chặn superuser để đảm bảo Least Privilege. |
| `[SAFETY GUARD FAILED]: Hostname / Port / Database không hợp lệ` | Chuỗi kết nối trỏ sai cổng (không phải 5432) hoặc sai database (không phải `/apartment_test`). Safety Guard hiện tại yêu cầu cổng 5432. | Kiểm tra lại URL, đảm bảo đúng định dạng: `postgresql://test_app_user:<PASS>@127.0.0.1:5432/apartment_test?schema=public`. Nếu cổng 5432 bị chiếm, cần giải phóng xung đột cổng trên máy trước khi chạy test. |
| `ERROR: permission denied for table ...` | `prisma db push` được chạy bằng một role khác không phải `test_user`, hoặc init script chưa chạy xong trước khi push schema. | Khởi tạo lại container sạch và đảm bảo bước `prisma db push` sử dụng tài khoản `test_user` để default privileges có hiệu lực cho `test_app_user`. |
| `pg_isready` báo container chưa sẵn sàng | Docker daemon đang quá tải hoặc container đang trong quá trình init ban đầu. | Đợi 5–10 giây và kiểm tra log: `docker compose -f docker-compose.test.yml -p apartment-test logs`. |
| `[SAFETY CLEANUP FAILURE]` | Có lỗi ràng buộc khóa ngoại khi xóa fixture sau test. | Kiểm tra log chi tiết mã lỗi Prisma trong console; kiểm tra xem có bản ghi con nào chưa được đăng ký qua `ResourceTracker`. |
