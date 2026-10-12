// Phụ trách: Đặng Hoàng
// Chức năng: Gửi thông báo chung, thông báo riêng căn hộ & phát Socket.IO
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  // TODO (Hoàng): Lấy danh sách thông báo
  res.json({ success: true, data: [], message: 'Danh sách thông báo' });
});

router.post('/', (req, res) => {
  // TODO (Hoàng): Soạn và phát thông báo đẩy tức thời
  res.json({ success: true, data: null, message: 'Đã gửi thông báo thành công' });
});

export default router;
