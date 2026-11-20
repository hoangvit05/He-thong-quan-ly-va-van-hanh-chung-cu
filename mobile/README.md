# Mobile Resident App

Ứng dụng cư dân dùng Expo SDK 51, React Native 0.74.5 và React 18.2.0. Phần của Nguyệt gồm điều hướng, xác thực/phiên đăng nhập, hồ sơ, hóa đơn/VietQR và bảng tin.

## Cấu trúc và trách nhiệm

Cấu trúc Mobile trong workspace của Nguyệt. Các thay đổi mới ở App.tsx, AuthContext, bộ test, scripts và workflow vẫn còn local, chưa commit. README gốc của dự án giữ nguyên nội dung main và chỉ bổ sung tiến độ trong mục Nguyệt.

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

Nguyệt phụ trách AuthScreen, ProfileScreen, InvoiceScreen và NotificationScreen. CreateTicketScreen, TicketTimelineScreen, RatingScreen và FeedbackScreen thuộc Thuần; các màn hình này còn scaffold tại lần đối chiếu 20/11/2026.

## Chức năng đã triển khai

- Đăng nhập bằng username/email/điện thoại; lưu JWT bằng AsyncStorage và gắn Bearer token khi gọi API. Chỉ nhận RESIDENT đã được duyệt.
- Khôi phục phiên qua /api/auth/me; đăng xuất hoặc 401 trở về đăng nhập. Mất mạng cho phép thử lại; phản hồi phiên cũ không xóa phiên mới.
- Hồ sơ cá nhân, phòng, tầng, diện tích; xử lý tài khoản chưa gắn phòng; đổi mật khẩu có xác nhận.
- Lọc hóa đơn theo tháng, chi tiết phí/lịch sử thanh toán, số dư và VietQR từ Backend; thử lại ảnh QR lỗi và tải lại trạng thái thanh toán.
- Danh sách/chi tiết thông báo, phân trang và kéo để tải lại.
- Trạng thái tải/lỗi/rỗng, chặn gửi form lặp và hủy request cũ khi đổi màn hình.

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

## Kết quả kiểm tra ghi nhận ngày 20/11/2026

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript | PASS |
| Màn hình, phiên và khởi tạo App | 28/28 PASS |
| Bundle Android | PASS — 734 modules |
| Cú pháp workflow, package/lockfile | PASS |
| CI Mobile mới trên GitHub | Chưa chạy — workflow còn local |
| Native trên Medium_Phone | Chưa đạt nghiệm thu — System UI/Expo Go không phản hồi |
| Backend demo và dữ liệu thật | Chưa có môi trường/tài khoản để nghiệm thu |

Lần chạy emulator ghi nhận khoảng 0,8 GB RAM trống; chưa đủ bằng chứng kết luận đây là nguyên nhân duy nhất. Expo Go 2.31.2 đã cài. Metro/emulator do phiên kiểm thử mở đã được dừng và ổ R: tạm đã được bỏ. APK, bundle và log giữ tại `.local-build/`.

Các test bao phủ: JWT/401, phản hồi phiên cũ, lưu/xóa token, khôi phục khi mất mạng, kiểm tra tài khoản cư dân, đăng nhập/đăng xuất qua App.tsx, hồ sơ/đổi mật khẩu, hóa đơn/VietQR, phân trang thông báo và hủy request cũ. Phản hồi khôi phục cũ không được xóa hoặc thay thế phiên đăng nhập mới.

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
- [ ] Phối hợp kiểm tra luồng sự cố sau khi Thuần hoàn thiện các màn hình liên quan.

Push khi app đóng, upload media và nghiệp vụ các màn hình của Thuần cần phối hợp riêng; không tính là đã hoàn thành từ phần kiểm thử của Nguyệt.

## Bàn giao

Giữ cùng nhau các thay đổi liên quan: App.tsx, AuthContext, test, package/lockfile, .gitignore, tài liệu và workflow Mobile. Không đưa node_modules, .env, .local-build, .local-work hoặc ghi chú cá nhân vào PR.

Kiểm tra `git status --short` để thấy cả file mới và `git diff --check` trước bàn giao. Giữ thay đổi local cho người dùng review; không tự commit, push, merge hoặc rebase. Khi được cho phép xuất bản, PR của Nguyệt hướng vào main, không push trực tiếp main.

Phần Mobile chỉ hoàn thành nghiệm thu khi cả kiểm tra tự động và các luồng Backend/native thực tế đều đạt.
