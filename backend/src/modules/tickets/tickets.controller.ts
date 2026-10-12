// Phụ trách: Hiếu
// Chức năng: Luồng Báo hỏng, lọc trùng, gán thợ, kê khai vật tư, chấm sao 1-5
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  // TODO (Hiếu): Lấy danh sách phiếu báo hỏng (kèm cờ lọc trùng)
  res.json({ success: true, data: [], message: 'Danh sách phiếu sự cố' });
});

router.post('/', (req, res) => {
  // TODO (Hiếu): Cư dân gửi phiếu báo hỏng mới
  res.json({ success: true, data: { ticketId: 1 }, message: 'Gửi phiếu báo hỏng thành công' });
});

router.put('/:id/assign', (req, res) => {
  // TODO (Hiếu): BQL gán việc cho thợ
  res.json({ success: true, data: null, message: 'Đã gán việc cho thợ thành công' });
});

router.put('/:id/status', (req, res) => {
  // TODO (Hiếu): Thợ cập nhật trạng thái (Nhận việc -> Đang sửa -> Hoàn thành)
  res.json({ success: true, data: null, message: 'Cập nhật trạng thái thành công' });
});

router.post('/:id/materials', (req, res) => {
  // TODO (Hiếu): Thợ kê khai vật tư thay thế
  res.json({ success: true, data: null, message: 'Kê khai vật tư thành công' });
});

router.post('/:id/rate', (req, res) => {
  // TODO (Hiếu): Cư dân nghiệm thu và chấm 1-5 sao
  res.json({ success: true, data: null, message: 'Đánh giá hoàn thành' });
});

export default router;
