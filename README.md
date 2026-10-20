# BẢNG PHÂN CÔNG CÔNG VIỆC DỰ ÁN
**Dự án:** Hệ thống Quản lý và Vận hành Chung cư

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN (VỊ TRÍ FILE CỦA TỪNG THÀNH VIÊN)

> **LƯU Ý:** Toàn bộ khung dự án và các liên kết đã được tạo sẵn. Mọi người chỉ tạo/sửa code **bên trong đúng các file/thư mục được phân công cho mình** dưới đây, tuyệt đối không sửa các file cấu hình chung của người khác để tránh xung đột mã nguồn khi gộp code (Merge Conflict).

```text
He-thong-quan-ly-va-van-hanh-chung-cu/
│
├── backend/                       # MÁY CHỦ & DỮ LIỆU (Việt Hoàng & Hiếu)
│   ├── src/
│   │   ├── app.module.ts          # ĐÃ LINK SẴN TẤT CẢ MODULES (Leader quản lý)
│   │   ├── main.ts                # Server entry point (Port 5000)
│   │   ├── common/
│   │   │   ├── constants/api-endpoints.ts # Danh mục URL API chuẩn toàn hệ thống
│   │   │   ├── types/api-response.ts      # Cấu trúc phản hồi chuẩn { success, data, message }
│   │   │   └── utils/                     # [Hiếu] Bộ tiện ích lá chắn bảo vệ CSDL
│   │   ├── database/
│   │   │   ├── schema.prisma      # [Hiếu] Thiết kế bảng CSDL toàn hệ thống
│   │   │   └── prisma.ts          # [Hiếu] Kết nối PrismaClient dùng chung
│   │   └── modules/
│   │       ├── auth/              # [Việt Hoàng] Đăng nhập, đổi mật khẩu, cấp JWT
│   │       ├── users/             # [Việt Hoàng] Admin quản lý tài khoản BQL & Thợ, duyệt cư dân
│   │       ├── notifications/     # [Việt Hoàng] Thông báo đẩy tức thời & Socket.IO
│   │       ├── tickets/           # [Hiếu] Luồng Báo hỏng, lọc trùng, gán thợ, kê khai vật tư, chấm sao
│   │       ├── invoices/          # [Hiếu] Biểu phí định kỳ hàng tháng & mã VietQR
│   │       └── feedback/          # [Hiếu] Hòm thư góp ý & phản hồi nội quy
│   ├── package.json
│   └── tsconfig.json
│
├── web/                           # CỔNG QUẢN LÝ WEB (Đăng Hoàng, Đức, Oanh)
│   ├── src/
│   │   ├── api/
│   │   │   ├── endpoints.ts       # Danh mục API dùng chung
│   │   │   └── axiosClient.ts     # Axios client cấu hình sẵn JWT Token
│   │   ├── constants/menu.ts      # Cấu hình danh sách Menu link sẵn
│   │   ├── components/Layout/     # [Đăng Hoàng] Khung Web chung: Sidebar, Header, AppLayout
│   │   ├── routes/
│   │   │   └── AppRoutes.tsx      # ĐÃ LINK SẴN TẤT CẢ TRANG VÀO ROUTER (Leader quản lý)
│   │   └── pages/
│   │       ├── LoginPage.tsx              # [Đăng Hoàng] Đăng nhập Web
│   │       ├── AdminAccountsPage.tsx      # [Đăng Hoàng] Admin quản lý tài khoản BQL & Thợ
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

## I. DANH SÁCH CHỨC NĂNG HỆ THỐNG

### 1. App trên Điện thoại (Dành cho Cư dân):
* **Tài khoản:** Đăng nhập, đổi mật khẩu, xem thông tin phòng của mình.
* **Gửi phiếu báo hỏng:** Chọn loại sự cố (điện, nước, internet...), viết mô tả, chụp ảnh hoặc quay video chỗ hỏng gửi đi.
* **Xem tiến độ sửa chữa:** Dòng thời gian trực quan (Mới gửi $\rightarrow$ Đã gán thợ $\rightarrow$ Đang sửa $\rightarrow$ Đã xong).
* **Nghiệm thu & Đánh giá:** Bấm xác nhận nhà đã sửa xong và chấm từ 1 đến 5 sao (kèm nhận xét).
* **Bảng tin & Thông báo đẩy tức thời:** Nhận thông báo đẩy (Push Notification) thời gian thực khi có tiến độ sự cố hoặc thông báo khẩn từ BQL.
* **Hóa đơn & Phí dịch vụ:** Xem chi tiết các khoản phí sinh hoạt hàng tháng (quản lý, gửi xe, nước...), kiểm tra trạng thái thanh toán và quét mã VietQR để chuyển khoản nhanh.
* **Hòm thư góp ý:** Gửi phản ánh nội quy, an ninh, vệ sinh tới Ban quản lý và theo dõi câu trả lời phản hồi.

### 2. Trang Web Admin & Ban Quản Lý:
* **Admin hệ thống:** Đăng nhập, tạo tài khoản và phân quyền cho nhân viên Ban quản lý, tạo tài khoản cho Thợ kỹ thuật.
* **Quản lý Căn hộ & Cư dân:** Duyệt tài khoản cho cư dân mới đăng ký, xem danh mục phòng và cư dân từng căn hộ.
* **Bảng chia việc & Điều phối sự cố:** Tiếp nhận phiếu báo hỏng, nhận diện cảnh báo phiếu gửi trùng, bấm chọn gán việc cho Thợ kỹ thuật.
* **Gửi thông báo:** Soạn tin tức gửi toàn chung cư hoặc riêng từng căn hộ, phát thông báo đẩy tức thời.
* **Quản lý Hóa đơn & Biểu phí:** Lập biểu phí định kỳ hàng tháng, theo dõi tình trạng nộp tiền của từng căn hộ, xuất mã VietQR thanh toán.
* **Xử lý Hòm thư góp ý:** Xem danh sách ý kiến cư dân và soạn nội dung phản hồi gửi lại.

### 3. Trang Web dành cho Thợ Kỹ Thuật:
* **Đăng nhập:** Đăng nhập tài khoản Thợ do Admin cấp.
* **Nhận việc tức thời:** Xem danh sách phiếu sự cố được BQL phân công; nhận thông báo thời gian thực khi có việc mới.
* **Cập nhật tiến độ:** Bấm 'Nhận việc' $\rightarrow$ 'Đang sửa' $\rightarrow$ 'Hoàn thành'.
* **Kê khai vật tư:** Điền danh sách vật tư/linh kiện đã thay thế và tải ảnh chụp nghiệm thu sau khi sửa xong.

---

## II. BẢNG PHÂN CÔNG CÔNG VIỆC CHI TIẾT (6 THÀNH VIÊN / 7 PHÂN HỆ)

### 📊 BẢNG MA TRẬN PHÂN CÔNG NHANH (QUICK OVERVIEW)

| Thành viên | Phân hệ | Vị trí File / Thư mục chính | Nhiệm vụ chính & Chức năng |
| :--- | :--- | :--- | :--- |
| **Việt Hoàng** *(Leader, Backend)* / **Đăng Hoàng** *(Web)* | 🖥️ Backend & Web | `backend/src/modules/auth/`, `users/`, `notifications/`<br>`web/src/pages/LoginPage.tsx`, `AdminAccountsPage.tsx` | Việt Hoàng: Khung server, Xác thực JWT, Quản lý tài khoản BQL & Thợ, Socket.IO realtime, Duyệt PR; Đăng Hoàng: Layout web |
| **Hiếu** | 🗄️ Backend & DB | `backend/src/database/schema.prisma`<br>`backend/src/modules/tickets/`, `invoices/`, `feedback/` | Thiết kế CSDL toàn hệ thống, Luồng sự cố & lọc trùng 24h, Lập hóa đơn & VietQR động, Hòm thư góp ý |
| **Nguyệt** | 📱 Mobile App | `mobile/src/screens/AuthScreen.tsx`, `ProfileScreen.tsx`<br>`NotificationScreen.tsx`, `InvoiceScreen.tsx` | Đăng nhập chọn phòng theo danh mục, Hồ sơ căn hộ, Bảng tin tòa nhà, Tra cứu hóa đơn & quét VietQR |
| **Thuần** | 📱 Mobile App | `mobile/src/screens/CreateTicketScreen.tsx`, `RatingScreen.tsx`<br>`TicketTimelineScreen.tsx`, `FeedbackScreen.tsx` | Báo hỏng (ảnh/video), Tiến độ sửa chữa (Timeline), Nghiệm thu & chấm 1-5 sao, Gửi góp ý nội quy |
| **Đức** | 🌐 Web Quản lý | `web/src/pages/ResidentsPage.tsx`<br>`TicketDispatchPage.tsx`, `BillingManagerPage.tsx` | Quản lý căn hộ & duyệt cư dân mới, Bảng điều phối sự cố & cảnh báo trùng, Lập & quản lý biểu phí định kỳ |
| **Oanh** | 🌐 Web Thợ & BQL | `web/src/pages/TechnicianTasksPage.tsx`<br>`AnnouncementsPage.tsx`, `FeedbackManagementPage.tsx` | Không gian làm việc của Thợ (nhận việc/vật tư/ảnh sau sửa), Soạn & phát thông báo, Trả lời hòm thư góp ý |

---

### 👥 CHI TIẾT CÔNG VIỆC CỦA TỪNG THÀNH VIÊN

#### 1. 👤 VIỆT HOÀNG (Trưởng nhóm — Phụ trách Khung Server & Xác thực) / ĐĂNG HOÀNG (Phụ trách Web Admin)
* **📁 Vị trí file phụ trách:**
  * **Backend — Việt Hoàng:** [`backend/src/main.ts`](file:///backend/src/main.ts), [`backend/src/modules/auth/`](file:///backend/src/modules/auth/), [`backend/src/modules/users/`](file:///backend/src/modules/users/), [`backend/src/modules/notifications/`](file:///backend/src/modules/notifications/)
  * **Web — Đăng Hoàng:** [`web/src/components/Layout/`](file:///web/src/components/Layout/), [`web/src/routes/AppRoutes.tsx`](file:///web/src/routes/AppRoutes.tsx), [`web/src/pages/LoginPage.tsx`](file:///web/src/pages/LoginPage.tsx), [`web/src/pages/AdminAccountsPage.tsx`](file:///web/src/pages/AdminAccountsPage.tsx)
* **🎯 Nhiệm vụ chính:**
  * **Việt Hoàng:** Dựng khung máy chủ Backend; viết API Đăng nhập, Đổi mật khẩu, cấp JWT token cho 4 nhóm vai trò (Admin, BQL, Thợ, Cư dân); viết API Admin tạo tài khoản BQL & Thợ kỹ thuật và API duyệt tài khoản cư dân mới; xây dựng hệ thống Push Notification và Socket.IO real-time; kiểm tra code và duyệt Pull Request (PR) toàn dự án trên GitHub.
  * **Đăng Hoàng:** Dựng khung Layout Web chung (Sidebar, Header, AppLayout) và phụ trách các trang đăng nhập, quản lý tài khoản Admin.
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 🔒 **Bẫy mật khẩu:** Bắt buộc dùng `hashPassword()` trong [`backend/src/common/utils/security.ts`](file:///backend/src/common/utils/security.ts) hoặc `bcryptjs.hash()` trước khi lưu vào DB. **Tuyệt đối không lưu plain-text password**.
  * ⚡ **Bẫy Socket.IO:** Quản lý danh sách socket trên bộ nhớ RAM (`Map`), **không lưu Socket ID vào PostgreSQL** gây nghẽn I/O.
  * 🎟️ **Bẫy Token:** JWT Token là phi trạng thái (Stateless), không cần lưu access token vào database.

---

#### 2. 👤 HIẾU (Kỹ sư Dữ liệu & Nghiệp vụ Cốt lõi — DB, Sự cố, Hóa đơn & Góp ý)
* **📁 Vị trí file phụ trách:**
  * **Cơ sở dữ liệu:** [`backend/src/database/schema.prisma`](file:///backend/src/database/schema.prisma), [`backend/src/database/prisma.ts`](file:///backend/src/database/prisma.ts)
  * **Bộ tiện ích chung:** [`backend/src/common/utils/`](file:///backend/src/common/utils/) (`validation.ts`, `security.ts`, `vietqr.ts`)
  * **Modules API:** [`backend/src/modules/tickets/`](file:///backend/src/modules/tickets/), [`backend/src/modules/invoices/`](file:///backend/src/modules/invoices/), [`backend/src/modules/feedback/`](file:///backend/src/modules/feedback/)
* **🎯 Nhiệm vụ chính:**
  * Thiết kế schema hoàn chỉnh 7 bảng CSDL, quan hệ hai chiều, ràng buộc `@@unique([roomId, month])` và chỉ mục `@@index`.
  * Khởi tạo kết nối Prisma Singleton và xây dựng bộ công cụ lá chắn bảo vệ dữ liệu dùng chung.
  * Lập trình **Module Báo hỏng sự cố (`tickets`)**: API tạo phiếu, thuật toán lọc phiếu trùng trong 24h, đổi trạng thái phiếu, gán việc cho thợ, kê khai vật tư sạch, nghiệm thu chấm 1–5 sao.
  * Lập trình **Module Hóa đơn (`invoices`)**: Lập biểu phí tháng mới, chốt snapshot cố định `totalAmount`, bắt lỗi trùng lặp (`409 Conflict`), sinh link VietQR động, ghi nhận lịch sử `Payment`.
  * Lập trình **Module Hòm thư góp ý (`feedback`)**: Tiếp nhận góp ý từ cư dân và lưu câu trả lời phản hồi của BQL (`isResolved`, `repliedAt`).
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 🛡️ Sử dụng bộ lọc `isValidMediaUrl()` và `sanitizeMaterials()` để chặn đứng mọi chuỗi Base64 rác lọt vào database.

---

#### 3. 👤 NGUYỆT (Lập trình Mobile — Tài khoản, Bảng tin & Hóa đơn phí)
* **📁 Vị trí file phụ trách:**
  * **Navigation:** [`mobile/src/navigation/AppNavigator.tsx`](file:///mobile/src/navigation/AppNavigator.tsx)
  * **Màn hình:** [`mobile/src/screens/AuthScreen.tsx`](file:///mobile/src/screens/AuthScreen.tsx), [`mobile/src/screens/ProfileScreen.tsx`](file:///mobile/src/screens/ProfileScreen.tsx), [`mobile/src/screens/NotificationScreen.tsx`](file:///mobile/src/screens/NotificationScreen.tsx), [`mobile/src/screens/InvoiceScreen.tsx`](file:///mobile/src/screens/InvoiceScreen.tsx)
* **🎯 Nhiệm vụ chính:**
  * Thiết kế giao diện chung và bộ điều hướng (Tabs/Stack) của App Cư dân.
  * Lập trình màn hình Đăng ký/Đăng nhập: Form đăng ký **bắt buộc chọn số phòng từ Dropdown/Picker có sẵn từ bảng Room**, tuyệt đối không nhập tay.
  * Lập trình màn hình Trang chủ: Hiển thị hồ sơ cá nhân và thông tin phòng của mình.
  * Lập trình màn hình Bảng tin: Nhận thông báo đẩy và đọc tin tức từ BQL.
  * Lập trình màn hình Tra cứu hóa đơn: Xem chi tiết các khoản phí hàng tháng, trạng thái Đã nộp/Chưa nộp và hiển thị mã VietQR chuyển khoản.
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 📱 **Bẫy mã QR:** Hệ thống **KHÔNG** lưu file ảnh mã QR vào database. Khi hiển thị, chỉ cần gọi API `GET /api/invoices/:id/vietqr` để nhận URL ảnh VietQR động theo chuẩn quốc gia, hoặc render mã QR trực tiếp từ thông tin hóa đơn.

---

#### 4. 👤 THUẦN (Lập trình Mobile — Luồng Báo hỏng sự cố & Hòm thư góp ý)
* **📁 Vị trí file phụ trách:**
  * **Màn hình:** [`mobile/src/screens/CreateTicketScreen.tsx`](file:///mobile/src/screens/CreateTicketScreen.tsx), [`mobile/src/screens/TicketTimelineScreen.tsx`](file:///mobile/src/screens/TicketTimelineScreen.tsx), [`mobile/src/screens/RatingScreen.tsx`](file:///mobile/src/screens/RatingScreen.tsx), [`mobile/src/screens/FeedbackScreen.tsx`](file:///mobile/src/screens/FeedbackScreen.tsx)
* **🎯 Nhiệm vụ chính:**
  * Lập trình màn hình Gửi phiếu báo hỏng: Chọn loại sự cố (Điện/Nước/Internet...), viết mô tả, chụp ảnh hoặc quay video đính kèm gửi đi.
  * Lập trình màn hình Tiến độ sửa chữa: Dòng thời gian trực quan (Mới gửi $\rightarrow$ Đã gán thợ $\rightarrow$ Đang sửa $\rightarrow$ Đã xong).
  * Lập trình màn hình Nghiệm thu & Đánh giá: Bấm nút xác nhận sửa xong và chấm từ 1 đến 5 sao (kèm nhận xét `ratingComment`).
  * Lập trình màn hình Hòm thư góp ý: Soạn phản ánh nội quy, an ninh, vệ sinh tới BQL và theo dõi câu trả lời phản hồi.
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 📸 **Bẫy Base64:** Tuyệt đối **KHÔNG** gửi chuỗi Base64 (`data:image/jpeg;base64,...`) lên API (server của Hiếu sẽ từ chối với lỗi HTTP 400). Phía Mobile bắt buộc phải tải file ảnh lên Cloud (Cloudinary, S3 hoặc server) để lấy đường link `https://...` rồi mới gửi link này vào trường `mediaUrl`.

---

#### 5. 👤 ĐỨC (Lập trình Web Quản lý — Cư dân, Điều phối sự cố & Quản lý Hóa đơn)
* **📁 Vị trí file phụ trách:**
  * **Trang Web:** [`web/src/pages/ResidentsPage.tsx`](file:///web/src/pages/ResidentsPage.tsx), [`web/src/pages/TicketDispatchPage.tsx`](file:///web/src/pages/TicketDispatchPage.tsx), [`web/src/pages/BillingManagerPage.tsx`](file:///web/src/pages/BillingManagerPage.tsx)
* **🎯 Nhiệm vụ chính:**
  * Lập trình trang Quản lý Căn hộ & Cư dân: Quản lý danh mục phòng (số phòng, tầng, diện tích $m^2$), xem cư dân theo phòng, nút duyệt tài khoản cư dân mới (`isApproved`).
  * Lập trình trang Bảng chia việc - Điều phối sự cố: Tiếp nhận danh sách phiếu báo hỏng, **hiển thị cảnh báo phiếu trùng (`isDuplicate`)**, popup chọn gán việc cho Thợ kỹ thuật.
  * Lập trình trang Quản lý Hóa đơn & Phí dịch vụ: Lập biểu phí định kỳ hàng tháng, theo dõi tình trạng nộp phí của từng căn hộ, xuất mã QR chuyển khoản.
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 🧾 **Bẫy trùng hóa đơn:** Cơ sở dữ liệu đã kích hoạt ràng buộc duy nhất `@@unique([roomId, month])`. Khi tạo hóa đơn, nếu nhận mã lỗi `HTTP 409 Conflict`, giao diện cần hiển thị thông báo thân thiện: *"Căn hộ này đã được lập hóa đơn tháng này rồi, không thể tạo thêm"*.
  * 💳 **Mã VietQR:** Xuất mã QR thanh toán động qua API `GET /api/invoices/:id/vietqr`, không lưu file ảnh tĩnh vào database.

---

#### 6. 👤 OANH (Lập trình Web Vận hành — Thợ kỹ thuật, Thông báo & Góp ý)
* **📁 Vị trí file phụ trách:**
  * **Trang Web:** [`web/src/pages/TechnicianTasksPage.tsx`](file:///web/src/pages/TechnicianTasksPage.tsx), [`web/src/pages/AnnouncementsPage.tsx`](file:///web/src/pages/AnnouncementsPage.tsx), [`web/src/pages/FeedbackManagementPage.tsx`](file:///web/src/pages/FeedbackManagementPage.tsx)
* **🎯 Nhiệm vụ chính:**
  * Lập trình trang dành riêng cho Thợ kỹ thuật: Danh sách phiếu được giao, nút thao tác đổi trạng thái ('Nhận việc' $\rightarrow$ 'Đang sửa' $\rightarrow$ 'Hoàn thành'), form kê khai vật tư thay thế và tải ảnh sau khi sửa xong.
  * Lập trình trang Soạn & Gửi thông báo: Soạn tin tức gửi toàn chung cư hoặc từng căn hộ, kích hoạt gửi thông báo đẩy.
  * Lập trình trang Tiếp nhận & Xử lý Góp ý: Xem danh sách góp ý/kiến nghị của cư dân và soạn nội dung phản hồi gửi lại.
* **⚠️ Lưu ý kỹ thuật bắt buộc:**
  * 📸 **Bẫy ảnh nghiệm thu:** Khi thợ tải ảnh sửa xong (`completedMediaUrl`), bắt buộc tải ảnh lên Cloud trước để lấy link URL `https://...` rồi mới gửi lên API. Tuyệt đối không gửi chuỗi Base64 làm nghẽn DB.
  * 🔧 **Bẫy kê khai vật tư:** Ô nhập vật tư của Thợ chỉ ghi văn bản thuần hoặc danh mục JSON (`[{"name": "Bóng đèn", "qty": 2}]`), **không nhúng ảnh chụp hóa đơn vào trường này**.

---

## III. 🛡️ BỘ CÔNG CỤ TIỆN ÍCH DÙNG CHUNG CỦA HỆ THỐNG (DO HIẾU XÂY DỰNG)

Tất cả thành viên khi code Backend gọi trực tiếp các bộ tiện ích đã được viết sẵn tại:
1. [`backend/src/database/prisma.ts`](file:///backend/src/database/prisma.ts): Instance kết nối cơ sở dữ liệu dùng chung (Singleton) cho toàn bộ các module.
2. [`backend/src/common/utils/validation.ts`](file:///backend/src/common/utils/validation.ts): Bộ lọc `isValidMediaUrl()` và `sanitizeMaterials()` tự động ngăn chặn toàn bộ dữ liệu Base64 rác.
3. [`backend/src/common/utils/security.ts`](file:///backend/src/common/utils/security.ts): Bộ băm mật khẩu an toàn theo chuẩn OWASP (`hashPassword()` và `comparePassword()`).
4. [`backend/src/common/utils/vietqr.ts`](file:///backend/src/common/utils/vietqr.ts): Bộ sinh mã VietQR động chuẩn quốc gia NAPAS 24/7 (`generateVietQRUrl()`).

---

## IV. 🚀 HƯỚNG DẪN KHỞI CHẠY & KIỂM THỬ TÍCH HỢP (CLEAN-ROOM)

Xem chi tiết hướng dẫn thiết lập môi trường sạch, khởi tạo PostgreSQL test container cô lập, chạy 197 unit tests và 178 integration tests tại:
👉 [**backend/README.md**](file:///backend/README.md)
