// Phụ trách: Hiếu
// Chức năng: Cư dân gửi phản ánh nội quy, BQL xem và trả lời phản hồi
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  // TODO (Hiếu): Lấy danh sách góp ý của cư dân
  res.json({ success: true, data: [], message: 'Danh sách góp ý' });
});

router.post('/', (req, res) => {
  // TODO (Hiếu): Cư dân gửi góp ý mới
  res.json({ success: true, data: null, message: 'Gửi góp ý thành công' });
});

router.post('/:id/reply', (req, res) => {
  // TODO (Hiếu): BQL gửi phản hồi cho cư dân
  res.json({ success: true, data: null, message: 'Gửi phản hồi thành công' });
});

export default router;
