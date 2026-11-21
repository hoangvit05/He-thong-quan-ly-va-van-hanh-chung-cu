# Mobile Resident App

Ứng dụng cư dân dùng Expo SDK 51, React Native 0.74.5 và React 18.2.0. Phần của Nguyệt gồm điều hướng, xác thực/phiên đăng nhập, hồ sơ, hóa đơn/VietQR và bảng tin.

## Cấu trúc và trách nhiệm

Cấu trúc Mobile trong workspace của Nguyệt. Giữ nguyên điều hướng và cơ chế xác thực hiện có; cập nhật tiến độ trên README gốc chỉ bằng checklist có sẵn.

| Vị trí | Nội dung |
| --- | --- |
| [App.tsx](App.tsx) | SafeAreaProvider, AuthProvider và cổng đăng nhập/khôi phục phiên |
| [src/api/](src/api/) | Danh mục API, Axios/JWT, token store, kiểu dữ liệu và tải dữ liệu |
| [src/auth/AuthContext.tsx](src/auth/AuthContext.tsx) | Đăng nhập, khôi phục phiên và đăng xuất |
| [src/components/ResidentUI.tsx](src/components/ResidentUI.tsx) | Thành phần giao diện dùng chung |
| [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx) | Điều hướng và liên kết màn hình của Thuần |
| [src/screens/](src/screens/) | Các màn hình nghiệp vụ |
| [test/resident.test.cjs](test/resident.test.cjs) | Kiểm thử màn hình, quản lý phiên và App.tsx |
| `.local-build/` | Bundle, APK và log QA phát sinh trên máy; Git bỏ qua |
| `.local-work/` | Ghi chú lưu trữ và file phát sinh cá nhân; Git bỏ qua |

Nguyệt phụ trách AuthScreen, ProfileScreen, InvoiceScreen và NotificationScreen. CreateTicketScreen, TicketTimelineScreen, RatingScreen và FeedbackScreen thuộc Thuần; ngày 21/11/2026 đã được triển khai thêm các luồng cơ bản bằng API hiện có. Chưa nghiệm thu Backend/thiết bị thật; chọn và upload ảnh/video, push notification còn lại.

## Chức năng đã triển khai

- Đăng nhập bằng username/email/điện thoại; lưu JWT bằng AsyncStorage và gắn Bearer token khi gọi API. Chỉ nhận RESIDENT đã được duyệt.
- Khôi phục phiên qua /api/auth/me; đăng xuất hoặc 401 trở về đăng nhập. Mất mạng cho phép thử lại; phản hồi phiên cũ không xóa phiên mới.
- Hồ sơ cá nhân, phòng, tầng, diện tích; xử lý tài khoản chưa gắn phòng; đổi mật khẩu có xác nhận.
- Lọc hóa đơn theo tháng, chi tiết phí/lịch sử thanh toán, số dư và VietQR từ Backend; thử lại ảnh QR lỗi và tải lại trạng thái thanh toán.
- Danh sách/chi tiết thông báo, phân trang và kéo để tải lại.
- Trạng thái tải/lỗi/rỗng, chặn gửi form lặp và hủy request cũ khi đổi màn hình.
- Báo hỏng: danh mục, tiêu đề/mô tả, căn hộ hoặc khu vực chung; hiển thị mã phiếu và cảnh báo trùng do Backend trả về. Chưa đính kèm ảnh/video.
- Tiến độ: danh sách phiếu cá nhân có phân trang, chi tiết, thợ phụ trách, trạng thái hiện tại và nút tải lại. Backend chưa cung cấp lịch sử từng lần chuyển trạng thái; không suy diễn phiếu đóng là đã sửa xong, chưa có cập nhật realtime.
- Nghiệm thu: chỉ mở phiếu đang COMPLETED, chọn 1–5 sao, nhập nhận xét và xác nhận trước khi gửi ratingComment/đóng phiếu.
- Góp ý: kiểm tra dữ liệu, gửi góp ý, xem danh sách cá nhân và phản hồi/trạng thái xử lý của BQL.

## Chạy và kiểm tra

Từ thư mục `mobile`:

```powershell
npm ci
npm run typecheck
npm test
npm run export:android
npm start -- --android
```

- `npm ci` cài đúng phiên bản trong lockfile; không cần chạy lại khi dependencies không đổi.
- `export:android` xuất bundle vào `.local-build/android`, không cần Backend hoặc máy giả lập.
- `npm start -- --android` cần máy giả lập/thiết bị Android và Expo Go tương thích SDK 51. Bản Expo Go đã dùng để thử là 2.31.2.
- Bộ test dùng API, AsyncStorage và native giả lập; không chứng minh Backend/thiết bị thật đã nghiệm thu.
- [Workflow Mobile checks](../.github/workflows/mobile.yml) cài dependencies, typecheck, test và xuất Android bundle. Workflow mới cần được đưa lên PR rồi xác nhận kết quả GitHub Actions.

### Kết nối Backend

| Môi trường | API URL |
| --- | --- |
| Android Emulator, Backend cùng máy | `http://10.0.2.2:5000` — mặc định trong code |
| iOS Simulator, Backend cùng máy | `http://localhost:5000` |
| Điện thoại hoặc Backend ở máy khác | `EXPO_PUBLIC_API_URL` theo địa chỉ được cấp |

Tạo `mobile/.env` từ [.env.example](.env.example) khi cần cấu hình URL riêng. Khởi động lại Metro sau khi đổi cấu hình. Thiết bị thật và Backend trên máy cá nhân cần cùng mạng LAN. Không đưa mật khẩu/token hoặc secret Backend vào `EXPO_PUBLIC_*`.

Backend cần cung cấp các API sau:

| Chức năng | API |
| --- | --- |
| Đăng nhập | POST /api/auth/login |
| Hồ sơ/khôi phục phiên | GET /api/auth/me |
| Đổi mật khẩu | POST /api/auth/change-password |
| Hóa đơn căn hộ | GET /api/invoices/my-invoice |
| VietQR và số dư | GET /api/invoices/:id/vietqr |
| Thông báo | GET /api/notifications |

Mobile chỉ nhận cư dân đã được duyệt. Thông tin căn hộ và phạm vi thông báo do Backend xác định. VietQR dùng số dư từ Backend; chỉ BQL đối soát và xác nhận thanh toán, Mobile không tự ghi giao dịch.

### Metro lỗi đường dẫn có dấu trên Windows

Nếu gặp `Invalid character in header content ["X-React-Native-Project-Root"]`, dùng ổ đĩa tạm để chạy từ đường dẫn không dấu. Cách này đã giúp Metro trả `packager-status:running` trong lần kiểm tra 20/11/2026; không di chuyển dự án hoặc sửa node_modules.

Mở PowerShell tại **thư mục gốc repo**, rồi chạy:

```powershell
$mobileRepoPath = (Get-Location).Path
if (Get-PSDrive -Name R -ErrorAction SilentlyContinue) { throw 'R: is already in use.' }
subst.exe R: $mobileRepoPath
if ($LASTEXITCODE -ne 0) { throw 'Cannot create temporary drive.' }
try {
    Set-Location R:\mobile
    npm start -- --android
} finally {
    Set-Location $mobileRepoPath
    subst.exe R: /D
}
```

Nếu R: đã được dùng, dừng để chọn ký tự ổ trống khác; không ghi đè ổ hiện có. Nhấn Ctrl+C khi kết thúc chạy thử.

## Kết quả kiểm tra ghi nhận ngày 21/11/2026

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript | PASS |
| Màn hình, phiên và khởi tạo App | 42/42 PASS — gồm 14 test mới cho phần Thuần |
| Bundle Android | PASS — 737 modules |
| Cú pháp workflow, package/lockfile | PASS |
| CI Mobile trên GitHub | Chưa xác minh kết quả cho lượt thay đổi này |
| Native trên Medium_Phone | Lần thử 20/11 chưa đạt; chưa thử lại sau thay đổi phần Thuần |
| Backend demo và dữ liệu thật | Chưa có môi trường/tài khoản để nghiệm thu |

Lần chạy emulator ngày 20/11 ghi nhận khoảng 0,8 GB RAM trống; chưa đủ bằng chứng kết luận đây là nguyên nhân duy nhất. Expo Go 2.31.2 đã cài. Metro/emulator do phiên kiểm thử mở đã được dừng và ổ R: tạm đã được bỏ. APK, bundle và log giữ tại `.local-build/`.

Các test bao phủ: JWT/401, phản hồi phiên cũ, lưu/xóa token, khôi phục khi mất mạng, kiểm tra tài khoản cư dân, đăng nhập/đăng xuất qua App.tsx, hồ sơ/đổi mật khẩu, hóa đơn/VietQR, phân trang thông báo và hủy request cũ. Phản hồi khôi phục cũ không được xóa hoặc thay thế phiên đăng nhập mới. Test phần Thuần kiểm tra dữ liệu gửi đúng API, chống bấm gửi lặp, phiếu trùng/409, hủy request khi rời màn hình, phân trang, tải lại tiến độ, phiếu đóng, điều kiện nghiệm thu, lỗi API và phản hồi góp ý.

## Nghiệm thu từng bước

1. **Chuẩn bị Backend demo.** Nhờ Việt Hoàng/Hiếu cấp URL và tài khoản RESIDENT đã duyệt, có căn hộ, hóa đơn và thông báo. Dùng tài khoản kiểm thử riêng; không gửi mật khẩu/token vào chat hoặc repo.
2. **Chuẩn bị thiết bị.** Mở emulator hoặc thiết bị Android có runtime phù hợp SDK 51. Đóng bớt ứng dụng không cần thiết nếu máy thiếu RAM. Cấu hình API URL theo bảng trên.
3. **Chạy app.** Thực hiện các lệnh kiểm tra rồi mở ứng dụng. Nếu Metro lỗi header do đường dẫn có dấu, dùng hướng dẫn ổ đĩa tạm.
4. **Thử lần lượt các luồng bên dưới.** Ghi PASS/FAIL sau khi thực hiện, không đánh dấu chỉ từ kết quả unit test.
5. **Lưu bằng chứng.** Ghi ngày, commit, thiết bị/runtime, URL demo không chứa thông tin đăng nhập và lỗi còn lại. Ảnh/log cá nhân đặt trong `.local-build/qa/`; tránh ghi mật khẩu/token.

- [ ] Khởi động app native, kiểm tra bàn phím, cuộn, vùng an toàn và nút Back.
- [ ] Đăng nhập đúng/sai/chờ duyệt; đóng/mở app, khôi phục phiên, hết phiên, mất mạng/thử lại và đăng xuất.
- [ ] Hồ sơ đúng cư dân/căn hộ; xử lý tài khoản chưa gắn phòng; đổi mật khẩu tài khoản demo.
- [ ] Hóa đơn rỗng/chưa trả/trả một phần/đã trả; lọc tháng, phí và lịch sử đúng căn hộ.
- [ ] QR đọc được, đúng thông tin chuyển khoản; tải lại sau BQL đối soát trên dữ liệu demo. Không chuyển tiền thật chỉ để thử giao diện.
- [ ] Thông báo chung và đúng phòng; không lộ thông báo phòng khác; phân trang, tải lại và xử lý lỗi.
- [ ] Với Backend demo: gửi phiếu căn hộ/khu chung, cảnh báo trùng và 409; BQL gán thợ, thợ cập nhật trạng thái, cư dân tải lại tiến độ, nghiệm thu 1–5 sao; gửi góp ý và xem phản hồi BQL.

Push khi app đóng, chọn/upload ảnh-video và cập nhật tiến độ realtime vẫn cần hoàn thiện và nghiệm thu riêng. Bộ test API/native giả lập không thay thế kiểm thử xuyên suốt với Backend thật.

## Bàn giao

Lượt hỗ trợ Thuần gồm bốn màn hình, endpoint chi tiết phiếu, maintenance.ts, useSubmit.ts, MaintenanceUI.tsx, bộ test và tài liệu Mobile. Không đổi cấu trúc App.tsx, cơ chế xác thực hoặc dependencies. Không đưa node_modules, .env, .local-build, .local-work hoặc ghi chú cá nhân vào PR.

Kiểm tra `git status --short` để thấy cả file mới và `git diff --check` trước bàn giao. Giữ thay đổi local cho người dùng review; không tự commit, push, merge hoặc rebase. Khi được cho phép xuất bản, PR của Nguyệt hướng vào main, không push trực tiếp main.

Phần Mobile chỉ hoàn thành nghiệm thu khi cả kiểm tra tự động và các luồng Backend/native thực tế đều đạt.
