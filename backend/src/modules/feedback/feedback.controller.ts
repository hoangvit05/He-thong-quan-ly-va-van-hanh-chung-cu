// Phụ trách: Hiếu
// Chức năng: Cư dân gửi phản ánh nội quy, BQL xem và trả lời phản hồi
import { Router, Request, Response } from 'express';
import prisma from '../../database/prisma';

const router = Router();

// 1. Lấy danh sách góp ý của cư dân (BQL xem toàn bộ, hoặc lọc theo phòng)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { roomId, isResolved } = req.query;
    const where: any = {};
    if (roomId) where.roomId = Number(roomId);
    if (isResolved !== undefined) where.isResolved = isResolved === 'true';

    const feedbacks = await prisma.feedback.findMany({
      where,
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: feedbacks, message: 'Danh sách góp ý của cư dân' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy danh sách góp ý' });
  }
});

// 2. Cư dân gửi phản ánh / góp ý mới
router.post('/', async (req: Request, res: Response) => {
  try {
    const { residentId, roomId, title, content } = req.body;

    if (!residentId || !title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: residentId, tiêu đề (title) và nội dung (content)',
      });
    }

    const newFeedback = await prisma.feedback.create({
      data: {
        residentId: Number(residentId),
        roomId: roomId ? Number(roomId) : null,
        title: String(title).slice(0, 200),
        content: String(content),
      },
    });

    res.status(201).json({ success: true, data: newFeedback, message: 'Gửi góp ý thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gửi góp ý' });
  }
});

// 3. BQL gửi phản hồi cho cư dân
router.post('/:id/reply', async (req: Request, res: Response) => {
  try {
    const feedbackId = Number(req.params.id);
    const { reply } = req.body;

    if (!reply || !String(reply).trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được để trống.' });
    }

    const updated = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        reply: String(reply).trim(),
        isResolved: true,
        repliedAt: new Date(),
      },
    });

    res.json({ success: true, data: updated, message: 'Gửi phản hồi thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gửi phản hồi' });
  }
});

export default router;
