# BẢNG PHÂN CÔNG CÔNG VIỆC DỰ ÁN
**Dự án:** Hệ thống Quản lý và Vận hành Chung cư

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN (VỊ TRÍ FILE CỦA TỪNG THÀNH VIÊN)

> **LƯU Ý:** Toàn bộ khung dự án và các liên kết đã được tạo sẵn. Mọi người chỉ tạo/sửa code **bên trong đúng các file/thư mục được phân công cho mình** dưới đây, tuyệt đối không sửa các file cấu hình chung của người khác để tránh xung đột mã nguồn khi gộp code (Merge Conflict).

```text
He-thong-quan-ly-va-van-hanh-chung-cu/
│
├── backend/                       # MÁY CHỦ & DỮ LIỆU (Đặng Hoàng & Hiếu)
│   ├── src/
│   │   ├── app.module.ts          # ĐÃ LINK SẴN TẤT CẢ MODULES (Leader quản lý)
│   │   ├── main.ts                # Server entry point (Port 5000)
│   │   ├── common/
│   │   │   ├── constants/api-endpoints.ts # Danh mục URL API chuẩn toàn hệ thống
│   │   │   └── types/api-response.ts      # Cấu trúc phản hồi chuẩn { success, data, message }
│   │   ├── database/
│   │   │   └── schema.prisma      # [Hiếu] Thiết kế bảng CSDL toàn hệ thống
│   │   └── modules/
│   │       ├── auth/              # [Đặng Hoàng] Đăng nhập, đổi mật khẩu, cấp JWT
│   │       ├── users/             # [Đặng Hoàng] Admin quản lý tài khoản BQL & Thợ, duyệt cư dân
│   │       ├── notifications/     # [Đặng Hoàng] Thông báo đẩy tức thời & Socket.IO
│   │       ├── tickets/           # [Hiếu] Luồng Báo hỏng, lọc trùng, gán thợ, kê khai vật tư, chấm sao
│   │       ├── invoices/          # [Hiếu] Biểu phí định kỳ hàng tháng & mã VietQR
│   │       └── feedback/          # [Hiếu] Hòm thư góp ý & phản hồi nội quy
│   ├── package.json
│   └── tsconfig.json
│
├── web/                           # CỔNG QUẢN LÝ WEB (Đặng Hoàng, Đức, Oanh)
│   ├── src/
│   │   ├── api/
│   │   │   ├── endpoints.ts       # Danh mục API dùng chung
│   │   │   └── axiosClient.ts     # Axios client cấu hình sẵn JWT Token
│   │   ├── constants/menu.ts      # Cấu hình danh sách Menu link sẵn
│   │   ├── components/Layout/     # [Đặng Hoàng] Khung Web chung: Sidebar, Header, AppLayout
│   │   ├── routes/
│   │   │   └── AppRoutes.tsx      # ĐÃ LINK SẴN TẤT CẢ TRANG VÀO ROUTER (Leader quản lý)
│   │   └── pages/
│   │       ├── LoginPage.tsx              # [Đặng Hoàng] Đăng nhập Web
│   │       ├── AdminAccountsPage.tsx      # [Đặng Hoàng] Admin quản lý tài khoản BQL & Thợ
│   │       ├── ResidentsPage.tsx          # [Đức] Quản lý căn hộ & duyệt cư dân mới
│   │       ├── TicketDispatchPage.tsx     # [Đức] Bảng chia việc sự cố & lọc trùng
│   │       ├── BillingManagerPage.tsx     # [Đức] Quản lý hóa đơn phí định kỳ
│   │       ├── TechnicianTasksPage.tsx    # [Oanh] Không gian làm việc của Thợ kỹ thuật
│   │       ├── AnnouncementsPage.tsx      # [Oanh] Soạn & gửi thông báo tòa nhà
│   │       └── FeedbackManagementPage.tsx # [Oanh] Tiếp nhận & trả lời hòm thư góp ý
│   ├── package.json
│   └── tsconfig.json
│
└── mobile/                        # APP ĐIỆN THOẠI CƯ DÂN (Nguyệt & Thuần)
    ├── src/
    │   ├── api/
    │   │   ├── endpoints.ts       # Danh mục API dùng chung
    │   │   └── apiClient.ts       # API client gọi server
    │   ├── navigation/
    │   │   └── AppNavigator.tsx   # ĐÃ LINK SẴN TẤT CẢ MÀN HÌNH VÀO TABS (Leader quản lý)
    │   └── screens/
    │       ├── AuthScreen.tsx            # [Nguyệt] Đăng nhập & đổi mật khẩu
    │       ├── ProfileScreen.tsx         # [Nguyệt] Thông tin phòng & hồ sơ cá nhân
    │       ├── NotificationScreen.tsx    # [Nguyệt] Bảng tin & nhận thông báo đẩy
    │       ├── InvoiceScreen.tsx         # [Nguyệt] Tra cứu phí định kỳ & mã VietQR
    │       ├── CreateTicketScreen.tsx    # [Thuần] Gửi phiếu báo hỏng (chọn lỗi, chụp ảnh/video)
    │       ├── TicketTimelineScreen.tsx  # [Thuần] Xem tiến độ sửa chữa (Timeline)
    │       ├── RatingScreen.tsx          # [Thuần] Nghiệm thu & chấm điểm 1-5 sao
    │       └── FeedbackScreen.tsx        # [Thuần] Gửi góp ý nội quy & xem phản hồi
    ├── package.json
    └── tsconfig.json
```

---

## I. DANH SÁCH CHỨC NĂNG

### 1. App trên Điện thoại (Dành cho Cư dân):
* Đăng nhập, đổi mật khẩu, xem thông tin phòng của mình.
* Gửi phiếu báo hỏng: Chọn loại sự cố (điện, nước, internet...), viết mô tả, chụp ảnh hoặc quay video chỗ hỏng gửi đi.
* Xem tiến độ: Xem phiếu đang ở bước nào (Mới gửi -> Đã gán thợ -> Đang sửa -> Đã xong).
* Nghiệm thu & Đánh giá: Bấm xác nhận nhà đã sửa xong và chấm từ 1 đến 5 sao.
* Xem thông báo & Nhận thông báo đẩy tức thời: Đọc các tin tức chung từ Ban quản lý; nhận thông báo đẩy tức thời (Push Notification) khi có cập nhật tiến độ sửa chữa, thông báo khẩn hoặc phát sinh hóa đơn mới.
* Tra cứu phí dịch vụ & Hóa đơn định kỳ: Xem chi tiết các khoản phí sinh hoạt hàng tháng (phí quản lý, gửi xe, điện nước...), kiểm tra trạng thái thanh toán (Đã nộp / Chưa nộp) và quét mã VietQR để chuyển khoản.
* Hòm thư góp ý: Gửi phản ánh, kiến nghị về nội quy, an ninh, vệ sinh hoặc đóng góp ý kiến trực tiếp tới Ban quản lý và theo dõi câu trả lời phản hồi.

### 2. Trang Web Admin & Ban Quản Lý (Dành cho Admin & Ban quản lý):
* Admin (Sếp lớn): Đăng nhập, tạo tài khoản và phân quyền cho nhân viên Ban quản lý, tạo tài khoản cho Thợ kỹ thuật.
* Quản lý Căn hộ & Cư dân: Duyệt tài khoản cho cư dân mới đăng ký, xem danh sách ai ở phòng nào.
* Bảng chia việc: Tiếp nhận phiếu báo hỏng từ cư dân, kiểm tra xem có bị trùng phiếu không, bấm chọn gán việc cho Thợ kỹ thuật đi sửa.
* Gửi thông báo & Phát thông báo đẩy tức thời: Soạn tin tức gửi đến toàn bộ cư dân hoặc gửi riêng từng căn hộ; phát thông báo đẩy thời gian thực.
* Quản lý Hóa đơn & Phí dịch vụ: Lập và quản lý danh sách biểu phí định kỳ hàng tháng, theo dõi tình trạng nộp phí của từng căn hộ, xuất mã QR thanh toán.
* Tiếp nhận & Xử lý Hòm thư góp ý: Xem danh sách ý kiến/kiến nghị của cư dân về các vấn đề nội quy, hành chính; soạn phản hồi gửi lại cho cư dân.

### 3. Trang Web dành cho Thợ Kỹ Thuật (Dành cho Thợ):
* Đăng nhập tài khoản Thợ.
* Nhận thông báo đẩy tức thời & Xem danh sách việc: Nhận thông báo ngay lập tức khi Ban quản lý gán việc mới; xem chi tiết các phiếu báo hỏng được giao.
* Cập nhật việc: Bấm 'Nhận việc', chuyển trạng thái sang 'Đang sửa', khi xong thì bấm 'Hoàn thành'.
* Kê khai vật tư: Điền danh sách đồ đạc, linh kiện đã thay thế và chụp ảnh sau khi sửa xong.

---

## II. PHÂN CÔNG CÔNG VIỆC RÕ RÀNG CHO 7 NGƯỜI (KHỚP 1-1 VỚI CẤU TRÚC FILE)

### 🔹 ĐỘI 1: LẬP TRÌNH MÁY CHỦ & DỮ LIỆU (Backend - 2 người)
*(Quy tắc chống đè code: Mỗi người phụ trách các thư mục Module API riêng biệt, không sửa chéo file của nhau)*

* **• Đặng Hoàng (Trưởng nhóm - Phụ trách Khung Server, Xác thực & Thông báo thời gian thực):**
  * Khởi tạo bộ khung dự án máy chủ (`backend/src/main.ts`, cấu hình môi trường, bảo mật).
  * Lập trình **Module Xác thực & Phân quyền** [`backend/src/modules/auth/`]: Đăng nhập, đổi mật khẩu, cấp JWT cho cả 4 nhóm tài khoản (Admin, BQL, Thợ, Cư dân).
  * Lập trình **Module Quản trị & Cư dân** [`backend/src/modules/users/`]: Viết các API cho Admin (tạo tài khoản, cấp quyền BQL và Thợ kỹ thuật); viết các API Quản lý Cư dân (duyệt cư dân mới, xem danh sách phòng).
  * Lập trình **Module Thông báo đẩy tức thời** [`backend/src/modules/notifications/`]: Xây dựng hệ thống Push Notification / Socket.IO real-time phục vụ phát thông báo toàn tòa nhà và đẩy thông báo cập nhật tiến độ phiếu sự cố.
  * Phụ trách kiểm tra và duyệt code (Pull Request) cho cả nhóm trên GitHub.

* **• Hiếu (Phụ trách Cơ sở dữ liệu, Luồng Sự cố, Hóa đơn & Góp ý):**
  * Thiết kế **Bảng lưu trữ dữ liệu (Schema DB)** [`backend/src/database/schema.prisma`]: Thiết kế schema hoàn chỉnh lưu phòng, người dùng, phiếu báo hỏng, vật tư, hóa đơn và góp ý.
  * Lập trình **Module Luồng Báo hỏng sự cố** [`backend/src/modules/tickets/`]: API tạo phiếu, thuật toán lọc phiếu bị gửi trùng, đổi trạng thái phiếu, gán việc cho thợ, kê khai vật tư thay thế, và lưu chấm điểm đánh giá (1-5 sao).
  * Lập trình **Module Hóa đơn & Phí dịch vụ** [`backend/src/modules/invoices/`]: API lập biểu phí định kỳ hàng tháng, xem danh sách hóa đơn theo căn hộ, cập nhật trạng thái Đã nộp/Chưa nộp, tạo mã VietQR thanh toán.
  * Lập trình **Module Hòm thư góp ý** [`backend/src/modules/feedback/`]: API tiếp nhận phản ánh nội quy từ cư dân và API lưu phản hồi từ Ban quản lý.

---

### 🔹 ĐỘI 2: LẬP TRÌNH APP ĐIỆN THOẠI CƯ DÂN (Mobile - 2 người)
*(Quy tắc chống đè code: Chia thành 2 cụm màn hình độc lập, mỗi người tự quản lý các file màn hình riêng)*

* **• Nguyệt (Phụ trách Cụm Màn hình Tài khoản, Thông báo & Hóa đơn phí):**
  * Thiết kế UI chung và bộ điều hướng (Navigation) của App Cư dân [`mobile/src/navigation/AppNavigator.tsx`].
  * Lập trình **Màn hình Đăng nhập & Đổi mật khẩu** [`mobile/src/screens/AuthScreen.tsx`].
  * Lập trình **Màn hình Trang chủ & Thông tin phòng của mình** [`mobile/src/screens/ProfileScreen.tsx`].
  * Lập trình **Màn hình Xem thông báo & Nhận thông báo đẩy tức thời** [`mobile/src/screens/NotificationScreen.tsx`]: Hiển thị danh sách tin tức BQL gửi và bắt sự kiện pop-up thông báo đẩy.
  * Lập trình **Màn hình Tra cứu phí dịch vụ & Hóa đơn định kỳ** [`mobile/src/screens/InvoiceScreen.tsx`]: Danh sách hóa đơn hàng tháng, chi tiết từng khoản phí, trạng thái Đã nộp/Chưa nộp và hiển thị mã VietQR chuyển khoản.

* **• Thuần (Phụ trách Cụm Màn hình Báo hỏng sự cố & Hòm thư góp ý):**
  * Lập trình **Màn hình Gửi phiếu báo hỏng** [`mobile/src/screens/CreateTicketScreen.tsx`]: Chọn phân loại điện/nước/internet, viết mô tả, chụp ảnh hoặc quay video đính kèm gửi đi.
  * Lập trình **Màn hình Xem tiến độ sửa chữa** [`mobile/src/screens/TicketTimelineScreen.tsx`]: Dòng thời gian trực quan (Mới gửi -> Đã gán thợ -> Đang sửa -> Đã xong).
  * Lập trình **Màn hình Nghiệm thu & Đánh giá** [`mobile/src/screens/RatingScreen.tsx`]: Nút xác nhận sửa xong và chấm sao từ 1 đến 5 sao.
  * Lập trình **Màn hình Hòm thư góp ý** [`mobile/src/screens/FeedbackScreen.tsx`]: Soạn gửi phản ánh, kiến nghị về nội quy, an ninh, vệ sinh tới BQL và xem câu trả lời phản hồi.

---

### 🔹 ĐỘI 3: LẬP TRÌNH TRANG WEB QUẢN LÝ (Web - 3 người)
*(Quy tắc chống đè code: Chia theo phân hệ vai trò và tính năng rõ ràng, không làm chung file giao diện)*

* **• Đặng Hoàng (Phụ trách Khung Web chung & Phân hệ Admin):**
  * Dựng bộ khung giao diện trang Web dùng chung [`web/src/components/Layout/`, `web/src/routes/AppRoutes.tsx`]: Thanh menu điều hướng trái, thanh tiêu đề trên, bộ lọc phân quyền.
  * Lập trình **Trang Đăng nhập Web** dùng chung cho các vai trò [`web/src/pages/LoginPage.tsx`].
  * Lập trình **Trang Quản trị của Admin** [`web/src/pages/AdminAccountsPage.tsx`]: Xem danh sách, tạo mới tài khoản và phân quyền cho nhân viên Ban quản lý, tạo tài khoản cho Thợ kỹ thuật.

* **• Đức (Phụ trách Phân hệ Quản lý Cư dân, Điều phối sự cố & Hóa đơn phí):**
  * Lập trình **Trang Quản lý Căn hộ & Cư dân** [`web/src/pages/ResidentsPage.tsx`]: Danh sách cư dân theo phòng, nút duyệt tài khoản cư dân mới.
  * Lập trình **Trang Bảng chia việc - Điều phối sự cố** [`web/src/pages/TicketDispatchPage.tsx`]: Tiếp nhận danh sách phiếu báo hỏng, hiển thị cảnh báo phiếu trùng, popup chọn gán việc cho Thợ kỹ thuật.
  * Lập trình **Trang Quản lý Hóa đơn & Phí dịch vụ** [`web/src/pages/BillingManagerPage.tsx`]: Lập biểu phí định kỳ hàng tháng, theo dõi tình trạng thanh toán của từng căn hộ, xuất mã QR chuyển khoản.

* **• Oanh (Phụ trách Phân hệ Thợ kỹ thuật, Thông báo & Hòm thư góp ý):**
  * Lập trình **Trang dành riêng cho Thợ kỹ thuật** [`web/src/pages/TechnicianTasksPage.tsx`]: Giao diện thợ xem danh sách phiếu được giao, nhận thông báo đẩy tức thời khi có việc, các nút thao tác 'Nhận việc' -> 'Đang sửa' -> 'Hoàn thành', form kê khai vật tư thay thế và tải ảnh sau khi sửa xong.
  * Lập trình **Trang Soạn & Gửi thông báo** [`web/src/pages/AnnouncementsPage.tsx`]: Soạn nội dung gửi toàn chung cư hoặc từng căn hộ, kích hoạt gửi thông báo đẩy.
  * Lập trình **Trang Tiếp nhận & Xử lý Hòm thư góp ý** [`web/src/pages/FeedbackManagementPage.tsx`]: Xem danh sách góp ý/kiến nghị của cư dân và soạn nội dung phản hồi gửi lại.
