// Phụ trách: Hiếu
// Chức năng: Luồng Báo hỏng, thuật toán lọc trùng 24h, phân quyền RBAC, kiểm soát chuyển trạng thái, gán thợ, kê khai vật tư, nghiệm thu đánh giá
import { Router, Request, Response } from 'express';
import { TicketStatus, Role } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';
import { isValidMediaUrl, sanitizeMaterials } from '../../common/utils/validation';
import {
  isValidTicketStatus,
  canTransitionTicketStatus,
  validateTicketInput,
  validateRatingInput,
} from './tickets.validator';

const router = Router();

// Tự động giải nén thông tin người dùng từ JWT hoặc header dev
router.use(extractUser);

// =========================================================================
// 1. LẤY DANH SÁCH PHIẾU BÁO HỎNG (Có phân trang, bộ lọc và phân quyền xem)
// GET /api/tickets hoặc GET /api/technician/tickets
// =========================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      status,
      category,
      roomId,
      residentId,
      technicianId,
      isDuplicate,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // 1. Phân quyền xem dữ liệu theo vai trò (Access Control)
    const currentUser = req.user;
    const isTechnicianRoute = req.baseUrl.includes('technician');

    if (currentUser) {
      if (currentUser.role === Role.RESIDENT) {
        // Cư dân CHỈ được xem phiếu do chính mình tạo (chống lộ thông tin sự cố nhà khác)
        where.residentId = currentUser.id;
      } else if (currentUser.role === Role.TECHNICIAN || isTechnicianRoute) {
        // Thợ kỹ thuật mặc định xem việc được giao cho mình (trừ khi BQL lọc)
        if (currentUser.role === Role.TECHNICIAN) {
          where.technicianId = currentUser.id;
        }
      }
    }

    // 2. Áp dụng các bộ lọc truy vấn
    if (status && isValidTicketStatus(status)) {
      where.status = status;
    }
    if (category) {
      where.category = { contains: String(category).trim(), mode: 'insensitive' };
    }
    if (roomId && !isNaN(Number(roomId))) {
      where.roomId = Number(roomId);
    }
    if (residentId && !where.residentId && !isNaN(Number(residentId))) {
      where.residentId = Number(residentId);
    }
    if (technicianId && !where.technicianId && !isNaN(Number(technicianId))) {
      where.technicianId = Number(technicianId);
    }
    if (isDuplicate !== undefined) {
      where.isDuplicate = isDuplicate === 'true';
    }
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const trimmedSearch = search.trim();
      where.OR = [
        { title: { contains: trimmedSearch, mode: 'insensitive' } },
        { description: { contains: trimmedSearch, mode: 'insensitive' } },
      ];
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, phone: true, email: true } },
          technician: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      message: 'Lấy danh sách phiếu sự cố thành công',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy danh sách phiếu' });
  }
});

// =========================================================================
// 2. CƯ DÂN XEM DANH SÁCH PHIẾU CỦA CHÍNH MÌNH
// GET /api/tickets/my-tickets
// =========================================================================
router.get('/my-tickets', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user;
    const residentId = currentUser?.id || (req.query.residentId ? Number(req.query.residentId) : null);

    if (!residentId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Yêu cầu đăng nhập hoặc cung cấp residentId hợp lệ để xem phiếu cá nhân.',
      });
    }

    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { residentId: Number(residentId) };
    if (status && isValidTicketStatus(status)) {
      where.status = status;
    }

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({
        where,
        include: {
          room: true,
          technician: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
      message: 'Danh sách phiếu sự cố của căn hộ',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi tra cứu phiếu cá nhân' });
  }
});

// =========================================================================
// 3. XEM CHI TIẾT VÀ TIẾN ĐỘ XỬ LÝ CỦA MỘT PHIẾU
// GET /api/tickets/:id
// =========================================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true, email: true } },
        technician: { select: { id: true, fullName: true, phone: true } },
      },
    });

    if (!ticket) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố.' });
    }

    // Kiểm tra quyền xem chi tiết phiếu
    const currentUser = req.user;
    if (currentUser && currentUser.role === Role.RESIDENT) {
      // Cư dân chỉ được xem phiếu của mình hoặc phòng mình
      const isOwner = ticket.residentId === currentUser.id;
      const isRoomResident = ticket.roomId && currentUser.roomId && ticket.roomId === currentUser.roomId;
      if (!isOwner && !isRoomResident) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Bạn không có quyền xem thông tin phiếu sự cố của người khác.',
        });
      }
    }

    res.json({ success: true, data: ticket, message: 'Chi tiết phiếu sự cố và tiến độ xử lý' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy chi tiết phiếu' });
  }
});

// =========================================================================
// 4. CƯ DÂN TẠO PHIẾU BÁO HỎNG MỚI (Lọc trùng 24h & Chặn Base64)
// POST /api/tickets
// =========================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = validateTicketInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { title, category, description, mediaUrl, roomId } = req.body;

    // Xác định người gửi phiếu: Ưu tiên lấy từ phiên đăng nhập an toàn
    let residentId = req.user?.id;
    if (!residentId && req.body.residentId) {
      residentId = Number(req.body.residentId);
    }

    if (!residentId || isNaN(residentId)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Vui lòng cung cấp mã cư dân tạo phiếu (residentId) hoặc đăng nhập.',
      });
    }

    // Nếu người dùng đăng nhập là cư dân, ngăn chặn tạo hộ bằng tài khoản cư dân khác
    if (req.user && req.user.role === Role.RESIDENT && req.user.id !== residentId) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Bạn không thể tạo phiếu dưới danh nghĩa của cư dân khác.',
      });
    }

    // Kiểm tra sự tồn tại của Resident trong hệ thống
    const resident = await prisma.user.findUnique({
      where: { id: residentId },
    });
    if (!resident) {
      return res.status(404).json({ success: false, data: null, message: 'Tài khoản cư dân không tồn tại.' });
    }

    // Xác định roomId: nếu không gửi, lấy theo phòng cư dân đang ở
    const effectiveRoomId = roomId ? Number(roomId) : resident.roomId || null;

    if (effectiveRoomId) {
      const roomExists = await prisma.room.findUnique({ where: { id: effectiveRoomId } });
      if (!roomExists) {
        return res.status(404).json({ success: false, data: null, message: 'Căn hộ chỉ định không tồn tại.' });
      }
    }

    // THUẬT TOÁN LỌC PHIẾU TRÙNG LẶP TRONG 24 GIỜ (Scope chuẩn theo Room và Category):
    // Nếu có sự cố cùng phòng và cùng phân loại chưa hoàn tất (PENDING/ASSIGNED/IN_PROGRESS)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const duplicateCondition: any = {
      category: category.trim(),
      status: { in: [TicketStatus.PENDING, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
      createdAt: { gte: oneDayAgo },
    };

    if (effectiveRoomId) {
      duplicateCondition.roomId = effectiveRoomId;
    } else {
      duplicateCondition.residentId = residentId;
      duplicateCondition.roomId = null;
    }

    const existingSimilarTicket = await prisma.ticket.findFirst({
      where: duplicateCondition,
      orderBy: { createdAt: 'desc' },
    });

    const isDuplicate = !!existingSimilarTicket;

    const newTicket = await prisma.ticket.create({
      data: {
        title: title ? String(title).trim() : `${category} - Phòng ${effectiveRoomId ? `P.${effectiveRoomId}` : 'Khu chung'}`,
        category: category.trim(),
        description: description.trim(),
        mediaUrl: mediaUrl || null,
        roomId: effectiveRoomId,
        residentId,
        isDuplicate,
        status: TicketStatus.PENDING,
      },
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true } },
      },
    });

    res.status(201).json({
      success: true,
      data: newTicket,
      message: isDuplicate
        ? 'Phiếu đã được tiếp nhận (Hệ thống ghi nhận có phiếu cùng hạng mục đang được xử lý trong 24h qua).'
        : 'Gửi phiếu báo hỏng thành công.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gửi phiếu sự cố' });
  }
});

// =========================================================================
// 5. BAN QUẢN LÝ GÁN VIỆC CHO THỢ KỸ THUẬT
// PUT /api/tickets/:id/assign
// =========================================================================
router.put('/:id/assign', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { technicianId } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    if (!technicianId || isNaN(Number(technicianId))) {
      return res.status(400).json({ success: false, data: null, message: 'Vui lòng chọn Thợ kỹ thuật (technicianId hợp lệ).' });
    }

    // Kiểm tra phiếu có tồn tại không
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố.' });
    }

    if (ticket.status === TicketStatus.CLOSED) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Phiếu này đã đóng hoàn tất (CLOSED). Không thể gán việc lại.',
      });
    }

    // Kiểm tra Thợ kỹ thuật có tồn tại và đúng Role TECHNICIAN không
    const technician = await prisma.user.findUnique({
      where: { id: Number(technicianId) },
    });

    if (!technician) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy tài khoản thợ kỹ thuật.' });
    }

    if (technician.role !== Role.TECHNICIAN) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Tài khoản [${technician.fullName}] có vai trò là [${technician.role}], không phải [TECHNICIAN].`,
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        technicianId: Number(technicianId),
        status: TicketStatus.ASSIGNED,
      },
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true } },
        technician: { select: { id: true, fullName: true, phone: true } },
      },
    });

    res.json({
      success: true,
      data: updated,
      message: `Đã phân công thành công cho thợ kỹ thuật: ${technician.fullName}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gán việc cho thợ' });
  }
});

// =========================================================================
// 6. CẬP NHẬT TRẠNG THÁI TIẾN ĐỘ XỬ LÝ (Kiểm soát nghiêm ngặt State Machine)
// PUT /api/tickets/:id/status hoặc PUT /api/technician/tickets/:id/status
// =========================================================================
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { status, completedMediaUrl } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    if (!status || !isValidTicketStatus(status)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Trạng thái mới không hợp lệ. Danh sách hợp lệ: [${Object.values(TicketStatus).join(', ')}]`,
      });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố.' });
    }

    // Kiểm tra quyền hạn và tính hợp lệ của bước chuyển trạng thái (State Machine)
    const currentUser = req.user;
    const isAssignedTech = !!(currentUser && ticket.technicianId === currentUser.id);
    const isCreator = !!(currentUser && ticket.residentId === currentUser.id);

    const transitionCheck = canTransitionTicketStatus(
      ticket.status,
      status as TicketStatus,
      currentUser?.role,
      isAssignedTech,
      isCreator
    );

    if (!transitionCheck.allowed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: transitionCheck.reason || 'Bước chuyển trạng thái không hợp lệ.',
      });
    }

    // Chặn ảnh Base64 nếu có gửi ảnh nghiệm thu
    if (completedMediaUrl && !isValidMediaUrl(completedMediaUrl)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Ảnh nghiệm thu không hợp lệ hoặc chứa mã Base64! Vui lòng tải ảnh lên Cloud trước.',
      });
    }

    const updateData: any = {
      status: status as TicketStatus,
    };
    if (completedMediaUrl) {
      updateData.completedMediaUrl = completedMediaUrl;
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, phone: true } },
        technician: { select: { id: true, fullName: true, phone: true } },
      },
    });

    res.json({ success: true, data: updated, message: `Cập nhật trạng thái thành công: ${status}` });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi cập nhật trạng thái' });
  }
});

// =========================================================================
// 7. THỢ KỸ THUẬT KÊ KHAI VẬT TƯ THAY THẾ (Chặn Base64, Giới hạn độ dài)
// POST /api/tickets/:id/materials hoặc POST /api/technician/tickets/:id/materials
// =========================================================================
router.post('/:id/materials', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { materials } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố.' });
    }

    // Chỉ thợ được chỉ định hoặc Ban quản lý mới được kê khai vật tư
    const currentUser = req.user;
    if (currentUser && currentUser.role === Role.TECHNICIAN && ticket.technicianId !== currentUser.id) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Bạn không được chỉ định phụ trách phiếu này nên không thể kê khai vật tư.',
      });
    }

    // Chỉ cho phép kê khai khi phiếu đang sửa hoặc đã hoàn thành
    if (ticket.status !== TicketStatus.IN_PROGRESS && ticket.status !== TicketStatus.COMPLETED) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Chỉ có thể kê khai vật tư khi phiếu đang ở trạng thái [IN_PROGRESS] hoặc [COMPLETED] (Hiện tại: ${ticket.status}).`,
      });
    }

    const validation = sanitizeMaterials(materials);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, data: null, message: validation.error });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { materials: validation.sanitized },
    });

    res.json({ success: true, data: updated, message: 'Kê khai vật tư thay thế thành công' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi kê khai vật tư' });
  }
});

// =========================================================================
// 8. CƯ DÂN NGHIỆM THU VÀ CHẤM ĐIỂM (1 - 5 Sao) -> ĐÓNG PHIẾU (CLOSED)
// POST /api/tickets/:id/rate
// =========================================================================
router.post('/:id/rate', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { rating, ratingComment } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    const ratingValidation = validateRatingInput(rating, ratingComment);
    if (!ratingValidation.isValid) {
      return res.status(400).json({ success: false, data: null, message: ratingValidation.error });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố.' });
    }

    // BẮT BUỘC: Phiếu phải ở trạng thái COMPLETED (thợ sửa xong) mới được nghiệm thu chấm điểm
    if (ticket.status !== TicketStatus.COMPLETED) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Chỉ có thể nghiệm thu chấm điểm khi Thợ đã hoàn thành sửa chữa (COMPLETED). Hiện tại: ${ticket.status}.`,
      });
    }

    // Chỉ người tạo phiếu (Cư dân) hoặc BQL mới có quyền nghiệm thu đóng phiếu
    const currentUser = req.user;
    if (currentUser && currentUser.role === Role.RESIDENT && ticket.residentId !== currentUser.id) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Chỉ cư dân gửi phiếu này mới có quyền nghiệm thu và chấm điểm.',
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        rating: Number(rating),
        ratingComment: ratingComment ? String(ratingComment).trim().slice(0, 500) : null,
        status: TicketStatus.CLOSED,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: 'Nghiệm thu hoàn tất và đã đóng phiếu sự cố. Cảm ơn phản hồi của bạn!',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lưu đánh giá nghiệm thu' });
  }
});

export default router;
