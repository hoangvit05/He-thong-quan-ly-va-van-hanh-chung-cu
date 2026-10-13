// Phụ trách: Hiếu
// Chức năng: Luồng Báo hỏng, thuật toán lọc trùng, gán thợ, kê khai vật tư, chấm sao 1-5
import { Router, Request, Response } from 'express';
import prisma from '../../database/prisma';
import { isValidMediaUrl, sanitizeMaterials } from '../../common/utils/validation';

const router = Router();

// 1. Lấy danh sách phiếu sự cố (BQL & Thợ)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, roomId, isDuplicate } = req.query;
    const where: any = {};
    if (status) where.status = String(status);
    if (roomId) where.roomId = Number(roomId);
    if (isDuplicate !== undefined) where.isDuplicate = isDuplicate === 'true';

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true } },
        technician: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: tickets, message: 'Lấy danh sách phiếu sự cố thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy danh sách phiếu' });
  }
});

// 2. Cư dân gửi phiếu báo hỏng mới (Kèm thuật toán lọc trùng & Chặn Base64)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { title, category, description, mediaUrl, roomId, residentId } = req.body;

    if (!category || !description || !residentId) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ: category, description và residentId',
      });
    }

    // BẪY 1: Chặn Base64 - Chỉ chấp nhận URL ảnh hợp lệ
    if (mediaUrl && !isValidMediaUrl(mediaUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Đường dẫn ảnh/video không hợp lệ hoặc chứa mã Base64! Vui lòng tải ảnh lên Cloud trước khi gửi link.',
      });
    }

    // THUẬT TOÁN LỌC PHIẾU TRÙNG (Duplicate Detection Algorithm):
    // Kiểm tra xem trong vòng 24 giờ qua, cùng phòng (hoặc cùng người gửi) và cùng danh mục
    // có phiếu nào đang ở trạng thái PENDING, ASSIGNED hoặc IN_PROGRESS chưa hoàn tất không.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingSimilarTicket = await prisma.ticket.findFirst({
      where: {
        category,
        OR: [
          ...(roomId ? [{ roomId: Number(roomId) }] : []),
          { residentId: Number(residentId) },
        ],
        status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        createdAt: { gte: oneDayAgo },
      },
    });

    const isDuplicate = !!existingSimilarTicket;

    const newTicket = await prisma.ticket.create({
      data: {
        title: title || `${category} - Phòng ${roomId || 'Chung'}`,
        category,
        description,
        mediaUrl: mediaUrl || null,
        roomId: roomId ? Number(roomId) : null,
        residentId: Number(residentId),
        isDuplicate,
      },
    });

    res.status(201).json({
      success: true,
      data: newTicket,
      message: isDuplicate
        ? 'Phiếu đã được tiếp nhận (Hệ thống ghi nhận có phiếu tương tự đang được xử lý trong 24h qua).'
        : 'Gửi phiếu báo hỏng thành công.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gửi phiếu sự cố' });
  }
});

// 3. BQL gán việc cho thợ kỹ thuật
router.put('/:id/assign', async (req: Request, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn Thợ kỹ thuật (technicianId).' });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        technicianId: Number(technicianId),
        status: 'ASSIGNED',
      },
    });

    res.json({ success: true, data: updated, message: 'Đã gán việc cho thợ thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gán việc cho thợ' });
  }
});

// 4. Thợ kỹ thuật cập nhật trạng thái (Nhận việc: IN_PROGRESS -> Đã xong: COMPLETED)
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const { status, completedMediaUrl } = req.body;

    // Chặn ảnh Base64 khi thợ hoàn thành
    if (completedMediaUrl && !isValidMediaUrl(completedMediaUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Ảnh nghiệm thu không hợp lệ hoặc chứa Base64! Vui lòng tải ảnh lên Cloud trước.',
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(completedMediaUrl ? { completedMediaUrl } : {}),
      },
    });

    res.json({ success: true, data: updated, message: 'Cập nhật trạng thái thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi cập nhật trạng thái' });
  }
});

// 5. Thợ kỹ thuật kê khai vật tư đã thay thế (Chặn Base64 ảnh hóa đơn)
router.post('/:id/materials', async (req: Request, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const { materials } = req.body;

    const validation = sanitizeMaterials(materials);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { materials: validation.sanitized },
    });

    res.json({ success: true, data: updated, message: 'Kê khai vật tư thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi kê khai vật tư' });
  }
});

// 6. Cư dân nghiệm thu và chấm điểm 1 - 5 sao (Đóng phiếu: CLOSED)
router.post('/:id/rate', async (req: Request, res: Response) => {
  try {
    const ticketId = Number(req.params.id);
    const { rating, ratingComment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Điểm đánh giá phải từ 1 đến 5 sao.' });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        rating: Number(rating),
        ratingComment: ratingComment ? String(ratingComment).slice(0, 500) : null,
        status: 'CLOSED',
      },
    });

    res.json({ success: true, data: updated, message: 'Nghiệm thu và đánh giá hoàn thành' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lưu đánh giá' });
  }
});

export default router;
