// Phụ trách: Hiếu
// Chức năng: Luồng Báo hỏng, thuật toán lọc trùng 24h, phân quyền RBAC, kiểm soát chuyển trạng thái, gán thợ, kê khai vật tư, nghiệm thu đánh giá
// Đã qua kiểm tra và gia cố bảo mật (Security Hardening): Chống giả mạo danh tính, chống rò rỉ dữ liệu chéo phòng, kiểm soát giao dịch ACID
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

// Bộ nhớ đệm Debounce chống gửi lặp đồng thời (Concurrent Double-Click / Race Condition Prevention)
const recentSubmissions = new Map<string, number>();

function cleanOldSubmissions(): void {
  const now = Date.now();
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > 10000) {
      recentSubmissions.delete(key);
    }
  }
}

// BẮT BUỘC: Toàn bộ các API phân hệ sự cố kỹ thuật đều phải qua xác thực danh tính
router.use(extractUser);
router.use(requireAuth);

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
    const currentUser = req.user!; // Đã được bảo vệ bởi requireAuth
    const isTechnicianRoute = req.baseUrl.includes('technician');

    // 1. Phân quyền xem dữ liệu nghiêm ngặt theo vai trò (Record-Level Access Control)
    if (currentUser.role === Role.RESIDENT) {
      // Cư dân TUYỆT ĐỐI CHỈ xem phiếu do chính mình tạo (ngăn chặn rò rỉ dữ liệu sự cố phòng khác)
      where.residentId = currentUser.id;
    } else if (currentUser.role === Role.TECHNICIAN || isTechnicianRoute) {
      // Thợ kỹ thuật chỉ xem các phiếu được phân công cho mình (trừ khi BQL lọc)
      if (currentUser.role === Role.TECHNICIAN) {
        where.technicianId = currentUser.id;
      }
    } else if (currentUser.role === Role.ADMIN || currentUser.role === Role.BQL) {
      // BQL & Admin có quyền lọc theo cư dân hoặc thợ cụ thể
      if (residentId && !isNaN(Number(residentId))) {
        where.residentId = Number(residentId);
      }
      if (technicianId && !isNaN(Number(technicianId))) {
        where.technicianId = Number(technicianId);
      }
    }

    // 2. Áp dụng các bộ lọc truy vấn an toàn
    if (status && isValidTicketStatus(status)) {
      where.status = status;
    }
    if (category) {
      where.category = { contains: String(category).trim(), mode: 'insensitive' };
    }
    if (roomId && !isNaN(Number(roomId))) {
      where.roomId = Number(roomId);
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
    const currentUser = req.user!;

    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'API này chỉ dành cho Cư dân. Thợ kỹ thuật vui lòng truy cập danh sách công việc được phân công (/api/technician/tickets).',
      });
    }

    let targetResidentId: number;

    // BẢO MẬT: Cư dân chỉ được xem phiếu của mình, không được dùng query residentId để xem của người khác
    if (currentUser.role === Role.RESIDENT) {
      targetResidentId = currentUser.id;
    } else {
      // BQL hoặc Admin có thể tra cứu theo residentId nếu truyền
      targetResidentId = req.query.residentId ? Number(req.query.residentId) : currentUser.id;
    }

    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { residentId: targetResidentId };
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

    // KIỂM TRA PHÂN QUYỀN TRUY CẬP TỪNG BẢN GHI (Record-Level Access Control):
    const currentUser = req.user!;
    if (currentUser.role === Role.RESIDENT) {
      // Cư dân chỉ được xem nếu chính mình tạo HOẶC thuộc cùng căn hộ của mình
      const isOwner = ticket.residentId === currentUser.id;
      const isRoomResident = !!(ticket.roomId && currentUser.roomId && ticket.roomId === currentUser.roomId);
      if (!isOwner && !isRoomResident) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Bạn không có quyền xem thông tin phiếu sự cố của căn hộ khác.',
        });
      }
    } else if (currentUser.role === Role.TECHNICIAN) {
      // Thợ kỹ thuật CHỈ có quyền xem chi tiết phiếu được phân công trực tiếp cho mình
      if (ticket.technicianId !== currentUser.id) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Thợ kỹ thuật chỉ có quyền xem chi tiết các phiếu sự cố được phân công trực tiếp cho mình.',
        });
      }
    }

    res.json({ success: true, data: ticket, message: 'Chi tiết phiếu sự cố và tiến độ xử lý' });
  } catch (error: any) {
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lấy chi tiết phiếu' });
  }
});

// =========================================================================
// 4. CƯ DÂN TẠO PHIẾU BÁO HỎNG MỚI (Lọc trùng 24h & Chống giả mạo phòng)
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
    const currentUser = req.user!;

    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền tạo phiếu báo hỏng. Vui lòng sử dụng tài khoản Cư dân hoặc Ban quản lý.',
      });
    }

    let effectiveResidentId: number;
    let effectiveRoomId: number | null = null;

    if (currentUser.role === Role.RESIDENT) {
      // 1. Cư dân BẮT BUỘC dùng ID của chính mình (chống giả mạo danh tính)
      effectiveResidentId = currentUser.id;

      // 2. BẢO MẬT PHÒNG: Cư dân chỉ có thể báo hỏng cho phòng của chính mình, hoặc khu vực chung (roomId = null)
      if (roomId !== undefined && roomId !== null && roomId !== '') {
        const reqRoomId = Number(roomId);
        if (currentUser.roomId && reqRoomId !== currentUser.roomId) {
          return res.status(403).json({
            success: false,
            data: null,
            message: `Bạn chỉ có quyền báo sự cố cho căn hộ của mình (Phòng ${currentUser.roomId}) hoặc khu vực chung. Không thể báo thay cho căn hộ khác.`,
          });
        }
        effectiveRoomId = reqRoomId;
      } else {
        effectiveRoomId = currentUser.roomId || null;
      }
    } else {
      // BQL hoặc Admin tạo phiếu thay cư dân
      if (!req.body.residentId || isNaN(Number(req.body.residentId))) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Ban quản lý cần cung cấp mã cư dân (residentId) khi lập phiếu báo hỏng hộ.',
        });
      }
      effectiveResidentId = Number(req.body.residentId);
      effectiveRoomId = roomId ? Number(roomId) : null;
    }

    // CHỐNG DOUBLE-CLICK CONCURRENT REQUEST (5 giây debounce gate)
    cleanOldSubmissions();
    const debounceKey = `${effectiveResidentId}:${effectiveRoomId || 'common'}:${category.trim().toLowerCase()}`;
    const lastSubmitTime = recentSubmissions.get(debounceKey);
    const now = Date.now();
    if (lastSubmitTime && now - lastSubmitTime < 5000) {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Yêu cầu báo hỏng cùng hạng mục vừa được gửi cách đây ít giây. Vui lòng không gửi liên tục!',
      });
    }
    recentSubmissions.set(debounceKey, now);

    // Bọc trong Database Transaction để đảm bảo tính nguyên tử giữa kiểm tra trùng và tạo bản ghi
    const newTicket = await prisma.$transaction(async (tx) => {
      // Thử nghiệm Acquire Advisory Lock trên PostgreSQL để xếp hàng các transaction đồng thời
      try {
        const lockStr = `ticket_dup:${effectiveRoomId || effectiveResidentId}:${category.trim()}`;
        let hash = 0;
        for (let i = 0; i < lockStr.length; i++) {
          hash = (hash << 5) - hash + lockStr.charCodeAt(i);
          hash |= 0;
        }
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${Math.abs(hash)})`);
      } catch {
        // Bỏ qua nếu DB không hỗ trợ pg_advisory_xact_lock (hoặc offline mock test)
      }

      // Xác minh resident tồn tại
      const resident = await tx.user.findUnique({ where: { id: effectiveResidentId } });
      if (!resident) {
        throw new Error('NOT_FOUND_RESIDENT: Tài khoản cư dân không tồn tại trên hệ thống.');
      }

      // Xác minh room tồn tại nếu có
      if (effectiveRoomId) {
        const room = await tx.room.findUnique({ where: { id: effectiveRoomId } });
        if (!room) {
          throw new Error('NOT_FOUND_ROOM: Căn hộ chỉ định không tồn tại trên hệ thống.');
        }
      }

      // THUẬT TOÁN LỌC PHIẾU TRÙNG LẶP TRONG 24 GIỜ (Scope chuẩn theo Căn hộ / Khu chung và Category):
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const duplicateCondition: any = {
        category: category.trim(),
        status: { in: [TicketStatus.PENDING, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS] },
        createdAt: { gte: oneDayAgo },
      };

      if (effectiveRoomId) {
        duplicateCondition.roomId = effectiveRoomId;
      } else {
        duplicateCondition.residentId = effectiveResidentId;
        duplicateCondition.roomId = null;
      }

      const existingSimilarTicket = await tx.ticket.findFirst({
        where: duplicateCondition,
        orderBy: { createdAt: 'desc' },
      });

      const isDuplicate = !!existingSimilarTicket;

      return tx.ticket.create({
        data: {
          title: title ? String(title).trim() : `${category} - ${effectiveRoomId ? `Phòng ${effectiveRoomId}` : 'Khu vực chung'}`,
          category: category.trim(),
          description: description.trim(),
          mediaUrl: mediaUrl || null,
          roomId: effectiveRoomId,
          residentId: effectiveResidentId,
          isDuplicate,
          status: TicketStatus.PENDING,
        },
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, phone: true } },
        },
      });
    });

    res.status(201).json({
      success: true,
      data: newTicket,
      message: newTicket.isDuplicate
        ? 'Phiếu đã được tiếp nhận (Hệ thống ghi nhận có sự cố tương tự cùng căn hộ đang được xử lý trong 24h qua).'
        : 'Gửi phiếu báo hỏng thành công.',
    });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND_')) {
      return res.status(404).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi gửi phiếu sự cố' });
  }
});

// =========================================================================
// 5. BAN QUẢN LÝ GÁN VIỆC CHO THỢ KỸ THUẬT (ACID Transaction)
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

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Kiểm tra phiếu có tồn tại và chưa đóng
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        throw new Error('NOT_FOUND: Không tìm thấy phiếu sự cố.');
      }
      if (ticket.status === TicketStatus.CLOSED) {
        throw new Error('CLOSED_TICKET: Phiếu này đã đóng hoàn tất (CLOSED). Không thể gán việc lại.');
      }

      // 2. Kiểm tra tài khoản thợ có đúng Role TECHNICIAN không
      const technician = await tx.user.findUnique({ where: { id: Number(technicianId) } });
      if (!technician) {
        throw new Error('NOT_FOUND_TECH: Không tìm thấy tài khoản thợ kỹ thuật.');
      }
      if (technician.role !== Role.TECHNICIAN) {
        throw new Error(`INVALID_ROLE: Tài khoản [${technician.fullName}] có vai trò là [${technician.role}], không phải [TECHNICIAN].`);
      }

      return tx.ticket.update({
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
    });

    res.json({
      success: true,
      data: updated,
      message: `Đã phân công thành công cho thợ kỹ thuật: ${updated.technician?.fullName}`,
    });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND')) {
      return res.status(404).json({ success: false, data: null, message: error.message.split(': ')[1] || error.message });
    }
    if (error.message?.startsWith('CLOSED_TICKET:') || error.message?.startsWith('INVALID_ROLE:')) {
      return res.status(400).json({ success: false, data: null, message: error.message.split(': ')[1] || error.message });
    }
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

    // Chặn ảnh Base64 nếu có gửi ảnh nghiệm thu
    if (completedMediaUrl && !isValidMediaUrl(completedMediaUrl)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Ảnh nghiệm thu không hợp lệ hoặc chứa mã Base64! Vui lòng tải ảnh lên Cloud trước.',
      });
    }

    const currentUser = req.user!;

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        throw new Error('NOT_FOUND: Không tìm thấy phiếu sự cố.');
      }

      const isAssignedTech = ticket.technicianId === currentUser.id;
      const isCreator = ticket.residentId === currentUser.id;

      const transitionCheck = canTransitionTicketStatus(
        ticket.status,
        status as TicketStatus,
        currentUser.role,
        isAssignedTech,
        isCreator
      );

      if (!transitionCheck.allowed) {
        throw new Error(`INVALID_TRANSITION: ${transitionCheck.reason || 'Bước chuyển trạng thái không hợp lệ.'}`);
      }

      const updateData: any = { status: status as TicketStatus };
      if (completedMediaUrl) {
        updateData.completedMediaUrl = completedMediaUrl;
      }

      return tx.ticket.update({
        where: { id: ticketId },
        data: updateData,
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, phone: true } },
          technician: { select: { id: true, fullName: true, phone: true } },
        },
      });
    });

    res.json({ success: true, data: updated, message: `Cập nhật trạng thái thành công: ${status}` });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    if (error.message?.startsWith('INVALID_TRANSITION:')) {
      return res.status(400).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi cập nhật trạng thái' });
  }
});

// =========================================================================
// 7. THỢ KỸ THUẬT KÊ KHAI VẬT TƯ THAY THẾ (Chặn Base64, Khóa khi đã CLOSED)
// POST /api/tickets/:id/materials hoặc POST /api/technician/tickets/:id/materials
// =========================================================================
router.post('/:id/materials', async (req: Request, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    const { materials } = req.body;

    if (isNaN(ticketId)) {
      return res.status(400).json({ success: false, data: null, message: 'ID phiếu không hợp lệ.' });
    }

    const validation = sanitizeMaterials(materials);
    if (!validation.isValid) {
      return res.status(400).json({ success: false, data: null, message: validation.error });
    }

    const currentUser = req.user!;

    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        throw new Error('NOT_FOUND: Không tìm thấy phiếu sự cố.');
      }

      // 1. Phân quyền: Chỉ thợ được chỉ định hoặc Ban quản lý mới được kê khai vật tư
      if (currentUser.role === Role.TECHNICIAN && ticket.technicianId !== currentUser.id) {
        throw new Error('FORBIDDEN: Bạn không được chỉ định phụ trách phiếu này nên không thể kê khai vật tư.');
      }
      if (currentUser.role === Role.RESIDENT) {
        throw new Error('FORBIDDEN: Cư dân không có quyền kê khai vật tư kỹ thuật.');
      }

      // 2. Trạng thái: Chỉ được kê khai khi đang sửa hoặc mới xong chưa đóng
      if (ticket.status === TicketStatus.CLOSED) {
        throw new Error('LOCKED: Phiếu đã nghiệm thu đóng hoàn tất (CLOSED). Danh mục vật tư đã bị khóa và không thể chỉnh sửa.');
      }
      if (ticket.status !== TicketStatus.IN_PROGRESS && ticket.status !== TicketStatus.COMPLETED) {
        throw new Error(`INVALID_STATUS: Chỉ có thể kê khai vật tư khi phiếu đang ở trạng thái [IN_PROGRESS] hoặc [COMPLETED] (Hiện tại: ${ticket.status}).`);
      }

      return tx.ticket.update({
        where: { id: ticketId },
        data: { materials: validation.sanitized },
      });
    });

    res.json({ success: true, data: updated, message: 'Kê khai vật tư thay thế thành công' });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    if (error.message?.startsWith('FORBIDDEN:')) {
      return res.status(403).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    if (error.message?.startsWith('LOCKED:') || error.message?.startsWith('INVALID_STATUS:')) {
      return res.status(400).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
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

    const currentUser = req.user!;

    // Bọc trong ACID Transaction để đảm bảo chỉ có 1 request nghiệm thu đóng phiếu thành công duy nhất
    const updated = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        throw new Error('NOT_FOUND: Không tìm thấy phiếu sự cố.');
      }

      // 1. Kiểm tra trạng thái: Phải là COMPLETED (thợ sửa xong) mới được nghiệm thu
      if (ticket.status === TicketStatus.CLOSED) {
        throw new Error('ALREADY_CLOSED: Phiếu này đã được nghiệm thu và đóng trước đó rồi.');
      }
      if (ticket.status !== TicketStatus.COMPLETED) {
        throw new Error(`INVALID_STATUS: Chỉ có thể nghiệm thu chấm điểm khi Thợ đã hoàn thành sửa chữa (COMPLETED). Hiện tại: ${ticket.status}.`);
      }

      // 2. Phân quyền: Chỉ cư dân tạo phiếu hoặc BQL mới có quyền nghiệm thu đóng phiếu
      if (currentUser.role === Role.RESIDENT && ticket.residentId !== currentUser.id) {
        throw new Error('FORBIDDEN: Chỉ cư dân gửi phiếu này mới có quyền nghiệm thu và chấm điểm.');
      }
      if (currentUser.role === Role.TECHNICIAN) {
        throw new Error('FORBIDDEN: Thợ kỹ thuật không thể tự nghiệm thu và chấm điểm công việc của chính mình.');
      }

      return tx.ticket.update({
        where: { id: ticketId },
        data: {
          rating: Number(rating),
          ratingComment: ratingComment ? String(ratingComment).trim().slice(0, 500) : null,
          status: TicketStatus.CLOSED,
        },
      });
    });

    res.json({
      success: true,
      data: updated,
      message: 'Nghiệm thu hoàn tất và đã đóng phiếu sự cố. Cảm ơn phản hồi của bạn!',
    });
  } catch (error: any) {
    if (error.message?.startsWith('NOT_FOUND:')) {
      return res.status(404).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    if (error.message?.startsWith('FORBIDDEN:')) {
      return res.status(403).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    if (error.message?.startsWith('ALREADY_CLOSED:') || error.message?.startsWith('INVALID_STATUS:')) {
      return res.status(400).json({ success: false, data: null, message: error.message.split(': ')[1] });
    }
    res.status(500).json({ success: false, data: null, message: error.message || 'Lỗi lưu đánh giá nghiệm thu' });
  }
});

export default router;
