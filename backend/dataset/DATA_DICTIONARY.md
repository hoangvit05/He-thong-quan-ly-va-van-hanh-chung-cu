# TỪ ĐIỂN DỮ LIỆU DATASET (DATA DICTIONARY)
## Hệ thống Quản lý và Vận hành Chung cư

Tài liệu mô tả chi tiết toàn bộ các thực thể, trường dữ liệu, ràng buộc kỹ thuật và quy tắc sinh dữ liệu (Data Generation Rules) tương thích 100% với `backend/src/database/schema.prisma`.

---

## 1. THỰC THỂ: `Room` (Căn hộ / Phòng)
Quản lý danh mục các căn hộ trong tòa nhà chung cư.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng bởi PostgreSQL |
| `roomNumber` | `String` | Không | Không | `@unique` | Số phòng duy nhất trong tòa nhà | Sinh theo định dạng: `{floor * 100 + unit}` (vd: 101, 102, 201.. 1010). Đảm bảo 100 số phòng duy nhất. |
| `floor` | `Int` | Không | Không | Không | Số tầng của căn hộ | Số nguyên từ 1 đến 10. |
| `area` | `Float` | Không | Không | Không | Diện tích căn hộ ($m^2$) | Số thực từ 45.0 đến 125.0, làm tròn 1 chữ số thập phân (vd: 65.5, 72.0, 95.5). |
| `status` | `RoomStatus` | Không | `VACANT` | Không | Tình trạng cư trú của căn hộ | Giá trị thuộc Enum `RoomStatus`. Phân bổ tham khảo: ~70 `OCCUPIED`, ~20 `VACANT`, ~10 `MAINTENANCE`. |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm tạo bản ghi | Mốc thời gian trước thời điểm hiện tại từ 6 đến 12 tháng. |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | $\ge createdAt$, ngẫu nhiên trước thời điểm hiện tại. |

---

## 2. THỰC THỂ: `User` (Tài khoản & Người dùng)
Quản lý toàn bộ người dùng trong hệ thống (Quản trị viên, Ban quản lý, Thợ kỹ thuật, Cư dân).

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `username` | `String` | Không | Không | `@unique` | Tên đăng nhập duy nhất | Định dạng chữ thường không dấu: `admin`, `bql_01`, `tho_dien_01`, `cudan_101_1`. Đảm bảo không trùng lặp. |
| `password` | `String` | Không | Không | Không | Mật khẩu băm Bcrypt | Băm chuỗi mật khẩu chuẩn (vd: `Password123!`) bằng `bcryptjs` với salt rounds = 10 ($2a$ hoặc $2b$). |
| `fullName` | `String` | Không | Không | Không | Họ và tên đầy đủ | Sinh họ tên tiếng Việt thực tế từ danh sách họ + đệm + tên (vd: Nguyễn Văn An, Trần Thị Mai). |
| `phone` | `String` | Có | `null` | Không | Số điện thoại liên hệ | Chuỗi 10 chữ số đầu số Việt Nam hợp lệ (09x, 08x, 03x). |
| `email` | `String` | Có | `null` | `@unique` | Địa chỉ email duy nhất | Sinh email theo tên và mã ngẫu nhiên: `username@chungcu.vn`. |
| `role` | `Role` | Không | `RESIDENT` | `@@index([role, isApproved])` | Vai trò người dùng | 1 `ADMIN`, 2 `BQL`, 5 `TECHNICIAN`, 100–150 `RESIDENT`. |
| `roomId` | `Int` | Có | `null` | `@@index([roomId])`, FK $\rightarrow$ `Room.id` | Căn hộ cư dân đang cư trú | `null` cho Admin, BQL, Thợ. Với Cư dân: liên kết với các phòng có `status = OCCUPIED`. |
| `isApproved` | `Boolean` | Không | `false` | `@@index([role, isApproved])` | Đã phê duyệt tài khoản | Admin, BQL, Thợ: luôn `true`. Cư dân: ~90% `true`, ~10% `false` (chờ duyệt). |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm tạo tài khoản | $\ge Room.createdAt$. |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | $\ge createdAt$. |

---

## 3. THỰC THỂ: `Ticket` (Phiếu Báo hỏng Sự cố)
Quản lý sự cố kỹ thuật trong căn hộ và khu vực chung của tòa nhà.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `title` | `String` | Có | `null` | Không | Tiêu đề sự cố ngắn gọn | Tiêu đề ngắn tiếng Việt (tối đa 100 ký tự): vd: "Hỏng đèn ban công", "Chập điện ổ cắm". |
| `category` | `String` | Không | Không | `@@index([roomId, category])` | Hạng mục sự cố kỹ thuật | Giá trị chuẩn từ `ticket-categories.json` (Điện, Nước, Thang máy, Khóa cửa, Khác...). |
| `description` | `String` | Không | Không | Không | Mô tả hiện trạng sự cố | Văn bản tiếng Việt chi tiết từ 15 đến 300 ký tự mô tả lỗi. |
| `mediaUrl` | `String` | Có | `null` | Không | Link ảnh hiện trường | `null` hoặc mock URL an toàn không chứa `res.cloudinary.com`. |
| `status` | `TicketStatus` | Không | `PENDING` | `@@index([status, createdAt])` | Trạng thái vòng đời xử lý | Đủ 5 trạng thái: `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`. |
| `roomId` | `Int` | Có | `null` | `@@index([roomId, category])`, FK $\rightarrow$ `Room.id` | Căn hộ phát sinh sự cố | `null` nếu là sự cố khu vực chung (~15% tổng số ticket); có `roomId` nếu là sự cố phòng riêng (~85%). |
| `residentId` | `Int` | Không | Không | `@@index([residentId])`, FK $\rightarrow$ `User.id` | Người gửi yêu cầu báo hỏng | ID của User có `role = RESIDENT`. Nếu là sự cố phòng thì resident phải thuộc phòng đó. |
| `technicianId`| `Int` | Có | `null` | `@@index([technicianId])`, FK $\rightarrow$ `User.id` | Thợ kỹ thuật được gán việc | Bắt buộc có khi `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`. Có thể có hoặc `null` khi `CLOSED` và `PENDING`. |
| `materials` | `String` | Có | `null` | Không | Kê khai danh mục vật tư | Tùy chọn. Mô tả vật tư thay thế cho một phần các phiếu `COMPLETED` và `CLOSED` (vd: "1 Aptomat 32A"). |
| `completedMediaUrl`| `String` | Có | `null` | Không | Link ảnh sau sửa chữa | Tùy chọn. Mock URL an toàn cho một phần các phiếu `COMPLETED` và `CLOSED`. |
| `rating` | `Int` | Có | `null` | Không | Đánh giá sao của cư dân | Số nguyên từ 1 đến 5. Chỉ xuất hiện khi `status = CLOSED` (nghiệm thu đạt). |
| `ratingComment`| `String` | Có | `null` | Không | Nhận xét khi nghiệm thu | Nhận xét tiếng Việt (vd: "Thợ sửa nhiệt tình, cẩn thận") khi có `rating`. |
| `isDuplicate` | `Boolean` | Không | `false` | Không | Cờ cảnh báo trùng 24 giờ | `true` đối với các phiếu gửi sau trong vòng 24h cùng vị trí và category. Phiếu cũ gốc giữ `false`. |
| `createdAt` | `DateTime` | Không | `now()` | `@@index([status, createdAt])` | Thời điểm gửi phiếu | Phân bổ trong 3 tháng gần nhất. |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | $\ge createdAt$. |

---

## 4. THỰC THỂ: `Invoice` (Hóa đơn phí dịch vụ định kỳ)
Quản lý nghĩa vụ tài chính hàng tháng của từng căn hộ.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `roomId` | `Int` | Không | Không | `@@unique([roomId, month])`, FK $\rightarrow$ `Room.id` | Căn hộ chịu hóa đơn | Chỉ lập cho các căn hộ có cư dân (`status = OCCUPIED`). |
| `month` | `String` | Không | Không | `@@unique([roomId, month])`, `@@index([month, status])` | Kỳ thu phí (YYYY-MM) | Chuỗi định dạng chuẩn: `"2026-08"`, `"2026-09"`, `"2026-10"`. |
| `managementFee`| `Decimal(12,2)`| Không| `0` | Không | Phí quản lý chung cư | Bằng $\text{area} \times 12,000 \text{ VND/m}^2$, chuyển sang Decimal. |
| `parkingFee` | `Decimal(12,2)`| Không | `0` | Không | Phí trông giữ phương tiện | Bội số của phí xe máy (100,000) và ô tô (1,200,000). |
| `waterFee` | `Decimal(12,2)`| Không | `0` | Không | Tiền nước sinh hoạt | Tính theo khối lượng nước tiêu thụ (vd: 150,000 – 450,000 VND). |
| `otherFee` | `Decimal(12,2)`| Không | `0` | Không | Chi phí dịch vụ khác | Phí rác thải, bảo trì đột xuất (vd: 50,000 – 200,000 VND). |
| `totalAmount` | `Decimal(12,2)`| Không | Không | Không | Tổng số tiền phải nộp | $=\text{managementFee} + \text{parkingFee} + \text{waterFee} + \text{otherFee}$. |
| `paidAmount` | `Decimal(12,2)`| Không | `0` | Không | Tổng tiền đã nộp lũy kế | Bằng tổng các `Payment.amount` thuộc hóa đơn này. |
| `dueDate` | `DateTime` | Có | `null` | Không | Hạn nộp tiền dịch vụ | Ngày 15 hoặc 20 của tháng thu phí. |
| `status` | `InvoiceStatus`| Không| `UNPAID`| `@@index([roomId, status])` | Trạng thái thanh toán | Khớp với `paidAmount`: `PAID` nếu đủ 100%, `PARTIALLY_PAID` nếu nộp 1 phần, `UNPAID` nếu = 0. |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm lập hóa đơn | Ngày đầu tiên của tháng thu phí. |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | $\ge createdAt$. |

---

## 5. THỰC THỂ: `Payment` (Giao dịch Thanh toán Hóa đơn)
Lịch sử từng lần cư dân đóng tiền cho một hóa đơn.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `invoiceId` | `Int` | Không | Không | `@@index([invoiceId])`, FK $\rightarrow$ `Invoice.id` | Hóa đơn được thanh toán | Liên kết tới hóa đơn có trạng thái `PARTIALLY_PAID` hoặc `PAID`. |
| `amount` | `Decimal(12,2)`| Không | Không | Không | Số tiền đóng trong giao dịch | Giá trị dương $\le \text{totalAmount} - \text{currentPaid}$. |
| `paymentMethod`| `PaymentMethod`| Không| `VIETQR`| Không | Hình thức nộp tiền | Phân bổ cả 3 loại: `VIETQR` (~70%), `BANK_TRANSFER` (~20%), `CASH` (~10%). |
| `transactionCode`| `String` | Có | `null` | `@@index([transactionCode])` | Mã chuẩn chi ngân hàng | Chuỗi mã ngân hàng duy nhất: `FT26{timestamp}{random4}` cho VietQR/Bank. |
| `note` | `String` | Có | `null` | Không | Ghi chú chuyển tiền | Nội dung: `P{roomNumber} nop tien thang {month}`. |
| `paidAt` | `DateTime` | Không | `now()` | Không | Thời điểm giao dịch hoàn tất | $\ge Invoice.createdAt$. |

---

## 6. THỰC THỂ: `Feedback` (Hòm thư Góp ý & Phản ánh)
Góp ý của cư dân về vệ sinh, an ninh, dịch vụ và phản hồi của Ban quản lý.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `residentId` | `Int` | Không | Không | `@@index([residentId])`, FK $\rightarrow$ `User.id` | Cư dân gửi phản ánh | User có `role = RESIDENT`. |
| `roomId` | `Int` | Có | `null` | FK $\rightarrow$ `Room.id` | Căn hộ gửi góp ý | Trùng với `User.roomId` hoặc `null` nếu là góp ý cảnh quan chung. |
| `title` | `String` | Không | Không | Không | Tiêu đề phản ánh | Tiêu đề tiếng Việt thực tế (vd: "Phản ánh tiếng ồn sau 22h", "Mùi rác tầng 7"). |
| `content` | `String` | Không | Không | Không | Nội dung kiến nghị chi tiết | Văn bản phản ánh từ 20 đến 200 ký tự. |
| `reply` | `String` | Có | `null` | Không | Phản hồi của BQL | Câu trả lời lịch sự, rõ phương án xử lý từ BQL khi `isResolved = true`. |
| `isResolved` | `Boolean` | Không | `false` | `@@index([isResolved])` | Trạng thái giải quyết | ~60% `true` (đã phản hồi), ~40% `false` (đang chờ xử lý). |
| `repliedAt` | `DateTime` | Có | `null` | Không | Thời điểm BQL trả lời | $\ge createdAt$ nếu `isResolved = true`; `null` nếu `isResolved = false`. |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm gửi phản ánh | Phân bổ trong 3 tháng qua. |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | $\ge createdAt$. |

---

## 7. THỰC THỂ: `Notification` (Thông báo Tòa nhà)
Bản tin phát hành từ Ban quản lý hoặc Quản trị viên tới cư dân.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `title` | `String` | Không | Không | Không | Tiêu đề thông báo | Tiêu đề tiếng Việt chuẩn mực (vd: "Thông báo bảo trì thang máy tòa nhà", "Lịch phun thuốc muỗi"). |
| `content` | `String` | Không | Không | Không | Nội dung chi tiết thông báo | Văn bản hành chính chung cư từ 30 đến 500 ký tự. |
| `targetRoom` | `String` | Có | `null` | `@@index([targetRoom])` | Căn hộ nhận đích danh | `null` (phát toàn khu, ~80%) hoặc chuỗi số phòng (vd: `"101"`, gửi riêng, ~20%). **Lưu ý: Không lưu Room.id**. |
| `authorId` | `Int` | Có | `null` | FK $\rightarrow$ `User.id` | Người phát hành thông báo | Bắt buộc là User có `role = ADMIN` hoặc `role = BQL`. |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm phát hành | Phân bổ đều trong 3–6 tháng qua. |

---

## 8. THỰC THỂ: `MediaAsset` (Tài nguyên Đa phương tiện Cloudinary)
Bảng metadata quản lý tệp tin đã xác thực từ Cloudinary Admin API.

| Tên trường (Field) | Kiểu Prisma | Nullable | Giá trị mặc định | Khóa / Chỉ mục / Quan hệ | Ý nghĩa nghiệp vụ | Quy tắc sinh dữ liệu (Generation Rules) |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `id` | `Int` | Không | `autoincrement()` | `@id` | Khóa chính tự tăng | Tự động tăng |
| `publicId` | `String` | Không | Không | `@unique`, `@@index` | Cloudinary public_id | Định danh duy nhất trên Cloudinary |
| `url` | `String` | Không | Không | `@@index([url])` | HTTPS Secure URL | URL xem tệp |
| `resourceType`| `String` | Không | `"image"` | Không | Loại tài nguyên | `"image"` hoặc `"video"` |
| `deliveryType`| `String` | Không | `"authenticated"`| Không | Kiểu phân phối CDN | `"upload"`, `"authenticated"`, `"private"` |
| `purpose` | `String` | Không | Không | `@@index([purpose, ticketId])`| Phân hệ sử dụng | `"tickets"`, `"materials"`, `"announcements"` |
| `bytes` | `Int` | Không | Không | Không | Dung lượng tệp thực tế | Số nguyên dương $\le 5,242,880$ (ảnh) hoặc $\le 20,971,520$ (video) |
| `format` | `String` | Không | Không | Không | Đuôi định dạng tệp | `png`, `jpg`, `webp`, `mp4` |
| `width` | `Int` | Có | `null` | Không | Chiều rộng ảnh/video | Pixels |
| `height` | `Int` | Có | `null` | Không | Chiều cao ảnh/video | Pixels |
| `duration` | `Float` | Có | `null` | Không | Thời lượng video (giây) | Số thực |
| `uploaderId` | `Int` | Không | Không | `@@index([uploaderId])`, FK $\rightarrow$ `User.id` | Người tải lên | User sở hữu phiên upload |
| `ticketId` | `Int` | Có | `null` | `@@index([purpose, ticketId])`, FK $\rightarrow$ `Ticket.id` | Phiếu sự cố liên kết | Liên kết ticket |
| `isConfirmed` | `Boolean` | Không | `false` | Không | Trạng thái xác thực Admin API | Bắt buộc `true` nếu tồn tại |
| `confirmedAt` | `DateTime` | Có | `null` | Không | Thời điểm xác minh | DateTime |
| `createdAt` | `DateTime` | Không | `now()` | Không | Thời điểm tạo | DateTime |
| `updatedAt` | `DateTime` | Không | `@updatedAt` | Không | Thời điểm cập nhật cuối | DateTime |
| **Quy tắc Dataset:** | | | | | | **Số lượng mặc định = 0** (không tạo dữ liệu giả mạo cho bảng này). |

