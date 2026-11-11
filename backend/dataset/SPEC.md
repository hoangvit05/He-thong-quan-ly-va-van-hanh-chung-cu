# ĐẶC TẢ KỸ THUẬT DATASET (DATASET SPECIFICATION)
## Dự án Quản lý và Vận hành Chung cư

**Phân hệ:** `backend/dataset/`  
**Nguồn chân lý (Source of Truth):** `backend/src/database/schema.prisma`  
**Tham chiếu kiểm toán:** Báo cáo kiểm toán Milestone 1  

---

## 1. NGUYÊN TẮC CỐT LÕI
1. **Schema Compliance**: Tuân thủ chính xác 100% Prisma schema hiện tại. Không tự ý thêm bớt field, enum hay model.
2. **Business Rule Alignment**: Dữ liệu sinh ra phải vượt qua toàn bộ logic xác thực của các controller và validator trong hệ thống.
3. **Deterministic Reproducibility**: Dữ liệu được sinh đơn định từ PRNG với seed cố định, cho ra cùng một tập kết quả qua các lần chạy.
4. **Relational Integrity**: Đảm bảo toàn vẹn dữ liệu quan hệ và cây khóa ngoại.

---

## 2. QUY MÔ DATASET ĐÃ ĐƯỢC PHÊ DUYỆT (LOCKED SCALE)

| Model | Quy mô cố định | Ràng buộc nghiệp vụ chính |
| :--- | :---: | :--- |
| **`Room`** | **100** | Phân bổ các tầng 1–10. Đủ cả 3 trạng thái (`OCCUPIED`, `VACANT`, `MAINTENANCE`). |
| **`User`** | **108 – 158** | • **1** `ADMIN`<br>• **2** `BQL`<br>• **5** `TECHNICIAN`<br>• **100 – 150** `RESIDENT` (Gồm cả cư dân đã duyệt `isApproved=true` và cư dân mới chờ duyệt `isApproved=false`). |
| **`Ticket`** | **150 – 200** | Đủ 5 trạng thái vòng đời. Có sự cố riêng phòng và khu vực chung. Có các phiếu đánh dấu `isDuplicate = true`. |
| **`Invoice`** | **400 – 600** | Lịch sử 3–6 tháng của các căn hộ có người ở. Tuân thủ `@@unique([roomId, month])`. |
| **`Payment`** | **300 – 500** | Thuộc về các hóa đơn hợp lệ. Tổng tiền các lần nộp khớp với `Invoice.paidAmount`. Không có trường hợp overpayment. |
| **`Feedback`** | **30 – 50** | Cư dân gửi phản ánh. Gồm phản ánh đã giải quyết (`isResolved=true`, có `reply`) và chưa giải quyết. |
| **`Notification`** | **20 – 30** | Do Admin hoặc BQL đăng. Gồm thông báo toàn tòa nhà (`targetRoom=null`) và thông báo gửi đích danh số phòng. |
| **`MediaAsset`** | **0** (hoặc chỉ asset thật) | Tuyệt đối **không tạo bản ghi `MediaAsset` giả**. Trong môi trường seed chuẩn, số lượng là **0**. |

---

## 3. LƯỢC ĐỒ DỮ LIỆU & QUAN HỆ KHÓA NGOẠI

### 3.1. Các Enums (5 Enums)
1. `Role`: `ADMIN`, `BQL`, `TECHNICIAN`, `RESIDENT`
2. `TicketStatus`: `PENDING`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CLOSED`
3. `InvoiceStatus`: `UNPAID`, `PARTIALLY_PAID`, `PAID`
4. `RoomStatus`: `VACANT`, `OCCUPIED`, `MAINTENANCE`
5. `PaymentMethod`: `VIETQR`, `BANK_TRANSFER`, `CASH`

### 3.2. Thứ tự nạp dữ liệu (Foreign Key Seeding Order)
Để không vi phạm ràng buộc toàn vẹn quan hệ của PostgreSQL, thứ tự nạp bắt buộc là:
1. `Room` (Căn hộ - Master data)
2. `User` (Người dùng - Tham chiếu `roomId` nullable)
3. `Notification` (Thông báo - Tham chiếu `authorId` của User)
4. `Invoice` (Hóa đơn - Tham chiếu `roomId`)
5. `Payment` (Giao dịch - Tham chiếu `invoiceId`)
6. `Ticket` (Sự cố - Tham chiếu `roomId`, `residentId`, `technicianId`)
7. `Feedback` (Góp ý - Tham chiếu `residentId`, `roomId`)
8. `MediaAsset` (Tài sản media - Tham chiếu `uploaderId`, `ticketId`)

---

## 4. QUY TẮC NGHIỆP VỤ ĐÃ ĐƯỢC XÁC MINH CẦN ÁP DỤNG VÀO DATASET

### 4.1. Căn hộ (`Room`) & Người dùng (`User`)
- `Room.roomNumber` là duy nhất trên toàn hệ thống (vd: `"101"`, `"202"`, `"1005"`).
- `Room.area`: Số thực dương (Float), đại diện cho diện tích $m^2$ (từ 50.0 đến 120.0).
- `Room.status`: Tỷ lệ phân bổ trạng thái (ví dụ ~70% `OCCUPIED`, ~20% `VACANT`, ~10% `MAINTENANCE`) chỉ mang tính chất **đề xuất tham khảo** cho độ phong phú thực tế, không phải ràng buộc kỹ thuật cứng.
- `User.roomId`:
  - Tài khoản `ADMIN`, `BQL`, `TECHNICIAN`: Bắt buộc `roomId = null`.
  - Tài khoản `RESIDENT`: Liên kết tới một `Room` cụ thể (một phòng có thể có từ 1 đến nhiều cư dân). Cư dân mới có thể tạm thời có `roomId = null` hoặc đã gán phòng nhưng `isApproved = false`.
- `User.password`: Bắt buộc lưu trữ chuỗi Bcrypt hash chuẩn ($2a$/$2b$, 10 salt rounds). Mật khẩu mặc định có thể là `Password123!` để thuận tiện cho testing.

### 4.2. Báo hỏng Sự cố (`Ticket`)
- **Phân loại `category`**: Chuỗi văn bản tiếng Việt ngắn gọn, không quá 50 ký tự (Điện, Nước, Thang máy, Khóa cửa, Internet, PCCC...).
- **Mô tả `description`**: Từ 5 đến 2000 ký tự.
- **Phạm vi vị trí**:
  - Sự cố phòng riêng: Có `roomId` hợp lệ.
  - Sự cố khu vực chung: `roomId = null`.
- **Ràng buộc `technicianId`**:
  - Khi `status` là `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`: Bắt buộc phải có `technicianId` liên kết tới User có `role = TECHNICIAN`.
  - Khi `status` là `PENDING`: Phiếu mới tạo ban đầu có `technicianId = null`. Trường hợp phiếu bị BQL thu hồi gán việc từ `ASSIGNED` về `PENDING`, `technicianId` có thể vẫn lưu giá trị của thợ cũ (theo hành vi thực tế của controller).
  - Khi `status` là `CLOSED`:
    - Nếu đóng sau nghiệm thu (`COMPLETED` $\rightarrow$ `CLOSED`): Có `technicianId`.
    - Nếu bị hủy ngay từ khi còn chờ xử lý (`PENDING` $\rightarrow$ `CLOSED`): `technicianId = null`.
- **Kê khai vật tư (`materials`) & Ảnh hoàn thành (`completedMediaUrl`)**:
  - Cả hai trường đều là **TÙY CHỌN (OPTIONAL)** ở tầng CSDL và validation. Không bắt buộc phải có khi chuyển sang `COMPLETED` hay `CLOSED`.
  - Trong dataset, để dữ liệu chân thực, một phần các phiếu `COMPLETED` và `CLOSED` sẽ có kê khai vật tư thay thế thực tế (dưới dạng text mô tả, không chứa Base64).
- **Đánh giá (`rating` & `ratingComment`)**:
  - Chỉ xuất hiện khi phiếu đã nghiệm thu đóng hoàn tất (`status = CLOSED`).
  - `rating`: Số nguyên từ 1 đến 5 sao. `ratingComment`: Tối đa 500 ký tự.
- **Thuật toán lọc trùng 24 giờ (`isDuplicate`)**:
  - Hai phiếu được coi là trùng lặp nếu thỏa mãn: cùng `category.trim()`, cùng `roomId` (hoặc cùng `residentId` nếu khu vực chung), và phiếu sau được tạo trong vòng 24 giờ kể từ khi phiếu trước được tạo khi phiếu trước đang ở `PENDING`, `ASSIGNED`, hoặc `IN_PROGRESS`.
  - **CHỈ CÓ PHIẾU TẠO SAU ĐƯỢC ĐÁNH DẤU `isDuplicate = true`**. Phiếu gốc ban đầu giữ nguyên `isDuplicate = false`.

### 4.3. Hóa đơn (`Invoice`) & Giao dịch (`Payment`)
- **Ràng buộc duy nhất**: `@@unique([roomId, month])` cấm tuyệt đối sinh 2 hóa đơn cho cùng một căn hộ trong cùng một tháng `YYYY-MM`.
- **Công thức tính tổng tiền**:
  $$\text{totalAmount} = \text{managementFee} + \text{parkingFee} + \text{waterFee} + \text{otherFee}$$
  Tất cả các trường tiền tệ đều dùng `Decimal(12, 2)`, không âm, tối đa $999,999,999.99$.
- **Tính toán số tiền đã nộp**:
  $$\text{Invoice.paidAmount} = \sum \text{Payment.amount}$$
  Không có trường hợp thanh toán vượt tổng tiền ($\text{paidAmount} \le \text{totalAmount}$).
- **Xác định `InvoiceStatus`**:
  - $\text{paidAmount} == \text{totalAmount} \implies \text{PAID}$
  - $0 < \text{paidAmount} < \text{totalAmount} \implies \text{PARTIALLY_PAID}$
  - $\text{paidAmount} == 0 \implies \text{UNPAID}$
- **Giao dịch (`Payment`)**:
  - Mỗi bản ghi liên kết tới một `Invoice.id`.
  - `paymentMethod`: `VIETQR`, `BANK_TRANSFER`, `CASH`.
  - `transactionCode`: Mã giao dịch ngân hàng (tối đa 100 ký tự, không chứa Base64).
  - `paidAt`: Thời điểm thanh toán $\ge$ `Invoice.createdAt`.

### 4.4. Hòm thư Góp ý (`Feedback`)
- `residentId`: Bắt buộc liên kết tới User có `role = RESIDENT`.
- `roomId`: Phòng của cư dân, hoặc `null` nếu là phản ánh chung cho tòa nhà.
- Nếu `isResolved = true`: Thường đi kèm `reply` (nội dung phản hồi từ BQL) và `repliedAt` ($\ge$ `createdAt`).
- Nếu `isResolved = false`: `reply = null`, `repliedAt = null`.

### 4.5. Thông báo Tòa nhà (`Notification`)
- `authorId`: Phải là User có `role = ADMIN` hoặc `role = BQL`.
- `targetRoom`: Kiểu chuỗi (`String?`).
  - Nếu gửi toàn tòa nhà: `targetRoom = null`.
  - Nếu gửi riêng một căn hộ: `targetRoom` là giá trị `Room.roomNumber` (ví dụ: `"101"`, `"502"`). Lưu ý: **Không lưu `Room.id`**.

### 4.6. Tài sản Đa phương tiện (`MediaAsset`)
- Bảng `MediaAsset` phục vụ cơ chế Direct Signed Upload và xác thực qua Cloudinary Admin API.
- Để đảm bảo tính trung thực tuyệt đối của dữ liệu:
  - **Không tạo bản ghi giả trong bảng `MediaAsset`** (`count = 0` trong dataset chuẩn).
  - Đối với các trường `Ticket.mediaUrl` hoặc `Ticket.completedMediaUrl`, dataset có thể sử dụng giá trị `null` hoặc mock URL không chứa domain `res.cloudinary.com` (theo cơ chế fallback cho phép của backend).

