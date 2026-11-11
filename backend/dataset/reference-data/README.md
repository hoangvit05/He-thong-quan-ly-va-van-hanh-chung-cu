# DỮ LIỆU THAM CHIẾU VÀ NỘI DUNG TIẾNG VIỆT (REFERENCE DATA & VIETNAMESE CONTENT)

Thư mục: `backend/dataset/reference-data/`  
Phân hệ: Milestone 3 — Reference Data & Vietnamese Content Library

---

## 1. Mục đích và phạm vi

Thư mục này chứa toàn bộ các từ điển dữ liệu tham chiếu và thư viện nội dung tiếng Việt chuẩn hóa, đóng vai trò làm mẫu sinh dữ liệu (content templates) cho các generator ở các Milestone tiếp theo (M4–M7).

Dữ liệu được biên soạn 100% bằng tiếng Việt tự nhiên, phù hợp với ngữ cảnh quản lý, vận hành và sinh hoạt tại các khu chung cư đô thị Việt Nam.

---

## 2. Cấu trúc tệp dữ liệu

### A. `ticket-categories.json`
Định nghĩa danh mục sự cố kỹ thuật và vận hành tòa nhà. Bao gồm 12 danh mục chuẩn:
- `dien-chieu-sang`: Hệ thống điện & chiếu sáng
- `cap-thoat-nuoc`: Cấp thoát nước & vệ sinh
- `thang-may`: Hệ thống thang máy
- `pccc-bao-chay`: Phòng cháy chữa cháy & cứu nạn
- `cua-khoa-nhom-kinh`: Cửa, khóa & nhôm kính
- `mang-internet-vien-thong`: Mạng Internet & viễn thông
- `ve-sinh-canh-quan`: Vệ sinh & cảnh quan môi trường
- `dieu-hoa-thong-gio`: Điều hòa & thông gió
- `bai-do-xe-giao-thong`: Bãi đỗ xe & giao thông nội bộ
- `khu-vuc-chung-tien-ich`: Khu vực chung & tiện ích cư dân
- `an-ninh-kiem-soat`: An ninh & kiểm soát ra vào
- `chong-tham-xay-dung`: Chống thấm & kết cấu xây dựng

**Cấu trúc mỗi category:**
```json
{
  "id": "dien-chieu-sang",
  "name": "Hệ thống điện & chiếu sáng",
  "description": "Mô tả phạm vi sự cố",
  "examples": ["Ví dụ 1", "Ví dụ 2"]
}
```

### B. `vietnamese-content.json`
Thư viện mẫu nội dung động dùng để sinh ngẫu nhiên có kiểm soát:
1. `tickets` (60 kịch bản sự cố): Phủ đều cả 12 danh mục, mỗi danh mục tối thiểu 5 kịch bản thực tế, bao gồm cả sự cố nội bộ căn hộ lẫn khu vực chung tòa nhà. Tiêu đề súc tích, mô tả chi tiết từ 5–2000 ký tự phản ánh triệu chứng, thời điểm, bối cảnh.
2. `feedbacks` (20 phản ánh cư dân): Đa dạng chủ đề (thái độ nhân viên, tiếng ồn thi công, vệ sinh, an ninh, bãi xe, tiện ích), kết hợp cả phản hồi tích cực, trung lập và khiếu nại mang tính xây dựng.
3. `feedbackReplies` (10 phản hồi BQL): Văn phong chuẩn mực, lịch sự, chuyên nghiệp, nêu rõ quy trình xử lý hoặc biện pháp khắc phục mà không hứa hẹn phi thực tế.
4. `announcements` (20 thông báo ban quản lý): Bao phủ các chủ đề bảo trì thang máy, súc xả bể nước, máy phát điện, kiểm tra PCCC, diệt côn trùng, an ninh trật tự, bãi xe, thu phí và sự kiện cộng đồng.

---

## 3. Chính sách an toàn dữ liệu và bản quyền (Privacy & PII Safety)

- **Không sử dụng dữ liệu cư dân thực tế:** Toàn bộ nội dung trong thư viện là dữ liệu tổng hợp giả lập (synthetic data), không chứa bất kỳ tên tuổi cư dân thật, số điện thoại thật, email cá nhân, số chứng minh nhân dân/CCCD hay tài khoản ngân hàng thật nào.
- **Không hardcode định danh phòng cố định:** Các mô tả sự cố và thông báo được thiết kế dạng template mở, không gán cứng số phòng cụ thể nhằm giúp các Generator ở Milestone 4–7 dễ dàng ánh xạ linh hoạt với các căn hộ được sinh ra.
- **Nguồn gốc dữ liệu (Public Data References):**
  - Nội dung được biên soạn tổng hợp và xây dựng nội bộ (synthetic generation) dựa trên kinh nghiệm thực tế về tiêu chuẩn vận hành nhà chung cư tại Việt Nam (Thông tư 02/2016/TT-BXD, Thông tư 28/2016/TT-BXD về Quy chế quản lý sử dụng nhà chung cư).
  - Không import trực tiếp dữ liệu thô từ các tập dữ liệu mở nước ngoài (như NYC 311) để tránh sai lệch đặc thù văn hóa và hạ tầng kỹ thuật chung cư Việt Nam.

