# BẢNG PHÂN CÔNG CÔNG VIỆC VÀ TÀI LIỆU KỸ THUẬT DỰ ÁN
**Dự án:** Hệ thống Quản lý và Vận hành Chung cư (Apartment Management and Operations System)
**Quy mô:** 7 Thành viên | 3 Ứng dụng (Backend API, Web Portal, Mobile Resident App) | 7 Bảng CSDL PostgreSQL
**Trạng thái kiểm thử (tại thời điểm kiểm tra):** 197/197 unit test cases đạt (PASS) | 178/178 integration test assertions đạt (PASS) | CI Pipeline Active (Tất cả bộ test liên quan bắt buộc phải duy trì trạng thái PASS)

---

## 📌 BẢNG ĐIỀU HÀNH TRẠNG THÁI HỆ THỐNG (CURRENT SYSTEM STATUS)

| Phân hệ / Thành phần | Trạng thái kỹ thuật thực tế | Bằng chứng kiểm tra trong mã nguồn | Phụ trách chính |
| :--- | :---: | :--- | :--- |
| **Cơ sở dữ liệu (PostgreSQL 16)** | **[ĐÃ HOÀN THIỆN]** | 7 Models, 5 Enums, Constraints, Indexes tại [`backend/src/database/schema.prisma#L58`](backend/src/database/schema.prisma#L58) | **Hiếu** |
| **Backend Core (Tickets, Invoices, Feedback)** | **[ĐÃ HOÀN THIỆN]** | 149 Unit tests PASS (tại thời điểm kiểm tra), ACID Transactions, Row-Locking `SELECT FOR UPDATE`, VietQR NAPAS | **Hiếu** |
| **Backend Auth Module** | **[ĐÃ HOÀN THIỆN]** | 48 Unit tests PASS (tại thời điểm kiểm tra), Bcrypt Hashing, JWT HS256, Anti-Brute-Force Throttle, `/me` | **Việt Hoàng** & **Hiếu** |
| **Backend Stubs (Users & Notifications)** | **[KHUNG CHỜ / ĐANG PHÁT TRIỂN]** | Đã tạo scaffold controller; `[CẦN XÁC NHẬN]` bổ sung auth middleware & kết nối DB thật | **Việt Hoàng** |
| **Hạ tầng CI/CD & Testing Sandbox** | **[ĐÃ HOÀN THIỆN]** | GitHub Actions Workflow [`ci.yml`](.github/workflows/ci.yml), Least-Privilege PL/pgSQL Assertions, Safe Teardown | **Hiếu** |
| **Web Portal Admin & BQL (React + Vite)** | **[KHUNG SCAFFOLD / ĐANG PHÁT TRIỂN]** | 8 Pages & Layout đã scaffold; thiếu entry point `index.html` (bắt buộc với Vite) và cấu hình `vite.config.ts` (React plugin); chưa cài dependencies và chưa kiểm chứng build | **Đăng Hoàng**, **Đức**, **Oanh** |
| **Mobile App Cư dân (React Native)** | **[KHUNG SCAFFOLD / ĐANG PHÁT TRIỂN]** | 8 Screens & Navigation đã scaffold; `[CẦN BỔ SUNG]` gói `expo`, Token Interceptor; chưa cài dependencies và chưa kiểm chứng build | **Nguyệt**, **Thuần** |

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN & VỊ TRÍ FILE TỪNG THÀNH VIÊN

> [!IMPORTANT]
> **QUY TẮC CỘNG TÁC GIT & TRÁNH XUNG ĐỘT (MERGE CONFLICT):**
> * Mọi người **chỉ tạo và sửa code bên trong đúng các file/thư mục được phân công trực tiếp** cho mình.
> * Các tệp dùng chung (Shared Files) chỉ được chỉnh sửa theo đúng quy định tại mục [III. MA TRẬN QUẢN LÝ TỆP DÙNG CHUNG](#iii-ma-trận-quản-lý-tệp-tin-dùng-chung-shared-files-governance).

```text
He-thong-quan-ly-va-van-hanh-chung-cu/
│
├── .github/workflows/ci.yml           # [Hiếu] GitHub Actions CI Pipeline (Node 24, Test Container, Assertions)
├── docker-compose.test.yml            # [Hiếu] Isolated PostgreSQL 16 Test Container
├── docker/test-init/                  # [Hiếu] Script khởi tạo Least-Privilege Role (test_app_user)
├── .env.example                       # Mẫu biến môi trường an toàn (không chứa secret)
├── README.md                          # [Tất cả] Tài liệu tổng quan & phân công nhiệm vụ
│
├── backend/                           # MÁY CHỦ & DỮ LIỆU (Việt Hoàng & Hiếu)
│   ├── src/
│   │   ├── main.ts                    # [Việt Hoàng] Server entry point (Express, Port 5000, JWT Secret Validator)
│   │   ├── app.module.ts              # [Việt Hoàng] Root router tập trung toàn bộ API backend
│   │   ├── common/
│   │   │   ├── constants/api-endpoints.ts # [Việt Hoàng] Danh mục URL API chuẩn toàn hệ thống
│   │   │   ├── middleware/auth.ts     # [Hiếu & Việt Hoàng] extractUser, requireAuth, requireRoles
│   │   │   ├── types/api-response.ts  # [Hiếu] Chuẩn phản hồi { success, data, message, pagination }
│   │   │   ├── types/auth.ts          # [Hiếu] Mở rộng Express.Request (req.user)
│   │   │   └── utils/
│   │   │       ├── security.ts        # [Hiếu] hashPassword, comparePassword (Bcrypt 10 rounds)
│   │   │       ├── validation.ts      # [Hiếu] isValidMediaUrl, sanitizeMaterials (Anti-Base64)
│   │   │       └── vietqr.ts          # [Hiếu] generateVietQRUrl (Chuẩn NAPAS 24/7 động)
│   │   ├── database/
│   │   │   ├── schema.prisma          # [Hiếu] Thiết kế 7 models, 5 enums, indexes, constraints
│   │   │   └── prisma.ts              # [Hiếu] Singleton PrismaClient instance
│   │   ├── modules/
│   │   │   ├── auth/                  # [Việt Hoàng & Hiếu] Đăng nhập, đổi mật khẩu, cấp JWT, xem hồ sơ /me
│   │   │   ├── users/                 # [Việt Hoàng] Admin quản lý tài khoản BQL & Thợ, duyệt cư dân mới
│   │   │   ├── notifications/         # [Việt Hoàng] Thông báo tòa nhà & Socket.IO realtime
│   │   │   ├── tickets/               # [Hiếu] Báo hỏng, lọc trùng 24h, gán thợ, kê khai vật tư, chấm sao
│   │   │   ├── invoices/              # [Hiếu] Lập biểu phí, snapshot totalAmount, VietQR, chống Overpayment
│   │   │   └── feedback/              # [Hiếu] Hòm thư góp ý, Anti-Enumeration (404), phản hồi BQL
│   │   └── test/
│   │       ├── integration-setup.ts   # [Hiếu] Safety Guard fail-closed & ResourceTracker dọn dẹp fixture
│   │       └── run-all-integration.ts # [Hiếu] Runner chạy 178 integration assertions trên DB thật
│   ├── package.json
│   ├── README.md                      # [Hiếu] Hướng dẫn Clean-room & chạy bộ kiểm thử Backend
│   └── tsconfig.json
│
├── web/                               # CỔNG QUẢN LÝ WEB (Đăng Hoàng, Đức, Oanh)
│   ├── src/
│   │   ├── main.tsx                   # [Đăng Hoàng] React 18 DOM mount (#root)
│   │   ├── App.tsx                    # [Đăng Hoàng] BrowserRouter wrapper
│   │   ├── api/
│   │   │   ├── endpoints.ts           # [Đăng Hoàng] Danh mục API dùng chung
│   │   │   └── axiosClient.ts         # [Đăng Hoàng] Axios client cấu hình JWT Token Interceptor
│   │   ├── constants/menu.ts          # [Đăng Hoàng] Cấu hình 7 menu items theo phân quyền vai trò
│   │   ├── components/Layout/         # [Đăng Hoàng] Layout khung: AppLayout, Header, Sidebar
│   │   ├── routes/
│   │   │   └── AppRoutes.tsx          # [Đăng Hoàng] Hệ thống định tuyến Web
│   │   └── pages/
│   │       ├── LoginPage.tsx              # [Đăng Hoàng] Màn hình đăng nhập Web Admin/BQL/Thợ
│   │       ├── AdminAccountsPage.tsx      # [Đăng Hoàng] Admin tạo tài khoản BQL & Thợ kỹ thuật
│   │       ├── ResidentsPage.tsx          # [Đức] Quản lý căn hộ, xem cư dân & duyệt tài khoản mới
│   │       ├── TicketDispatchPage.tsx     # [Đức] Bảng điều phối sự cố, lọc trùng & gán thợ
│   │       ├── BillingManagerPage.tsx     # [Đức] Lập biểu phí định kỳ & xuất mã VietQR
│   │       ├── TechnicianTasksPage.tsx    # [Oanh] Không gian làm việc của Thợ (nhận việc/vật tư/ảnh)
│   │       ├── AnnouncementsPage.tsx      # [Oanh] Soạn & gửi thông báo toàn tòa nhà / từng căn hộ
│   │       └── FeedbackManagementPage.tsx # [Oanh] Tiếp nhận & soạn phản hồi hòm thư góp ý
│   ├── package.json
│   └── tsconfig.json
│
└── mobile/                            # APP ĐIỆN THOẠI CƯ DÂN (Nguyệt & Thuần)
    ├── App.tsx                        # [Nguyệt] Entry point bao bọc bởi NavigationContainer
    ├── src/
    │   ├── api/
    │   │   ├── endpoints.ts           # [Nguyệt] Danh mục API dùng chung
    │   │   └── apiClient.ts           # [Nguyệt] Axios client gọi server (cần gắn token interceptor)
    │   ├── navigation/
    │   │   └── AppNavigator.tsx       # [Nguyệt] Điều hướng TabNavigator & AuthStack
    │   └── screens/
    │       ├── AuthScreen.tsx            # [Nguyệt] Đăng nhập & đổi mật khẩu cư dân
    │       ├── ProfileScreen.tsx         # [Nguyệt] Thông tin căn hộ & hồ sơ cá nhân
    │       ├── NotificationScreen.tsx    # [Nguyệt] Bảng tin & nhận thông báo đẩy
    │       ├── InvoiceScreen.tsx         # [Nguyệt] Tra cứu phí dịch vụ & hiển thị mã VietQR
    │       ├── CreateTicketScreen.tsx    # [Thuần] Gửi phiếu báo hỏng (chọn lỗi, ảnh/video link)
    │       ├── TicketTimelineScreen.tsx  # [Thuần] Xem tiến độ sửa chữa dòng thời gian (Timeline)
    │       ├── RatingScreen.tsx          # [Thuần] Nghiệm thu hoàn thành & chấm điểm 1-5 sao
    │       └── FeedbackScreen.tsx        # [Thuần] Gửi ý kiến nội quy & theo dõi phản hồi BQL
    ├── package.json
    └── tsconfig.json
```

---

## I. MÔ TẢ NGHIỆP VỤ HỆ THỐNG & KHOẢNG TRỐNG CẦN XÁC NHẬN

### 1. Phân hệ Cơ sở Dữ liệu (Prisma Schema — Hiếu phụ trách)
Cơ sở dữ liệu gồm đúng **7 bảng (Models)** và **5 kiểu liệt kê (Enums)**:
* **Models:** [`Room`](backend/src/database/schema.prisma#L58), [`User`](backend/src/database/schema.prisma#L76), [`Ticket`](backend/src/database/schema.prisma#L103), [`Invoice`](backend/src/database/schema.prisma#L138), [`Payment`](backend/src/database/schema.prisma#L164), [`Feedback`](backend/src/database/schema.prisma#L181), [`Notification`](backend/src/database/schema.prisma#L202).
* **Enums:** [`Role`](backend/src/database/schema.prisma#L18) (ADMIN, BQL, TECHNICIAN, RESIDENT), [`TicketStatus`](backend/src/database/schema.prisma#L26) (PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CLOSED), [`InvoiceStatus`](backend/src/database/schema.prisma#L35) (UNPAID, PARTIALLY_PAID, PAID), [`RoomStatus`](backend/src/database/schema.prisma#L42) (VACANT, OCCUPIED, MAINTENANCE), [`PaymentMethod`](backend/src/database/schema.prisma#L49) (VIETQR, BANK_TRANSFER, CASH).
* **Ràng buộc toàn vẹn cốt lõi:**
  * `@@unique([roomId, month])` trên bảng `Invoice`: Chống lập trùng 2 hóa đơn cho cùng 1 phòng trong 1 tháng.
  * `@@unique([roomNumber])` trên `Room`, `@@unique([username])` và `@@unique([email])` trên `User`.
  * `@@index([role, isApproved])`, `@@index([status, createdAt])` phục vụ lọc phân quyền và sắp xếp.

### 2. Nghiệp vụ Quản lý Căn hộ & Cư dân (Khoảng trống Backend cần xác nhận)
* **Thực tế Frontend (Đức phụ trách):** [`web/src/pages/ResidentsPage.tsx`](web/src/pages/ResidentsPage.tsx) cần hiển thị danh mục phòng (tầng, diện tích, trạng thái), xem danh sách cư dân thuộc từng phòng, và bấm duyệt tài khoản (`isApproved = true`).
* **Khoảng trống Backend:** Hiện tại Backend chưa có module `rooms` độc lập. Endpoint [`/api/apartments/residents`](backend/src/app.module.ts#L23) đang trỏ về `users.controller.ts` (stub).
* `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 01: Module Quản lý Căn hộ & CRUD Rooms]`:
  * **Người phụ trách Backend:** Đã chốt **Việt Hoàng** (Backend Lead) đảm nhiệm triển khai module `backend/src/modules/rooms/`.
  * **Phạm vi nghiệp vụ & Danh mục API:** Tiếp tục giữ trạng thái `[CẦN XÁC NHẬN]` đối với phạm vi chi tiết của các API CRUD phòng (`GET /api/rooms`, `POST /api/rooms`, `PUT /api/rooms/:id`) và cấu trúc dữ liệu trao đổi giữa Backend và Web Frontend (Đức). Logic duyệt cư dân giữ tại `users.controller.ts` (`PUT /api/users/:id/approve` hoặc `PUT /api/apartments/residents/:id/approve`).

### 3. Nghiệp vụ Báo hỏng Sự cố & Lọc trùng 24 Giờ (Hiếu, Thuần, Đức, Oanh)
* **Vòng đời State Machine:** `PENDING` $\rightarrow$ `ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED` $\rightarrow$ `CLOSED`.
* **Phân quyền thao tác nghiêm ngặt tại Backend:**
  * Cư dân chỉ tạo được phiếu cho căn hộ của mình (`effectiveResidentId` lấy từ JWT, không nhận từ client body).
  * Chỉ BQL/Admin mới có quyền gán việc cho thợ (`PUT /api/tickets/:id/assign`).
  * Chỉ thợ kỹ thuật được chỉ định mới có thể chuyển trạng thái sang `IN_PROGRESS`, `COMPLETED` và kê khai vật tư (`POST /api/tickets/:id/materials`).
  * **Nghiệm thu & Chấm sao đóng phiếu (`POST /api/tickets/:id/rate`):** Mã nguồn hiện tại kiểm tra quyền: Cư dân chỉ được nghiệm thu nếu chính là người tạo phiếu (`ticket.residentId === currentUser.id`); Thợ kỹ thuật bị chặn tuyệt đối (`403 Forbidden`). Mã nguồn hiện tại không chặn BQL/ADMIN chấm sao đóng phiếu. Về mặt nghiệp vụ: `[CẦN XÁC NHẬN NGHIỆP VỤ: Liệu Ban quản lý có quyền chấm điểm/nghiệm thu thay cư dân hay không, hay chỉ duy nhất Cư dân tạo phiếu mới có quyền nghiệm thu chất lượng sửa chữa?]`. **Việt Hoàng** phụ trách kiểm tra và giải thích tác động kỹ thuật đến Backend/RBAC; giữ nguyên trạng thái chờ nhóm thống nhất nghiệp vụ, không tự ý thay đổi quy tắc hay sửa code.
* **Tiêu chí lọc trùng 24 giờ:**
  * Hệ thống tự động so khớp trong cơ sở dữ liệu: Cùng `category` (Điện, Nước, Internet...), cùng `roomId` (hoặc cùng `residentId` nếu là khu vực chung), và đang có phiếu ở trạng thái chưa đóng (`PENDING`, `ASSIGNED`, `IN_PROGRESS`) được tạo trong vòng 24 giờ qua.
  * Nếu thỏa mãn, phiếu mới vẫn được tạo nhưng được gắn cờ `isDuplicate = true` để cảnh báo BQL trên giao diện [`TicketDispatchPage.tsx`](web/src/pages/TicketDispatchPage.tsx).

### 4. Nghiệp vụ Hóa đơn & Thanh toán VietQR (Hiếu, Nguyệt, Đức)
* **Snapshot tài chính:** Khi lập hóa đơn (`POST /api/invoices`), trường `totalAmount` được tính toán bằng `Decimal` chính xác 2 chữ số thập phân và chốt snapshot cố định.
* **Xử lý đồng thời (Concurrency Safety):** Khi ghi nhận thanh toán (`PUT /api/invoices/:id/status`), Backend thiết lập khóa dòng `SELECT "id" FROM "Invoice" WHERE "id" = :id FOR UPDATE` trong transaction để tuần tự hóa các yêu cầu nộp tiền, ngăn ngừa Race Condition.
* **Chống nộp thừa (Overpayment Protection):** Hệ thống từ chối nếu số tiền nộp lớn hơn số tiền còn lại (`totalAmount - paidAmount`).
* **LƯU Ý KỸ THUẬT QUAN TRỌNG VỀ VIETQR:**
  * API `GET /api/invoices/:id/vietqr` sinh URL ảnh động theo chuẩn NAPAS 24/7 để cư dân quét trên App Mobile hoặc Web.
  * **Quét mã VietQR KHÔNG TỰ ĐỘNG GHI NHẬN THANH TOÁN VÀ KHÔNG MẶC NHIÊN LÀ BẰNG CHỨNG ĐÃ THANH TOÁN.** Việc quét mã chỉ giúp tự động điền số tài khoản BQL, số tiền và cú pháp chuyển khoản vào ứng dụng ngân hàng của cư dân để thực hiện lệnh chuyển khoản.
  * Để hóa đơn chuyển sang trạng thái `PAID`, Ban quản lý bắt buộc phải đối soát sao kê tài khoản ngân hàng và bấm xác nhận nộp tiền trên giao diện [`BillingManagerPage.tsx`](web/src/pages/BillingManagerPage.tsx) (gọi `PUT /api/invoices/:id/status`).
  * `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 02: Đối soát Thanh toán & Webhook Ngân hàng]`:
  * Tiếp tục giữ trạng thái `[CẦN XÁC NHẬN]` đối với quyết định giai đoạn đầu sử dụng xác nhận thanh toán thủ công bởi BQL hay tích hợp Webhook biến động số dư (VietQR IPN / Casso / SePAY) để tự động gạch nợ thời gian thực. **Việt Hoàng** phụ trách đánh giá phương án kỹ thuật phía Backend; không tự quyết định phạm vi nghiệp vụ hoặc tích hợp thanh toán thay nhóm.
* `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 05: Mô hình Quản lý Biểu phí Định kỳ]`:
  * **Thực trạng CSDL:** Lược đồ [`schema.prisma`](backend/src/database/schema.prisma#L138) hiện chỉ có model `Invoice` lưu các trường phí trực tiếp (`managementFee`, `parkingFee`, `waterFee`, `otherFee`, `totalAmount`), chưa có model riêng lưu cấu hình đơn giá/biểu phí định kỳ.
  * **Phương án A:** Các khoản phí được nhập trực tiếp khi tạo hóa đơn (`POST /api/invoices` nhận các trường phí từ form giao diện `BillingManagerPage.tsx`). Phù hợp với schema hiện tại, triển khai nhanh.
  * **Phương án B:** Biểu phí được quản lý như một cấu hình/model riêng trong CSDL (lưu đơn giá quản lý/m2, đơn giá nước/m3, phí gửi xe máy/ô tô), từ đó Backend tự động tính toán theo diện tích phòng và sinh hóa đơn hàng loạt theo kỳ.
  * **Tác động:** Phương án B đòi hỏi cập nhật `schema.prisma`, chạy migration DB, cập nhật validator/controller và thiết kế thêm màn hình quản lý đơn giá trên Web.
  * **Trách nhiệm đánh giá:** Tiếp tục giữ trạng thái `[CẦN XÁC NHẬN]` đối với quyết định có cần mô hình quản lý biểu phí riêng hay tiếp tục lưu các khoản phí trực tiếp trên `Invoice`. **Việt Hoàng** là người chịu trách nhiệm chính phân tích phương án kỹ thuật và ảnh hưởng đến Backend/CSDL (Hiếu và Đức là người phối hợp); không tự chọn phương án thay nhóm.
  * **Người cùng thảo luận và chốt:** **Việt Hoàng (Leader Backend - chủ trì kỹ thuật)**, **Hiếu (DB Engineer - phối hợp CSDL)** & **Đức (Web Developer - phối hợp Frontend)**.

### 5. Cơ chế Thông báo Tòa nhà (Việt Hoàng, Nguyệt, Oanh)
Cần phân biệt rõ 3 tầng công nghệ:
1. **Thông báo CSDL (In-App Notification):** Bảng `Notification` lưu trữ tiêu đề, nội dung, `targetRoom` (null = toàn tòa nhà, hoặc số phòng cụ thể). Phục vụ xem danh sách và bảng tin. [Đã có model DB, cần hoàn thiện controller].
2. **Thông báo Thời gian thực (Socket.IO):** Gửi sự kiện realtime đến Web/App đang mở trên màn hình. [Đã có dependency `socket.io` trong `package.json`, cần nạp vào `main.ts`].
3. **Thông báo đẩy Di động (Mobile OS Push Notification):** Đẩy thông báo ra màn hình khóa khi app đóng.
* `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 03: Nhà cung cấp Mobile Push Notification]`:
  * Tiếp tục giữ trạng thái `[CẦN XÁC NHẬN]` đối với việc lựa chọn giữa Firebase Cloud Messaging (FCM), Expo Notifications hoặc phương án khác.
  * **Phân công trách nhiệm:** Phần Backend/API do **Việt Hoàng** phụ trách; phần Mobile chia đều giữa **Nguyệt** và **Thuần** khi có đầu việc cụ thể (không thay đổi các nhiệm vụ Mobile khác).
  * **Người cùng thảo luận và chốt:** **Việt Hoàng (Leader Backend)**, **Nguyệt** & **Thuần (Mobile Developers)**.

### 6. Dịch vụ Tải ảnh & Video (Media Upload Service)
* **Quy chuẩn Backend hiện tại:** Hàm [`isValidMediaUrl()`](backend/src/common/utils/validation.ts#L10) hiện tại kiểm tra: chuỗi có độ dài $\le$ 1000 ký tự, chặn tuyệt đối chuỗi Base64 (`data:` hoặc `;base64,`), và URL hợp lệ có giao thức `http:` hoặc `https:`. *Lưu ý kỹ thuật: Mã nguồn hiện tại chưa ép buộc riêng HTTPS và chưa có tính năng đối chiếu whitelist domain.*
* **Thực trạng:** Backend hiện chưa có endpoint upload file để lưu ảnh lên server hoặc cloud; frontend Web và Mobile hiện chưa tích hợp module tải tệp.
* **Cảnh báo bảo mật về Unsigned Preset:** **Unsigned Cloudinary Preset KHÔNG ĐƯỢC COI LÀ PHƯƠNG ÁN AN TOÀN MẶC ĐỊNH.** Việc để lộ công khai Cloud Name và Unsigned Upload Preset trên mã nguồn client (Web/Mobile) cho phép bất kỳ ai cũng có thể gửi request nặc danh tải tệp lên tài khoản Cloudinary của dự án, dẫn tới nguy cơ cạn kiệt dung lượng (Quota Exhaustion), phát tán tệp tin độc hại và làm ô nhiễm kho dữ liệu. Không khẳng định preset tự nó bảo đảm một giới hạn dung lượng cụ thể nếu chưa xác minh cấu hình thực tế của dịch vụ.
* **Đánh giá về Signed Uploads:** Cơ chế Signed Uploads (Backend xác thực người dùng và sinh chữ ký số / presigned URL tạm thời) giúp kiểm soát chặt chẽ quyền tải lên, nhưng **không tự động giải quyết mọi rủi ro bảo mật** (hệ thống vẫn cần kiểm soát loại MIME thật, dung lượng tệp, rà quét mã độc và rate-limiting).
* **Phân định 3 tầng kiểm soát an toàn:**
  1. *Kiểm tra phía Client (Web/Mobile):* Bắt lỗi mạng, timeout, kiểm tra dung lượng và định dạng trước khi gửi tệp; hiển thị thông báo lỗi rõ ràng cho người dùng.
  2. *Kiểm tra phía Backend:* Nâng cấp `isValidMediaUrl()` để bắt buộc riêng `https://` và đối chiếu whitelist tên miền dịch vụ lưu trữ `[ĐỀ XUẤT CẦN TRIỂN KHAI]`.
  3. *Giới hạn phía Nhà cung cấp (Provider):* Cấu hình hạn mức dung lượng, loại tệp cho phép và tách biệt thư mục môi trường trên bảng điều khiển cloud storage.
* `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 04: Dịch vụ Lưu trữ & Tải Media (Upload Service)]`: Nhóm cần thảo luận và thống nhất các tiêu chí kỹ thuật trước khi triển khai:
  * **Cơ chế upload & Nơi lưu trữ `[CẦN XÁC NHẬN]`:** Thống nhất dịch vụ lưu trữ (Cloudinary, AWS S3, MinIO hoặc lưu máy chủ nội bộ qua `multer`). Đầu mối phụ trách kỹ thuật: Backend do **Việt Hoàng** phụ trách; phần Web cần triển khai chỉ phân chia giữa **Đăng Hoàng**, **Đức** và **Oanh** khi thực sự phát sinh nhiệm vụ chưa có người phụ trách (không chia lại các nhiệm vụ Web đã phân công); phần Mobile cần triển khai chỉ phân chia giữa **Nguyệt** và **Thuần** khi thực sự phát sinh nhiệm vụ chưa có người phụ trách (không chia lại các nhiệm vụ Mobile đã phân công).
  * **Phân loại tệp & Giới hạn dung lượng `[ĐỀ XUẤT — CHỜ XÁC NHẬN]`:** Ảnh sự cố/hóa đơn tối đa 5MB (chấp nhận `.jpg`, `.jpeg`, `.png`, `.webp`); Video mô tả sự cố tối đa 20MB (chấp nhận `.mp4`). Tiếp tục giữ các giới hạn 5 MB/ảnh và 20 MB/video ở trạng thái đề xuất vì nhóm chưa chính thức thông qua. Tuyệt đối không lưu trữ hoặc nhúng chuỗi Base64 vào CSDL hoặc trường kê khai vật tư.
  * **Ủy quyền tải lên (Upload Authorization) `[CẦN XÁC NHẬN]`:** Ưu tiên cơ chế Signed Uploads hoặc Upload qua Backend Proxy trung gian có xác thực JWT.
  * **Quản lý khóa bí mật (Secret Management):** Toàn bộ API Keys và Secrets (`CLOUDINARY_API_SECRET`, AWS Secret Access Key, ...) PHẢI được lưu trong biến môi trường máy chủ (`.env`), TUYỆT ĐỐI KHÔNG lưu trong mã nguồn Web hay Mobile bundle.
  * **Xử lý sự cố & Dọn dẹp tài nguyên rác (Orphaned Assets) `[ĐỀ XUẤT — CHỜ XÁC NHẬN]`:** Xây dựng cơ chế dọn dẹp các tệp tải lên mồ côi khi người dùng hủy gửi phiếu sự cố hoặc khi request bị lỗi.
  * **Người cần chốt:** **Việt Hoàng (Leader Backend)**, **Hiếu (DB Engineer)**, đại diện Web (**Đăng Hoàng / Đức / Oanh**) & đại diện Mobile (**Nguyệt / Thuần**). Hiện tại giữ nguyên trạng thái `[CẦN XÁC NHẬN]`, không tự tiện triển khai dịch vụ.

### 7. Hợp đồng API & Trạng thái Triển khai Thực tế (API Contract & Status Matrix)

Nhóm cần nắm rõ trạng thái thực tế của từng API để không hiểu nhầm mã scaffold stub là API đã chạy được:

| Phân hệ API | Phương thức & Đường dẫn (Endpoint) | Trạng thái kỹ thuật thực tế | Quyền hạn & Kiểm tra truy cập theo bản ghi (RBAC & Record-Level) | Bằng chứng mã nguồn & Phụ trách |
| :--- | :--- | :---: | :--- | :--- |
| **Auth** | `POST /api/auth/login` | **[ĐÃ TRIỂN KHAI]** | Public (Không yêu cầu đăng nhập; Anti-Brute-Force throttle 5 lần / 5 phút) | [`backend/src/modules/auth/auth.controller.ts`](backend/src/modules/auth/auth.controller.ts) *(Việt Hoàng & Hiếu)* |
| **Auth** | `POST /api/auth/change-password` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Đổi mật khẩu của chính mình (`currentUser.id`) | [`backend/src/modules/auth/auth.controller.ts`](backend/src/modules/auth/auth.controller.ts) *(Việt Hoàng & Hiếu)* |
| **Auth** | `GET /api/auth/me` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Xem hồ sơ cá nhân của chính mình (`currentUser.id`) | [`backend/src/modules/auth/auth.controller.ts`](backend/src/modules/auth/auth.controller.ts) *(Việt Hoàng & Hiếu)* |
| **Users** | `GET /api/admin/users` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: ADMIN, BQL | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/users/users.controller.ts`](backend/src/modules/users/users.controller.ts) *(Việt Hoàng)* |
| **Users** | `POST /api/admin/users` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: ADMIN | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/users/users.controller.ts`](backend/src/modules/users/users.controller.ts) *(Việt Hoàng)* |
| **Users** | `PUT /api/admin/users/:id/approve` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: ADMIN, BQL | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/users/users.controller.ts`](backend/src/modules/users/users.controller.ts) *(Việt Hoàng)* |
| **Users** | `GET /api/apartments/residents` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: BQL, ADMIN | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/app.module.ts#L23`](backend/src/app.module.ts#L23) *(Việt Hoàng)* |
| **Users** | `PUT /api/apartments/residents/:id/approve` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: BQL | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/users/users.controller.ts`](backend/src/modules/users/users.controller.ts) *(Việt Hoàng)* |
| **Rooms** | `GET /api/rooms` | **[API DỰ KIẾN — CHƯA TRIỂN KHAI]** | Dự kiến: BQL, ADMIN | Chưa có controller backend; `[CẦN XÁC NHẬN]` phạm vi API *(Việt Hoàng phụ trách Backend)* |
| **Rooms** | `POST /api/rooms` | **[API DỰ KIẾN — CHƯA TRIỂN KHAI]** | Dự kiến: BQL, ADMIN | Chưa có controller backend; `[CẦN XÁC NHẬN]` phạm vi API *(Việt Hoàng phụ trách Backend)* |
| **Rooms** | `PUT /api/rooms/:id` | **[API DỰ KIẾN — CHƯA TRIỂN KHAI]** | Dự kiến: BQL, ADMIN | Chưa có controller backend; `[CẦN XÁC NHẬN]` phạm vi API *(Việt Hoàng phụ trách Backend)* |
| **Tickets** | `POST /api/tickets` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân chỉ tạo phiếu cho phòng mình (`effectiveResidentId = currentUser.id`, kiểm tra `roomId`); BQL/Admin có thể tạo hộ cư dân; chặn Thợ kỹ thuật (403) | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `GET /api/tickets` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: RESIDENT chỉ xem phiếu mình tạo (`residentId = currentUser.id`); TECHNICIAN chỉ xem phiếu được gán (`technicianId = currentUser.id`); ADMIN/BQL xem toàn bộ và lọc theo tiêu chí | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `GET /api/tickets/my-tickets` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân chỉ xem phiếu của mình (`residentId = currentUser.id`, bỏ qua query param khác); chặn Thợ kỹ thuật (403); BQL/Admin có thể tra cứu theo cư dân | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `GET /api/tickets/:id` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân chỉ xem nếu là người tạo phiếu hoặc cùng phòng (khác phòng chặn 403); Thợ chỉ xem phiếu được phân công trực tiếp cho mình (khác phân công chặn 403); ADMIN/BQL xem toàn bộ | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `PUT /api/tickets/:id/assign` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chỉ gán cho user có role `TECHNICIAN`; từ chối nếu phiếu đã đóng (`CLOSED`) | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `PUT /api/tickets/:id/status` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi & State Machine: Thợ chỉ chuyển trạng thái phiếu được gán cho mình (`ASSIGNED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED`); Cư dân tạo phiếu chỉ chuyển sang `CLOSED`; BQL/Admin có quyền điều phối | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `POST /api/tickets/:id/materials` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Chỉ thợ được phân công phụ trách phiếu (`ticket.technicianId === currentUser.id`) hoặc BQL/Admin mới được kê khai; chặn Cư dân (403); khóa khi phiếu đã `CLOSED` | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `POST /api/tickets/:id/rate` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân tạo phiếu (`ticket.residentId === currentUser.id`); mã nguồn hiện cho phép thêm ADMIN/BQL; chặn tuyệt đối Thợ kỹ thuật (403); `[CẦN XÁC NHẬN NGHIỆP VỤ: Liệu BQL có được nghiệm thu/chấm điểm thay cư dân hay không; Việt Hoàng phụ trách đánh giá tác động RBAC]` | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `GET /api/technician/tickets` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Route chuyên dụng cho Thợ (alias), tự động áp bộ lọc `technicianId = currentUser.id` đối với role `TECHNICIAN`; BQL/Admin có thể truy cập | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `PUT /api/technician/tickets/:id/status` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Route alias cho thợ cập nhật tiến độ công việc được phân công (tuân thủ State Machine) | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Tickets** | `POST /api/technician/tickets/:id/materials` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Route alias cho thợ kê khai vật tư thay thế cho phiếu được phân công phụ trách | [`backend/src/modules/tickets/tickets.controller.ts`](backend/src/modules/tickets/tickets.controller.ts) *(Hiếu)* |
| **Invoices** | `POST /api/invoices` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chặn Cư dân và Thợ kỹ thuật (403); chống tạo trùng theo cặp `[roomId, month]` | [`backend/src/modules/invoices/invoices.controller.ts`](backend/src/modules/invoices/invoices.controller.ts) *(Hiếu)* |
| **Invoices** | `GET /api/invoices` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân chỉ xem hóa đơn căn hộ của mình (`where.roomId = currentUser.roomId`); chặn Thợ kỹ thuật (403); ADMIN/BQL có quyền xem và lọc toàn bộ | [`backend/src/modules/invoices/invoices.controller.ts`](backend/src/modules/invoices/invoices.controller.ts) *(Hiếu)* |
| **Invoices** | `GET /api/invoices/my-invoice` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân bắt buộc lấy `roomId` từ token đã xác thực; chặn Thợ kỹ thuật (403); BQL/Admin có thể tra cứu theo `roomId` | [`backend/src/modules/invoices/invoices.controller.ts`](backend/src/modules/invoices/invoices.controller.ts) *(Hiếu)* |
| **Invoices** | `GET /api/invoices/:id/vietqr` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi (Anti-IDOR): Cư dân chỉ xem VietQR của căn hộ mình (nếu khác phòng trả về 404 Anti-Enumeration); chặn Thợ kỹ thuật (403); BQL/Admin được truy cập | [`backend/src/modules/invoices/invoices.controller.ts`](backend/src/modules/invoices/invoices.controller.ts) *(Hiếu)* |
| **Invoices** | `PUT /api/invoices/:id/status` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chặn Cư dân và Thợ kỹ thuật (403); khóa dòng `SELECT ... FOR UPDATE`, chống ghi đè và chống nộp thừa (Overpayment) | [`backend/src/modules/invoices/invoices.controller.ts`](backend/src/modules/invoices/invoices.controller.ts) *(Hiếu)* |
| **Feedback** | `POST /api/feedback` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Chỉ Cư dân (`RESIDENT`) mới có quyền gửi; bắt buộc gắn `residentId = currentUser.id`; chỉ gửi cho phòng mình hoặc khu vực chung | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `GET /api/feedback/my-feedback` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Chỉ Cư dân (`RESIDENT`) được gọi; truy vấn cố định `where.residentId = currentUser.id` | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `GET /api/feedback` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi: Cư dân chỉ xem phản ánh của mình (`where.residentId = currentUser.id`); chặn Thợ kỹ thuật (403); ADMIN/BQL xem toàn bộ | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `GET /api/feedback/:id` | **[ĐÃ TRIỂN KHAI]** | `requireAuth` + Bản ghi (Anti-Enumeration): Cư dân chỉ xem phản ánh do mình tạo (nếu không phải trả về 404); chặn Thợ kỹ thuật (403); ADMIN/BQL được xem | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `POST /api/feedback/:id/reply` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chặn Cư dân và Thợ kỹ thuật (403); cập nhật nội dung phản hồi và tự động đổi `isResolved = true` trong transaction | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `PUT /api/feedback/:id/reply` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chặn Cư dân và Thợ kỹ thuật (403); cập nhật nội dung phản hồi (đồng bộ logic cùng POST handler) | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Feedback** | `PATCH /api/feedback/:id/status` | **[ĐÃ TRIỂN KHAI]** | `requireRoles(ADMIN, BQL)`; Chặn Cư dân và Thợ kỹ thuật (403); cập nhật độc lập cờ giải quyết `isResolved` | [`backend/src/modules/feedback/feedback.controller.ts`](backend/src/modules/feedback/feedback.controller.ts) *(Hiếu)* |
| **Notifications** | `GET /api/notifications` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: Mọi user đăng nhập | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/notifications/notifications.controller.ts`](backend/src/modules/notifications/notifications.controller.ts) *(Việt Hoàng)* |
| **Notifications** | `POST /api/notifications` | **[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** | Dự kiến: ADMIN, BQL | `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI: Mã stub chưa gắn middleware auth/role và chưa kết nối DB]` | [`backend/src/modules/notifications/notifications.controller.ts`](backend/src/modules/notifications/notifications.controller.ts) *(Việt Hoàng)* |

> [!WARNING]
> **HỢP ĐỒNG TÍCH HỢP & LƯU Ý DÀNH CHO WEB VÀ MOBILE FRONTEND:**
> * Bảng hợp đồng API trên gồm đúng **36 hàng** đại diện cho **36 endpoints** riêng biệt (phân tách 1 tổ hợp Method + URL Path trên 1 hàng): gồm **26 endpoints [ĐÃ TRIỂN KHAI]**, **7 endpoints [CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]** và **3 endpoints [API DỰ KIẾN — CHƯA TRIỂN KHAI]**.
> * Các API đánh dấu **`[ĐÃ TRIỂN KHAI]`** (Auth, Tickets, Invoices, Feedback) đã có controller hoàn chỉnh, kết nối CSDL PostgreSQL, kiểm tra bảo mật và vượt qua toàn bộ các bộ test hiện có (197 unit test cases và 178 integration assertions tại thời điểm kiểm tra). Frontend Web và Mobile có thể an tâm tích hợp gọi API thực tế.
> * Các API đánh dấu **`[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`** (Users, Notifications) hoặc **`[API DỰ KIẾN — CHƯA TRIỂN KHAI]`** (Rooms) hiện tại Backend mới chỉ có khung rỗng trả về mock data hoặc chưa có controller; chưa có middleware xác thực và kiểm soát bản ghi. **Frontend Web và Mobile tuyệt đối không được coi đây là API đã hoàn thiện; mọi tích hợp hiện tại chỉ là mã chờ theo hợp đồng API dự kiến và phụ thuộc vào tiến độ triển khai thực tế của Backend.**

---

## II. MA TRẬN PHÂN CÔNG CÔNG VIỆC TỔNG QUAN (7 THÀNH VIÊN)

| Thành viên | Vai trò chính | Phân hệ phụ trách | Vị trí File & Thư mục chính | Nhiệm vụ trọng tâm |
| :--- | :--- | :--- | :--- | :--- |
| **Việt Hoàng** *(Leader)* | Trưởng nhóm, Backend Architect | 🖥️ Backend Framework & Auth/Users | `backend/src/main.ts`<br>`backend/src/app.module.ts`<br>`backend/src/modules/auth/`, `users/`, `notifications/` | Quản lý khung server, bảo mật JWT, API quản lý user & duyệt cư dân, Socket.IO, review & merge PR toàn dự án |
| **Hiếu** | Kỹ sư CSDL & Backend Core | 🗄️ Database, Core API & Testing | `backend/src/database/`<br>`backend/src/common/utils/`<br>`backend/src/modules/tickets/`, `invoices/`, `feedback/`<br>`backend/src/test/`, `docker/`, `.github/` | Thiết kế CSDL Prisma, tiện ích bảo mật/tiền tệ/VietQR, nghiệp vụ Sự cố/Hóa đơn/Góp ý, bảo đảm các bộ test hiện có (197 unit tests, 178 integration assertions tại thời điểm kiểm tra) và CI Pipeline luôn PASS |
| **Đăng Hoàng** | Web Frontend Lead | 🌐 Web Layout & Quản trị Admin | `web/src/components/Layout/`<br>`web/src/routes/AppRoutes.tsx`<br>`web/src/pages/LoginPage.tsx`, `AdminAccountsPage.tsx` | Xây dựng khung Web (Sidebar, Header, Layout), cấu hình Router, màn hình Đăng nhập, Admin tạo tài khoản BQL & Thợ |
| **Nguyệt** | Mobile Frontend Lead | 📱 Mobile App (Khung & Căn hộ) | `mobile/src/navigation/AppNavigator.tsx`<br>`mobile/src/api/apiClient.ts`<br>`mobile/src/screens/AuthScreen.tsx`, `ProfileScreen.tsx`, `NotificationScreen.tsx`, `InvoiceScreen.tsx` | Khung điều hướng Mobile, Đăng nhập cư dân, Hồ sơ căn hộ, Bảng tin tòa nhà, Tra cứu hóa đơn & quét mã VietQR |
| **Thuần** | Mobile Developer | 📱 Mobile App (Sự cố & Góp ý) | `mobile/src/screens/CreateTicketScreen.tsx`, `TicketTimelineScreen.tsx`<br>`mobile/src/screens/RatingScreen.tsx`, `FeedbackScreen.tsx` | Màn hình Báo hỏng (ảnh/video link), Dòng thời gian tiến độ sửa chữa, Nghiệm thu đánh giá 1-5 sao, Gửi góp ý BQL |
| **Đức** | Web Developer | 🌐 Web Quản lý Căn hộ & Điều phối | `web/src/pages/ResidentsPage.tsx`<br>`web/src/pages/TicketDispatchPage.tsx`<br>`web/src/pages/BillingManagerPage.tsx` | Quản lý danh mục phòng & duyệt cư dân, Bảng điều phối sự cố & cảnh báo trùng, Lập biểu phí định kỳ & đối soát thanh toán |
| **Oanh** | Web Developer | 🌐 Web Vận hành Thợ & Tương tác | `web/src/pages/TechnicianTasksPage.tsx`<br>`web/src/pages/AnnouncementsPage.tsx`<br>`web/src/pages/FeedbackManagementPage.tsx` | Không gian làm việc của Thợ (nhận việc/vật tư/ảnh sau sửa), Soạn & phát thông báo chung cư, Trả lời hòm thư góp ý |

---

## III. MA TRẬN QUẢN LÝ TỆP TIN DÙNG CHUNG (SHARED FILES GOVERNANCE)

Để ngăn chặn xung đột mã nguồn và bảo đảm tính toàn vẹn kiến trúc, mọi tệp tin dùng chung được quản lý theo cơ chế phân quyền nghiêm ngặt dưới đây:

| Tệp tin / Thư mục dùng chung | Người chịu trách nhiệm cuối cùng (Final Owner) | Thành viên được đề xuất sửa | Quy trình PR & Duyệt bắt buộc | Các phân hệ phụ thuộc |
| :--- | :--- | :--- | :--- | :--- |
| [`backend/src/app.module.ts`](backend/src/app.module.ts) | **Việt Hoàng** *(Leader)* | Hiếu | Tạo PR, chỉ Leader được merge | Toàn bộ router API backend |
| [`backend/src/main.ts`](backend/src/main.ts) | **Việt Hoàng** *(Leader)* | Hiếu | Tạo PR, chỉ Leader được merge | Server Express, Middleware, Port, Socket.IO |
| [`backend/src/database/schema.prisma`](backend/src/database/schema.prisma#L58) | **Hiếu** *(DB Engineer)* | Việt Hoàng | Hiếu duyệt & chạy kiểm tra tích hợp trước khi merge | Toàn bộ backend, Prisma Client, Migrations |
| [`backend/src/database/prisma.ts`](backend/src/database/prisma.ts) | **Hiếu** *(DB Engineer)* | — | Không sửa đổi (Singleton pattern) | Tất cả các controllers và test runners |
| [`backend/src/common/utils/`](backend/src/common/utils/) *(Thư mục tiện ích: security, validation, vietqr)* | **Hiếu** *(Core Backend)* | Việt Hoàng | Hiếu duyệt; bắt buộc chạy `npm test` trước khi gộp | Toàn bộ validation, security, vietqr |
| [`backend/src/common/constants/api-endpoints.ts`](backend/src/common/constants/api-endpoints.ts) | **Việt Hoàng** *(Leader)* | Tất cả thành viên Backend | Thống nhất endpoint trước khi sửa; thông báo Web/Mobile | Đồng bộ sang Web & Mobile |
| [`web/src/routes/AppRoutes.tsx`](web/src/routes/AppRoutes.tsx) | **Đăng Hoàng** *(Web Lead)* | Đức, Oanh | Đăng Hoàng duyệt và liên kết route | Toàn bộ 8 trang Web |
| [`web/src/components/Layout/`](web/src/components/Layout/) *(Thư mục khung layout Web)* | **Đăng Hoàng** *(Web Lead)* | Đức, Oanh | Đăng Hoàng phụ trách khung chung | Giao diện toàn Web |
| [`web/src/api/axiosClient.ts`](web/src/api/axiosClient.ts) | **Đăng Hoàng** *(Web Lead)* | Đức, Oanh | Đăng Hoàng cấu hình base URL & Token Interceptor | Toàn bộ API calls trên Web |
| [`web/src/api/endpoints.ts`](web/src/api/endpoints.ts) | **Đăng Hoàng** *(Web Lead)* | Đức, Oanh | Đăng Hoàng duyệt khi đồng bộ danh mục API từ Backend | Toàn bộ API calls trên Web |
| [`mobile/src/navigation/AppNavigator.tsx`](mobile/src/navigation/AppNavigator.tsx) | **Nguyệt** *(Mobile Lead)* | Thuần | Nguyệt duyệt và liên kết screen | Toàn bộ màn hình Mobile |
| [`mobile/src/api/apiClient.ts`](mobile/src/api/apiClient.ts) | **Nguyệt** *(Mobile Lead)* | Thuần | Nguyệt cấu hình token interceptor & baseURL | Toàn bộ API calls trên Mobile |
| [`mobile/src/api/endpoints.ts`](mobile/src/api/endpoints.ts) | **Nguyệt** *(Mobile Lead)* | Thuần | Nguyệt duyệt khi đồng bộ danh mục API từ Backend | Toàn bộ API calls trên Mobile |

---

## IV. BẢNG PHÂN CÔNG CÔNG VIỆC CHI TIẾT TỪNG THÀNH VIÊN

### 1. 👤 VIỆT HOÀNG — Trưởng nhóm, Backend Framework, Auth, Users & Notifications
* **Phạm vi nghiệp vụ:** Quản lý kiến trúc máy chủ Backend, luồng xác thực an toàn (Authentication), cấp phát tài khoản nội bộ cho Ban quản lý & Thợ kỹ thuật, duyệt tài khoản cư dân mới, phát thông báo tòa nhà, duy trì Socket.IO và duyệt Pull Request toàn dự án.
* **Tệp tin phụ trách trực tiếp:**
  * [`backend/src/main.ts`](backend/src/main.ts)
  * [`backend/src/app.module.ts`](backend/src/app.module.ts)
  * [`backend/src/modules/auth/auth.controller.ts`](backend/src/modules/auth/auth.controller.ts) *(phối hợp cùng Hiếu)*
  * [`backend/src/modules/auth/auth.validator.ts`](backend/src/modules/auth/auth.validator.ts)
  * [`backend/src/modules/users/users.controller.ts`](backend/src/modules/users/users.controller.ts)
  * [`backend/src/modules/notifications/notifications.controller.ts`](backend/src/modules/notifications/notifications.controller.ts)
* **Tệp dùng chung được phép sửa:** [`backend/src/common/constants/api-endpoints.ts`](backend/src/common/constants/api-endpoints.ts) *(Việt Hoàng - Final Owner)*.
* **API Dependencies cung cấp cho nhóm:**
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/auth/login`, `POST /api/auth/change-password`, `GET /api/auth/me`.
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `GET /api/admin/users`, `POST /api/admin/users`, `PUT /api/admin/users/:id/approve`, `GET /api/apartments/residents`, `PUT /api/apartments/residents/:id/approve` *(Cảnh báo: Hiện controller mới chỉ trả về mock rỗng, chưa gắn middleware xác thực/phân quyền hay kết nối CSDL thật; `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI]`; Web/Mobile chưa thể gọi tích hợp thực tế)*.
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `GET /api/notifications`, `POST /api/notifications` *(Cảnh báo: Hiện controller mới chỉ là mock rỗng, chưa kết nối CSDL hay Socket.IO; `[CẦN XÁC MINH QUYỀN TRUY CẬP THEO BẢN GHI]`)*.
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Đăng Hoàng** để hoàn thiện luồng đăng nhập Web và tạo tài khoản Admin (khi API users được triển khai thật trên CSDL).
  * Phối hợp với **Đức** để kết nối API duyệt cư dân mới (`isApproved`).
  * Phụ trách phát triển Backend module Rooms (`[CẦN XÁC NHẬN]` phạm vi nghiệp vụ và API chi tiết theo Quyết định 01); chịu trách nhiệm chính phân tích phương án kỹ thuật và đánh giá ảnh hưởng Backend/CSDL của mô hình biểu phí (`[CẦN XÁC NHẬN - QUYẾT ĐỊNH 05]`) cùng sự phối hợp của **Hiếu** và **Đức**.
  * Phụ trách đánh giá phương án Backend cho tích hợp Webhook biến động số dư đối soát thanh toán (`[CẦN XÁC NHẬN - QUYẾT ĐỊNH 02]`).
  * Phụ trách kiểm tra và đánh giá tác động kỹ thuật đến Backend/RBAC đối với quyền nghiệm thu/chấm sao phiếu sự cố (`[CẦN XÁC NHẬN NGHIỆP VỤ: BQL có được chấm sao thay cư dân hay không]`).
  * Phụ trách phần Backend/API cho Push Notification, phối hợp với **Nguyệt** và **Thuần** thống nhất nhà cung cấp Mobile Push Notification (`[CẦN XÁC NHẬN - QUYẾT ĐỊNH 03]`).
  * Phối hợp với **Oanh** để kết nối API soạn và phát thông báo tòa nhà (sau khi hoàn thiện module notifications).
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Đăng nhập đúng trả về JWT Token có thời hạn (1 ngày), thông tin `role`, `roomId`.
  * [ ] Cư dân chưa được duyệt (`isApproved: false`) đăng nhập bị từ chối với lỗi `403 Forbidden`.
  * [ ] Kiểm tra phân quyền (RBAC): Thợ và Cư dân gọi endpoint admin bị chặn `403 Forbidden` (thực thi kiểm tra phân quyền RBAC tại Backend, không phụ thuộc vào ẩn trang trên Frontend).
  * [ ] `[ĐỀ XUẤT]` Bổ sung bộ kiểm thử tự động cho module `users` và `notifications` (kiểm tra phân quyền RBAC, validation đầu vào, mã lỗi 400/401/403/404, xử lý dữ liệu CSDL); duy trì 100% tỷ lệ PASS cho toàn bộ các bộ test liên quan (ngưỡng số lượng kiểm thử $\ge 215$ test cases là con số ước tính đề xuất, mục tiêu thực tế căn cứ theo độ bao phủ đầy đủ các hành vi nghiệp vụ).
* **Tiêu chí hoàn thành (Definition of Done - DoD):** Toàn bộ API auth, users, notifications đều được bảo vệ bởi middleware `requireAuth`, `requireRoles`, kết nối CSDL PostgreSQL thật, loại bỏ hoàn toàn mã stub giả lập, và vượt qua toàn bộ các bộ kiểm thử tương ứng.

---

### 2. 👤 HIẾU — Kỹ sư Cơ sở Dữ liệu & Backend Core (Tickets, Invoices, Feedback & Testing)
* **Phạm vi nghiệp vụ:** Thiết kế lược đồ CSDL toàn hệ thống, bảo vệ tính toàn vẹn dữ liệu, xây dựng bộ tiện ích lá chắn bảo mật (validation, hashing, vietqr), lập trình toàn bộ logic nghiệp vụ cốt lõi (Sự cố, Hóa đơn định kỳ, Góp ý), duy trì hạ tầng kiểm thử và CI/CD.
* **Tệp tin phụ trách trực tiếp:**
  * [`backend/src/database/schema.prisma`](backend/src/database/schema.prisma#L58)
  * [`backend/src/database/prisma.ts`](backend/src/database/prisma.ts)
  * [`backend/src/common/utils/`](backend/src/common/utils/) *(Thư mục tiện ích: security.ts, validation.ts, vietqr.ts — Final Owner)*
  * [`backend/src/common/middleware/auth.ts`](backend/src/common/middleware/auth.ts)
  * [`backend/src/modules/tickets/`](backend/src/modules/tickets/) (`controller.ts`, `validator.ts`, `test.ts`, `integration.test.ts`)
  * [`backend/src/modules/invoices/`](backend/src/modules/invoices/) (`controller.ts`, `validator.ts`, `test.ts`, `integration.test.ts`)
  * [`backend/src/modules/feedback/`](backend/src/modules/feedback/) (`controller.ts`, `validator.ts`, `test.ts`, `integration.test.ts`)
  * [`backend/src/test/`](backend/src/test/) (`integration-setup.ts`, `run-all-integration.ts`)
  * [`docker-compose.test.yml`](docker-compose.test.yml), [`docker/test-init/`](docker/test-init/), [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
* **Tệp dùng chung được phép sửa:** [`backend/src/common/constants/api-endpoints.ts`](backend/src/common/constants/api-endpoints.ts) *(Việt Hoàng là Final Owner, Hiếu đề xuất sửa khi có endpoint mới)*.
* **API Dependencies cung cấp cho nhóm:**
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/my-tickets`, `GET /api/tickets/:id`, `PUT /api/tickets/:id/assign`, `PUT /api/tickets/:id/status`, `POST /api/tickets/:id/materials`, `POST /api/tickets/:id/rate`, cùng các route alias cho Thợ: `GET /api/technician/tickets`, `PUT /api/technician/tickets/:id/status`, `POST /api/technician/tickets/:id/materials`.
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/invoices`, `GET /api/invoices`, `GET /api/invoices/my-invoice`, `GET /api/invoices/:id/vietqr`, `PUT /api/invoices/:id/status`.
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/feedback`, `GET /api/feedback/my-feedback`, `GET /api/feedback`, `GET /api/feedback/:id`, `POST /api/feedback/:id/reply`, `PUT /api/feedback/:id/reply`, `PATCH /api/feedback/:id/status`.
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Đức** để kết nối Bảng chia việc sự cố, lọc trùng 24h và Quản lý hóa đơn trên Web. Nêu rõ VietQR chỉ sinh thông tin chuyển khoản, Đức cần đối soát sao kê và gọi `PUT /api/invoices/:id/status` để chốt `PAID`.
  * Phối hợp với **Đức & Việt Hoàng** về `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 05: Mô hình Quản lý Biểu phí]`: Hiện tại API `POST /api/invoices` nhận các trường phí trực tiếp từ request body. Nếu nhóm thống nhất chuyển sang Phương án B (tạo bảng FeeSchedule/BillingConfig riêng), Hiếu sẽ phối hợp CSDL cùng Việt Hoàng (người chịu trách nhiệm chính phân tích kỹ thuật Backend/CSDL) cập nhật `schema.prisma`, migration và logic tính toán tự động.
  * Phối hợp với **Oanh** để kết nối Không gian làm việc của Thợ (nhận việc, vật tư, ảnh nghiệm thu) và Xử lý góp ý.
  * Phối hợp với **Thuần** về quy chuẩn media upload: Hàm [`isValidMediaUrl()`](backend/src/common/utils/validation.ts#L10) hiện tại kiểm tra độ dài $\le 1000$, giao thức `http:` hoặc `https:`, và chặn chuỗi Base64; giới hạn dung lượng ảnh $\le$ 5MB và video $\le$ 20MB là `[ĐỀ XUẤT — CHỜ XÁC NHẬN]`; việc nâng cấp ép buộc riêng HTTPS và đối chiếu whitelist domain là `[ĐỀ XUẤT CẦN TRIỂN KHAI]` theo Quyết định 04.
  * Phối hợp với **Nguyệt** để hiển thị đúng hóa đơn và mã VietQR trên Mobile; làm rõ việc quét mã chuyển khoản không tự động gạch nợ.
  * Phối hợp với **Việt Hoàng** (người phụ trách phát triển Backend module `rooms`) về cấu trúc dữ liệu bảng `Room` trong CSDL.
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Duy trì 100% tỷ lệ PASS của các bộ test hiện có (197 unit tests độc lập và 178 integration test assertions ghi nhận tại thời điểm kiểm tra).
  * [ ] Ràng buộc duy nhất `@@unique([roomId, month])` bắt lỗi `409 Conflict` thành công khi tạo trùng hóa đơn.
  * [ ] Lọc trùng sự cố 24h gắn cờ `isDuplicate = true` chính xác.
  * [ ] Khóa dòng `SELECT ... FOR UPDATE` bảo vệ toàn vẹn tài chính khi cập nhật thanh toán đồng thời.
* **Tiêu chí hoàn thành (DoD):** Toàn bộ API lõi hoạt động ổn định, bảo đảm kiểm tra kiểu TypeScript không lỗi (`tsc --noEmit`), vượt qua 100% assertions trong GitHub Actions CI Pipeline.

---

### 3. 👤 ĐĂNG HOÀNG — Web Frontend Lead (Layout, Đăng nhập, Admin Accounts, API Endpoints & Routing)
* **Phạm vi nghiệp vụ:** Thiết kế khung giao diện Web chung, xây dựng hệ thống định tuyến (Router), quản lý danh mục endpoint Web, lập trình trang Đăng nhập và trang Quản trị tài khoản cho Admin.
* **Tệp tin phụ trách trực tiếp:**
  * [`web/src/components/Layout/`](web/src/components/Layout/) (`AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`)
  * [`web/src/routes/AppRoutes.tsx`](web/src/routes/AppRoutes.tsx)
  * [`web/src/pages/LoginPage.tsx`](web/src/pages/LoginPage.tsx)
  * [`web/src/pages/AdminAccountsPage.tsx`](web/src/pages/AdminAccountsPage.tsx)
  * [`web/src/constants/menu.ts`](web/src/constants/menu.ts)
  * [`web/src/api/axiosClient.ts`](web/src/api/axiosClient.ts)
  * [`web/src/api/endpoints.ts`](web/src/api/endpoints.ts)
* **Tệp cần bổ sung để Web chạy được (Hiện trạng kỹ thuật Vite):**
  * `web/index.html`: Entry point mã nguồn mặc định của Vite (chứa thẻ `<script type="module" src="/src/main.tsx">`). Theo kiến trúc của Vite ([vite.dev/guide](https://vite.dev/guide/)), Vite xem `index.html` tại thư mục gốc là entry point chính; thiếu file này là rào cản trực tiếp khiến Vite CLI không thể xác định entry point khi khởi chạy dev server hoặc đóng gói build.
  * `web/vite.config.ts`: Cấu hình cần thêm để nạp plugin `@vitejs/plugin-react` (đã có trong `devDependencies`). Cần lưu ý rằng Vite có khả năng chạy zero-config cho các file tĩnh cơ bản ([vite.dev/config](https://vite.dev/config/)), nhưng `vite.config.ts` cần thiết trong dự án này để nạp plugin React, phân giải JSX transform và Fast Refresh theo cấu trúc dự án đã chọn.
  * *Lưu ý hiện trạng:* Phân biệt rõ các file giao diện (`web/src/pages/`) hiện đã tồn tại nhưng là các file khung scaffold (chưa hoàn thiện logic); thư mục `web/` chưa cài đặt `node_modules` và chưa được kiểm chứng build thực tế. Không tuyên bố Web đã chạy hay build thành công khi chưa thực hiện kiểm chứng thực tế.
* **API Dependencies phụ thuộc vào Backend:**
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/auth/login` (cung cấp bởi Việt Hoàng & Hiếu).
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `GET /api/admin/users`, `POST /api/admin/users` (cung cấp bởi Việt Hoàng). *Cảnh báo: Hiện Backend mới chỉ trả về dữ liệu mock rỗng; Đăng Hoàng cần lưu ý đây là API đang chờ hoàn thiện, chưa thể gọi tích hợp lưu CSDL thật.*
* **Phối hợp liên phân hệ:**
  * Bàn giao khung `AppLayout` và hướng dẫn tích hợp route cho **Đức** và **Oanh**.
  * Phối hợp với **Việt Hoàng** để xử lý lưu JWT token vào `localStorage` và xử lý hết hạn phiên đăng nhập (redirect về `/login`).
  * Lưu ý phân quyền: Ẩn menu trong `menu.ts` chỉ phục vụ trải nghiệm người dùng (UX); quy tắc bảo vệ dữ liệu cốt lõi do Backend (`requireAuth`, `requireRoles`) thực thi.
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Khởi chạy thành công ứng dụng Web qua `npm run dev` trên Vite sau khi bổ sung `index.html` và `vite.config.ts`.
  * [ ] Form đăng nhập gửi đúng identifier và password, lưu token vào `localStorage`.
  * [ ] Protected Route: Người chưa đăng nhập cố tình vào `/admin/accounts` hoặc `/billing` bị đẩy về `/login`.
  * [ ] Admin tạo thành công tài khoản BQL / Thợ kỹ thuật qua modal và hiển thị trên bảng (sau khi Backend hoàn thiện API users).
* **Tiêu chí hoàn thành (DoD):** Web portal chạy được qua `npm run dev`, hoàn thành kiểm chứng build `tsc && vite build` không lỗi sau khi cài đặt môi trường, giao diện điều hướng mượt mà, phân quyền hiển thị menu theo đúng vai trò người dùng (ADMIN, BQL, TECHNICIAN).

---

### 4. 👤 NGUYỆT — Mobile Frontend Lead (Navigation, Xác thực, Hồ sơ, Hóa đơn & Bảng tin)
* **Phạm vi nghiệp vụ:** Thiết kế cấu trúc điều hướng Mobile App Cư dân, quản lý phiên đăng nhập và lưu trữ token an toàn, lập trình màn hình Thông tin căn hộ, Tra cứu hóa đơn định kỳ quét mã VietQR và xem Bảng tin tòa nhà.
* **Tệp tin phụ trách trực tiếp:**
  * [`mobile/App.tsx`](mobile/App.tsx)
  * [`mobile/src/navigation/AppNavigator.tsx`](mobile/src/navigation/AppNavigator.tsx)
  * [`mobile/src/api/apiClient.ts`](mobile/src/api/apiClient.ts)
  * [`mobile/src/api/endpoints.ts`](mobile/src/api/endpoints.ts)
  * [`mobile/src/screens/AuthScreen.tsx`](mobile/src/screens/AuthScreen.tsx)
  * [`mobile/src/screens/ProfileScreen.tsx`](mobile/src/screens/ProfileScreen.tsx)
  * [`mobile/src/screens/InvoiceScreen.tsx`](mobile/src/screens/InvoiceScreen.tsx)
  * [`mobile/src/screens/NotificationScreen.tsx`](mobile/src/screens/NotificationScreen.tsx)
* **API Dependencies phụ thuộc vào Backend:**
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/auth/login`, `POST /api/auth/change-password`, `GET /api/auth/me` (Việt Hoàng & Hiếu).
  * `[ĐÃ TRIỂN KHAI]`: `GET /api/invoices/my-invoice`, `GET /api/invoices/:id/vietqr` (Hiếu).
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `GET /api/notifications` (Việt Hoàng). *Cảnh báo: Hiện API thông báo là mock rỗng, chưa có dữ liệu thật.*
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Thuần** để gắn kết các màn hình sự cố và góp ý vào `AppNavigator`.
  * Cấu hình Token Request Interceptor trong `apiClient.ts` để mọi cuộc gọi API của Thuần đều tự động có header `Authorization`.
  * Phối hợp với **Hiếu** để hiển thị đúng ảnh VietQR động; hiển thị rõ ràng thông báo: việc quét mã là công cụ hỗ trợ điền thông tin chuyển khoản, không mặc nhiên là bằng chứng đã thanh toán cho đến khi BQL đối soát.
  * Phối hợp với **Việt Hoàng**: thống nhất nhà cung cấp Push Notification di động OS (FCM vs Expo Notifications theo `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 03]`), chia đều việc triển khai Mobile cùng Thuần khi có đầu việc cụ thể.
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Cấu hình `mobile/package.json` và cài đặt dependencies để chạy được lệnh `npm start`.
  * [ ] Đăng nhập thành công, lưu token và tự động chuyển từ `AuthScreen` vào `AppNavigator`.
  * [ ] Màn hình hồ sơ hiển thị đúng số phòng, diện tích và thông tin cá nhân từ `GET /api/auth/me`.
  * [ ] Màn hình hóa đơn hiển thị danh sách các tháng, hiển thị ảnh VietQR quét được qua app ngân hàng.
* **Tiêu chí hoàn thành (DoD):** App Mobile chạy được trên Android Emulator / iOS Simulator, tự động đính kèm JWT token trong request, hiển thị đầy đủ thông tin căn hộ và hóa đơn phí sinh hoạt.

---

### 5. 👤 THUẦN — Mobile Developer (Báo hỏng, Tiến độ sửa chữa, Đánh giá & Góp ý)
* **Phạm vi nghiệp vụ:** Lập trình luồng Báo hỏng sự cố trên điện thoại, hiển thị dòng thời gian trực quan (Timeline), màn hình Nghiệm thu chấm 1–5 sao, gửi góp ý BQL và đóng vai trò đầu mối phía Mobile cho dịch vụ upload ảnh/video sự cố.
* **Tệp tin phụ trách trực tiếp:**
  * [`mobile/src/screens/CreateTicketScreen.tsx`](mobile/src/screens/CreateTicketScreen.tsx)
  * [`mobile/src/screens/TicketTimelineScreen.tsx`](mobile/src/screens/TicketTimelineScreen.tsx)
  * [`mobile/src/screens/RatingScreen.tsx`](mobile/src/screens/RatingScreen.tsx)
  * [`mobile/src/screens/FeedbackScreen.tsx`](mobile/src/screens/FeedbackScreen.tsx)
* **API Dependencies phụ thuộc vào Backend:**
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/tickets`, `GET /api/tickets/my-tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/rate` (Hiếu).
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/feedback`, `GET /api/feedback/my-feedback` (Hiếu).
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Nguyệt** để gắn kết `RatingScreen` và `TicketTimelineScreen` vào navigation stack.
  * Phối hợp với **Việt Hoàng**: thống nhất nhà cung cấp Push Notification di động OS (`[CẦN XÁC NHẬN - QUYẾT ĐỊNH 03]`), chia đều việc triển khai Mobile cùng Nguyệt khi có đầu việc cụ thể.
  * Phối hợp với **Việt Hoàng & Hiếu** về tiêu chuẩn upload media: **TUYỆT ĐỐI KHÔNG GỬI CHUỖI BASE64 LÊN API**. Ảnh chụp sự cố phải tải lên dịch vụ lưu trữ (được nhóm thống nhất theo `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 04]`) lấy URL gửi vào `mediaUrl`. Bắt buộc kiểm tra định dạng và dung lượng tệp ngay trên UI Mobile (`[ĐỀ XUẤT — CHỜ XÁC NHẬN]`: ảnh $\le$ 5MB, video $\le$ 20MB; các đầu việc Mobile mới phát sinh sẽ chia đều giữa Thuần và Nguyệt). Lưu ý hàm `isValidMediaUrl()` trên Backend hiện tại mới kiểm tra độ dài và chặn Base64; việc ép buộc HTTPS và whitelist domain là `[ĐỀ XUẤT CẦN TRIỂN KHAI]`. Cơ chế dọn dẹp file mồ côi (Orphaned Assets) là `[ĐỀ XUẤT — CHỜ XÁC NHẬN]`.
  * Phối hợp với **Đức** (Web BQL) và **Oanh** (Web Thợ) để kiểm thử luồng cập nhật tiến độ thời gian thực.
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Gửi phiếu báo hỏng thành công, hiển thị thông báo tiếp nhận (hoặc cảnh báo phiếu trùng 24h).
  * [ ] Dòng thời gian Timeline cập nhật chính xác theo 5 bước: Mới gửi $\rightarrow$ Đã gán thợ $\rightarrow$ Đang sửa $\rightarrow$ Đã sửa xong $\rightarrow$ Đóng phiếu.
  * [ ] Nghiệm thu: Bấm xác nhận nhà đã sửa xong và gửi điểm đánh giá từ 1 đến 5 sao thành công.
  * [ ] Gửi ý kiến góp ý thành công và xem được nội dung phản hồi của BQL khi được trả lời.
* **Tiêu chí hoàn thành (DoD):** Toàn bộ luồng thao tác của cư dân từ khi bấm báo hỏng đến khi nghiệm thu chấm sao và gửi phản ánh hoạt động trơn tru trên App Mobile, xử lý phản hồi lỗi từ server rõ ràng.

---

### 6. 👤 ĐỨC — Web Developer (Quản lý Căn hộ, Điều phối Sự cố & Quản lý Biểu phí)
* **Phạm vi nghiệp vụ:** Lập trình các trang nghiệp vụ quản lý chính của Ban quản lý trên Cổng Web: Quản lý danh mục căn hộ và duyệt cư dân mới, Bảng điều phối chia việc sự cố (hiển thị cờ cảnh báo trùng), Lập biểu phí hàng tháng và đối soát thanh toán.
* **Tệp tin phụ trách trực tiếp:**
  * [`web/src/pages/ResidentsPage.tsx`](web/src/pages/ResidentsPage.tsx)
  * [`web/src/pages/TicketDispatchPage.tsx`](web/src/pages/TicketDispatchPage.tsx)
  * [`web/src/pages/BillingManagerPage.tsx`](web/src/pages/BillingManagerPage.tsx)
* **API Dependencies phụ thuộc vào Backend:**
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `GET /api/admin/users`, `GET /api/apartments/residents`, `PUT /api/apartments/residents/:id/approve` (hoặc `PUT /api/admin/users/:id/approve`) (Việt Hoàng). *Cảnh báo: Hiện Backend mới chỉ là mock rỗng, chưa thể gọi duyệt cư dân thật.*
  * `[API DỰ KIẾN — CHƯA TRIỂN KHAI]`: API danh mục phòng (`GET /api/rooms`, `POST /api/rooms`, `PUT /api/rooms/:id`) do **Việt Hoàng** phụ trách Backend (phạm vi API chi tiết đang `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 01]`).
  * `[ĐÃ TRIỂN KHAI]`: `GET /api/tickets`, `PUT /api/tickets/:id/assign` (Hiếu).
  * `[ĐÃ TRIỂN KHAI]`: `POST /api/invoices`, `GET /api/invoices`, `PUT /api/invoices/:id/status` (Hiếu).
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Đăng Hoàng** để đặt các trang vào đúng đường dẫn trong `AppRoutes.tsx`.
  * Phối hợp với **Việt Hoàng & Hiếu** về `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 05: Mô hình Quản lý Biểu phí]`: Hiện tại API `POST /api/invoices` nhận các trường phí trực tiếp. Đức thiết kế trang `BillingManagerPage.tsx` theo form nhập phí trực tiếp nếu chọn Phương án A, hoặc phối hợp để thêm màn hình quản lý đơn giá cấu hình nếu chọn Phương án B (Việt Hoàng là người chịu trách nhiệm chính phân tích kỹ thuật Backend/CSDL).
  * Phối hợp với **Hiếu** để xử lý mã lỗi `409 Conflict` khi lập trùng hóa đơn: hiển thị thông báo thân thiện *"Căn hộ này đã được lập hóa đơn tháng này rồi"*.
  * Đối soát hóa đơn & VietQR: Hiểu rõ mã VietQR chỉ giúp cư dân chuyển khoản nhanh; Đức phải đối soát sao kê ngân hàng rồi mới bấm xác nhận thanh toán (`PUT /api/invoices/:id/status`) để chuyển hóa đơn sang `PAID`.
  * Phối hợp với **Oanh** (Web Thợ) để kiểm thử thao tác gán việc: khi BQL bấm gán thợ, phiếu chuyển sang trạng thái `ASSIGNED` và xuất hiện trên trang của Thợ.
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Bảng căn hộ: Hiển thị danh sách cư dân, bấm nút duyệt tài khoản chuyển `isApproved` thành công (sau khi Backend hoàn thiện API).
  * [ ] Bảng chia việc: Hiển thị danh sách phiếu báo hỏng, làm nổi bật cờ cảnh báo phiếu trùng (`isDuplicate: true`), popup chọn thợ gán việc thành công.
  * [ ] Bảng hóa đơn: Lập hóa đơn/biểu phí thành công, tính tổng tiền tự động, đối soát sao kê và bấm xác nhận thanh toán (`PUT /:id/status`) thành công.
* **Tiêu chí hoàn thành (DoD):** Giao diện quản lý của BQL trực quan, hiển thị bảng dữ liệu có phân trang, lọc theo trạng thái và căn hộ, xử lý thành công toàn bộ luồng duyệt cư dân, gán thợ và đối soát hóa đơn.

---

### 7. 👤 OANH — Web Developer (Không gian làm việc Thợ, Soạn thông báo & Xử lý Góp ý)
* **Phạm vi nghiệp vụ:** Lập trình Không gian làm việc trên Web dành cho Thợ kỹ thuật (nhận việc, cập nhật tiến độ, kê khai vật tư thay thế, tải ảnh sửa xong), trang Soạn & phát thông báo tòa nhà của BQL, trang Tiếp nhận & trả lời góp ý cư dân, và đóng vai trò đầu mối Web cho tải ảnh nghiệm thu.
* **Tệp tin phụ trách trực tiếp:**
  * [`web/src/pages/TechnicianTasksPage.tsx`](web/src/pages/TechnicianTasksPage.tsx)
  * [`web/src/pages/AnnouncementsPage.tsx`](web/src/pages/AnnouncementsPage.tsx)
  * [`web/src/pages/FeedbackManagementPage.tsx`](web/src/pages/FeedbackManagementPage.tsx)
* **API Dependencies phụ thuộc vào Backend:**
  * `[ĐÃ TRIỂN KHAI]`: `GET /api/technician/tickets`, `PUT /api/technician/tickets/:id/status`, `POST /api/technician/tickets/:id/materials` (Hiếu).
  * `[CHƯA TRIỂN KHAI — MÃ STUB GIẢ LẬP]`: `POST /api/notifications`, `GET /api/notifications` (Việt Hoàng). *Cảnh báo: Hiện API thông báo là mock rỗng, chưa gửi dữ liệu thật.*
  * `[ĐÃ TRIỂN KHAI]`: `GET /api/feedback`, `POST /api/feedback/:id/reply`, `PUT /api/feedback/:id/reply`, `PATCH /api/feedback/:id/status` (Hiếu).
* **Phối hợp liên phân hệ:**
  * Phối hợp với **Đăng Hoàng** để phân quyền hiển thị menu: tài khoản vai trò `TECHNICIAN` chỉ thấy menu "Không gian làm việc Thợ", không thấy menu tài chính/admin.
  * Phối hợp với **Đức** để kiểm thử việc nhận phiếu sự cố được BQL phân công.
  * Phối hợp với **Thuần** (Mobile Cư dân): Khi Thợ bấm 'Đã sửa xong', cư dân trên mobile nhìn thấy trạng thái `COMPLETED` để vào nghiệm thu.
  * Phối hợp với **Việt Hoàng & Hiếu** về chuẩn kê khai vật tư (không gửi Base64) và giải pháp tải ảnh chụp sau sửa chữa tuân thủ bảo mật theo `[CẦN XÁC NHẬN - QUYẾT ĐỊNH 04]` (`[ĐỀ XUẤT — CHỜ XÁC NHẬN]` giới hạn ảnh 5MB, bảo mật API secret trên máy chủ; các đầu việc Web mới phát sinh sẽ chia đều giữa Oanh, Đức và Đăng Hoàng).
* **Checklist nghiệm thu & Test bắt buộc:**
  * [ ] Thợ kỹ thuật xem đúng danh sách các phiếu được chỉ định cho mình.
  * [ ] Thao tác nút bấm chuyển đổi trạng thái: Nhận việc (`IN_PROGRESS`) $\rightarrow$ Sửa xong (`COMPLETED`).
  * [ ] Form kê khai vật tư thay thế lưu thành công vào CSDL.
  * [ ] BQL soạn thông báo gửi thành công toàn tòa nhà hoặc riêng từng căn hộ (sau khi Backend hoàn thiện API).
  * [ ] BQL soạn nội dung trả lời góp ý cư dân thành công (`isResolved = true`).
* **Tiêu chí hoàn thành (DoD):** Hoàn thiện 100% không gian làm việc của thợ kỹ thuật và các màn hình tương tác thông báo, phản hồi góp ý; xác thực phân quyền chính xác theo vai trò.

---

## V. HƯỚNG DẪN KHỞI CHẠY MÔI TRƯỜNG PHÁT TRIỂN (LOCAL SETUP GUIDE)

### 1. Yêu cầu môi trường chung
* **Node.js**: Phiên bản 24.x LTS (khuyến nghị baseline) hoặc 22.x LTS. Không dùng Node.js 20 đã EOL.
* **Docker & Docker Compose**: Đang chạy trên máy (dùng cho PostgreSQL test database).
* **Git**: Đã cấu hình username và email.

### 2. Khởi chạy Backend & Kiểm thử (Clean-Room)
```bash
# 1. Di chuyển vào thư mục backend và cài đặt dependencies
cd backend
npm ci

# 2. Sinh Prisma Client
npm run prisma:generate

# 3. Chạy toàn bộ các unit tests độc lập (ghi nhận 197 tests tại thời điểm kiểm tra, không cần database)
npm test

# 4. Xem chi tiết hướng dẫn khởi chạy PostgreSQL container và 178 integration tests tại:
# 👉 backend/README.md
```

### 3. Khởi chạy Web Portal
```bash
cd web
npm install

# Lưu ý kỹ thuật quan trọng về Vite & Trạng thái Web:
# 1. Tệp entry point index.html: Theo kiến trúc của Vite (https://vite.dev/guide/), index.html là source code
#    và entry point mặc định cốt lõi để phân giải module nguồn (<script type="module" src="/src/main.tsx">).
#    Việc thiếu index.html là rào cản trực tiếp khiến Vite CLI không thể xác định entry point khi dev hoặc build.
# 2. Tệp cấu hình vite.config.ts: Mặc dù Vite có thể chạy zero-config cho các file tĩnh đơn giản (https://vite.dev/config/),
#    file này cần thêm trong dự án này để nạp plugin @vitejs/plugin-react (đã khai báo trong devDependencies) và xử lý JSX/TSX.
# 3. Scripts trong web/package.json gồm:
#    - "dev": "vite" (Chạy dev server)
#    - "build": "tsc && vite build" (Biên dịch TypeScript và đóng gói Vite)
#    - "preview": "vite preview" (Xem trước bản build)
# 4. Hiện trạng: Thư mục web/ chưa cài đặt node_modules và chưa được kiểm chứng build thực tế.
#    Phân biệt rõ: các tệp trang giao diện (web/src/pages/) hiện đã tồn tại dưới dạng khung scaffold (chưa hoàn thiện logic);
#    Cần bổ sung web/index.html và web/vite.config.ts trước khi chạy lệnh dev bên dưới:
npm run dev
```

### 4. Khởi chạy Mobile App (Dự kiến sau khi bổ sung cấu hình Expo)

> [!WARNING]
> **HIỆN TRẠNG KỸ THUẬT PHÂN HỆ MOBILE:**
> * Phân hệ Mobile hiện tại mới là **khung scaffold khởi tạo ban đầu**, chưa được cài đặt `node_modules` và chưa kiểm chứng chạy thực tế.
> * Trong tệp `mobile/package.json`, script `"start": "expo start"` đã được khai báo nhưng danh sách `dependencies` **chưa chứa gói `expo`** (chỉ mới có `react`, `react-native`, `@react-navigation/...`, `axios`). Do đó, nếu chạy `npm start` ngay sẽ gặp lỗi thiếu Expo CLI.
> * Không tự ý sửa `package.json` hay cài đặt package trong nhiệm vụ tài liệu này; các thành viên phụ trách Mobile (**Nguyệt**, **Thuần**) cần đối chiếu cấu hình Expo tương thích với phiên bản `react-native` (0.74.1) trước khi bắt đầu.
> * Các lệnh dưới đây là **quy trình dự kiến** để khởi chạy app sau khi hoàn thiện dependencies:

```bash
# Quy trình dự kiến (sau khi hoàn thiện khai báo Expo dependency trong mobile/package.json):
cd mobile

# 1. Cài đặt dependencies (sau khi đã bổ sung expo)
npm install

# 2. Khởi chạy app cư dân qua Expo bundler (dự kiến)
npm start
```

---

## VI. QUY ƯỚC KIỂM THỬ, QUY TRÌNH GIT & PHỐI HỢP (WORKFLOW CONVENTIONS)

### 1. Quy ước Phân nhánh Git (Branching Strategy)
* **`main`**: Nhánh chính của dự án. Theo **chính sách nội bộ của nhóm**, `main` được quy ước là nhánh bảo vệ (Protected Branch theo quy ước nội bộ): chỉ chứa mã nguồn đã vượt qua kiểm tra biên dịch, unit tests và CI Pipeline; tuyệt đối không push code trực tiếp lên `main`.
  * *Phân biệt quy ước nội bộ và cấu hình GitHub:* Chính sách bảo vệ nhánh `main` hiện là cam kết kỷ luật nội bộ của nhóm (`[QUY ƯỚC NỘI BỘ]`). Việc kích hoạt cấu hình Branch Protection Rule hoặc Ruleset kỹ thuật thực tế trên GitHub repository (`[CẦN XÁC MINH CẤU HÌNH GITHUB THỰC TẾ]`) cần được Trưởng nhóm (Repo Admin - Việt Hoàng) thiết lập và xác minh trực tiếp trên phần Settings của GitHub repository; hiện tại chưa có bằng chứng xác nhận cấu hình này đã được bật trên GitHub.
* **Trạng thái Nhánh Git Thực tế & Quy ước Đặt tên:**
  * **Các nhánh đã xác minh tồn tại trong Git repository (`git branch -a`):**
    * `main`: Nhánh chính của repository.
    * `Hiếu`: Nhánh phát triển local của Hiếu (Backend Core & DB).
    * `remotes/origin/Đăng-Hoàng`: Nhánh phát triển remote của Đăng Hoàng (Web Lead).
  * **Quy ước phân nhánh cho các thành viên còn lại `[ĐỀ XUẤT CẦN TẠO KHI BẮT ĐẦU PHÁT TRIỂN]`:**
    * Việt Hoàng: `viet-hoang` (hoặc `feature/auth-users`)
    * Đức: `duc` (hoặc `feature/web-management`)
    * Oanh: `oanh` (hoặc `feature/web-technician`)
    * Nguyệt: `nguyet` (hoặc `feature/mobile-core`)
    * Thuần: `thuan` (hoặc `feature/mobile-tickets`)
    * *Ghi chú:* Các nhánh cá nhân của Việt Hoàng, Đức, Oanh, Nguyệt, Thuần **không xuất hiện trong kết quả `git branch -a` tại thời điểm kiểm tra**; đây là các nhánh dự kiến sẽ tạo khi các thành viên bắt đầu triển khai code. Quy ước đặt tên nhánh thống nhất: `feature/<ten-thanh-vien>-<chuc-nang>` hoặc `<ten-thanh-vien>`.
* **Quy trình tạo Pull Request (PR) & Code Review `[QUY ƯỚC NHÓM ĐỀ XUẤT]`:**
  1. Trước khi mở PR, chạy kiểm tra biên dịch và unit tests tại local:
     ```bash
     cd backend && npx tsc --noEmit && npm test
     ```
  2. Kiểm tra khoảng trắng thừa:
     ```bash
     git diff --check
     ```
  3. Mở Pull Request nhắm vào nhánh `main`.
  4. GitHub Actions CI sẽ tự động kích hoạt kiểm tra 15 bước: Typecheck, Whitespace, Unit tests (ghi nhận 197 tests tại thời điểm kiểm tra), Khởi tạo Docker test container, PL/pgSQL Least-Privilege ACL checks, Integration tests (ghi nhận 178 assertions tại thời điểm kiểm tra), và Safe Teardown.
  5. Chỉ khi CI báo trạng thái **Success (Xanh)**, **Việt Hoàng (Leader)** mới tiến hành review và chấp thuận Merge vào `main`.

### 2. Quy định Khi Thay đổi Schema CSDL hoặc Danh mục API
* **Khi cần sửa đổi CSDL ([`schema.prisma`](backend/src/database/schema.prisma)):** Thành viên có nhu cầu bắt buộc phải thảo luận và được **Hiếu** phê duyệt. Hiếu chịu trách nhiệm cập nhật schema, chạy migration trên DB test và thông báo cho toàn đội.
* **Khi cần thêm/sửa API Endpoint:** Bắt buộc cập nhật thống nhất trên [`backend/src/common/constants/api-endpoints.ts`](backend/src/common/constants/api-endpoints.ts) (do **Việt Hoàng** phụ trách Final Owner) và đồng bộ sang Web/Mobile.

### 3. Ma trận Kiểm thử Luồng Liên Ứng dụng (End-to-End Checklist)
Trước mỗi cột mốc nghiệm thu lớn (Release Milestone), nhóm bắt buộc cùng nhau kiểm thử 3 kịch bản xuyên suốt:

* [ ] **Kịch bản 1 — Báo hỏng và Khắc phục sự cố:**
  Cư dân (Thuần - Mobile) gửi phiếu $\rightarrow$ BQL (Đức - Web) nhận cảnh báo trùng và gán việc $\rightarrow$ Thợ (Oanh - Web) nhận việc, kê khai vật tư, chụp ảnh xong $\rightarrow$ Cư dân (Thuần - Mobile) nghiệm thu, chấm 5 sao $\rightarrow$ Phiếu đóng `CLOSED`.
* [ ] **Kịch bản 2 — Lập hóa đơn và Đối soát thanh toán:**
  BQL (Đức - Web) lập biểu phí tháng mới $\rightarrow$ CSDL chặn trùng lặp $\rightarrow$ Cư dân (Nguyệt - Mobile) xem chi tiết và quét mã VietQR động $\rightarrow$ Cư dân chuyển khoản $\rightarrow$ BQL (Đức - Web) đối soát ngân hàng và bấm xác nhận nộp tiền $\rightarrow$ Hóa đơn chuyển trạng thái `PAID`.
* [ ] **Kịch bản 3 — Phát thông báo và Tiếp nhận góp ý:**
  BQL (Oanh - Web) phát thông báo $\rightarrow$ Cư dân (Nguyệt - Mobile) nhận thông báo trên bảng tin $\rightarrow$ Cư dân (Thuần - Mobile) gửi phản ánh nội quy $\rightarrow$ BQL (Oanh - Web) tiếp nhận và phản hồi câu trả lời $\rightarrow$ Cư dân xem câu trả lời và phản ánh đóng `isResolved: true`.
