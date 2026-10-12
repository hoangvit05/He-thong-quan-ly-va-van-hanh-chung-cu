// Phụ trách: Hiếu
// Chức năng: Lập biểu phí định kỳ hàng tháng, xem hóa đơn theo căn hộ, sinh mã VietQR
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  // TODO (Hiếu): Danh sách hóa đơn toàn tòa nhà
  res.json({ success: true, data: [], message: 'Danh sách hóa đơn' });
});

router.post('/', (req, res) => {
  // TODO (Hiếu): BQL tạo biểu phí định kỳ tháng mới
  res.json({ success: true, data: null, message: 'Lập biểu phí thành công' });
});

router.get('/my-invoice', (req, res) => {
  // TODO (Hiếu): Cư dân xem hóa đơn của phòng mình
  res.json({ success: true, data: null, message: 'Chi tiết hóa đơn căn hộ' });
});

router.put('/:id/status', (req, res) => {
  // TODO (Hiếu): Cập nhật trạng thái Đã nộp / Chưa nộp
  res.json({ success: true, data: null, message: 'Cập nhật thanh toán thành công' });
});

export default router;
