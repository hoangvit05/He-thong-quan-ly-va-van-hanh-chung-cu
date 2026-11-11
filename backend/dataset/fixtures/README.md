# FIXTURES VS SYNTHETIC DATASET
## Hướng dẫn Phân biệt Dữ liệu Cố định (Fixtures) và Dữ liệu Giả lập Quy mô (Synthetic Dataset)

Thư mục `backend/dataset/fixtures/` được thiết kế để lưu trữ các bộ dữ liệu mẫu tĩnh (Static / Golden Fixtures) phục vụ các kịch bản kiểm thử biên chuyên biệt.

---

## 1. PHÂN BIỆT KHÁI NIỆM

| Tiêu chí | Fixtures (`fixtures/`) | Synthetic Dataset (`seed/`) |
| :--- | :--- | :--- |
| **Bản chất** | Tĩnh, cấu hình thủ công hoặc snapshot cố định. | Sinh tự động theo thuật toán từ generator có PRNG seed cố định. |
| **Quy mô** | Rất nhỏ (1–5 bản ghi cho mỗi tình huống cần test). | Quy mô đầy đủ theo đặc tả (100 phòng, 108–158 user, 150–200 ticket...). |
| **Mục đích** | Phục vụ kiểm thử đơn vị (Unit tests), kiểm thử hồi quy (Regression) và xác minh các tình huống biên (Edge cases). | Phục vụ chạy ứng dụng, staging, demo chức năng, kiểm thử tải và luồng E2E toàn hệ thống. |
| **Tái lập** | Bất biến (Hardcoded). | Đơn định theo seed (`RANDOM_SEED: 20261111`). |

---

## 2. CÁC TÌNH HUỐNG SỬ DỤNG FIXTURES
1. **Kiểm thử đăng nhập & RBAC**: Các tài khoản mẫu cố định với username và role xác định để CI test không phụ thuộc vào lượt sinh ngẫu nhiên.
2. **Kiểm thử thuật toán lọc trùng 24 giờ**: Cặp ticket cố định gửi cách nhau 15 phút cùng phòng và category để khẳng định cờ `isDuplicate = true`.
3. **Kiểm thử dòng tiền & khóa dòng**: Hóa đơn có nộp từng phần và các lần thanh toán lẻ chính xác từng đồng để kiểm tra lỗi làm tròn của `Prisma.Decimal`.

