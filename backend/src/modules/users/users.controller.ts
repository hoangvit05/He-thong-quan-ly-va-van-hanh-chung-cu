// Phụ trách: Đặng Hoàng
// Chức năng: Admin tạo tài khoản BQL & Thợ, duyệt cư dân mới, xem danh sách phòng
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  // TODO (Hoàng): Trả về danh sách tài khoản / cư dân
  res.json({ success: true, data: [], message: 'Lấy danh sách thành công' });
});

router.post('/', (req, res) => {
  // TODO (Hoàng): Admin tạo tài khoản BQL hoặc Thợ
  res.json({ success: true, data: null, message: 'Tạo tài khoản thành công' });
});

router.put('/:id/approve', (req, res) => {
  // TODO (Hoàng): Duyệt tài khoản cư dân mới
  res.json({ success: true, data: null, message: 'Đã duyệt cư dân thành công' });
});

export default router;
