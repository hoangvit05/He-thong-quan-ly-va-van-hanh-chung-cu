// =========================================================================
// PHÂN HỆ HÒM THƯ GÓP Ý & PHẢN ÁNH CỦA CƯ DÂN (FEEDBACK MODULE)
// Phụ trách: Hiếu
// Chức năng: Cư dân gửi phản ánh, BQL tra cứu, phản hồi và cập nhật trạng thái
// An toàn bảo mật: RBAC, Record-Level Access Control, Chống ID Probing, ACID Transaction
// =========================================================================
import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';
import {
  validateFeedbackInput,
  validateReplyInput,
  validateStatusInput,
} from './feedback.validator';

const router = Router();

// BẮT BUỘC: Toàn bộ API của Feedback Module đều yêu cầu xác thực người dùng
router.use(extractUser);
router.use(requireAuth);

// =========================================================================
// 1. CƯ DÂN GỬI PHẢN ÁNH / GÓP Ý MỚI
// POST /api/feedback
// =========================================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    // 1. Phân quyền vai trò: Chỉ Cư dân (RESIDENT) mới có quyền gửi phản ánh
    if (currentUser.role !== Role.RESIDENT) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Chỉ tài khoản Cư dân (RESIDENT) mới có quyền gửi phản ánh, góp ý.',
      });
    }

    // 2. Kiểm tra tính hợp lệ của dữ liệu đầu vào
    const validation = validateFeedbackInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    // 3. Bảo mật danh tính: Bắt buộc lấy residentId từ token đã xác thực, không tin client
    const effectiveResidentId = currentUser.id;

    // 4. Bảo mật phạm vi phòng: Cư dân chỉ có thể gửi cho phòng của mình hoặc khu vực chung (null)
    let effectiveRoomId: number | null = null;
    if (req.body.roomId !== undefined && req.body.roomId !== null && req.body.roomId !== '') {
      const requestedRoomId = Number(req.body.roomId);

      // Nếu cư dân chưa được gán căn hộ (roomId = null), chỉ được gửi phản ánh chung cho tòa nhà
      if (!currentUser.roomId) {
        return res.status(403).json({
          success: false,
          data: null,
          message: 'Tài khoản của bạn chưa được liên kết với căn hộ nào. Bạn chỉ có quyền gửi phản ánh chung cho tòa nhà (bỏ trống roomId).',
        });
      }

      if (requestedRoomId !== currentUser.roomId) {
        return res.status(403).json({
          success: false,
          data: null,
          message: `Bạn chỉ có quyền gửi phản ánh cho căn hộ của mình (Phòng ${currentUser.roomId}) hoặc phản ánh chung cho tòa nhà (roomId = null). Không thể gửi thay cho căn hộ khác.`,
        });
      }
      effectiveRoomId = requestedRoomId;
    } else {
      effectiveRoomId = currentUser.roomId || null;
    }

    // 5. Ghi vào database (Loại bỏ hoàn toàn các trường client cố ý tiêm vào như reply, isResolved, repliedAt)
    const newFeedback = await prisma.feedback.create({
      data: {
        residentId: effectiveResidentId,
        roomId: effectiveRoomId,
        title: req.body.title.trim(),
        content: req.body.content.trim(),
        reply: null,
        isResolved: false,
        repliedAt: null,
      },
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, roomId: true } },
      },
    });

    res.status(201).json({
      success: true,
      data: newFeedback,
      message: 'Gửi góp ý, phản ánh thành công.',
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - POST /]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi gửi phản ánh. Vui lòng thử lại sau.',
    });
  }
});

// =========================================================================
// 2. CƯ DÂN TRA CỨU DANH SÁCH GÓP Ý CỦA CHÍNH MÌNH
// GET /api/feedback/my-feedback
// =========================================================================
router.get('/my-feedback', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    if (currentUser.role !== Role.RESIDENT) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Endpoint này chỉ dành riêng cho Cư dân tra cứu danh sách góp ý của chính mình.',
      });
    }

    const { isResolved, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { residentId: currentUser.id };
    if (isResolved !== undefined) {
      if (isResolved === 'true') where.isResolved = true;
      if (isResolved === 'false') where.isResolved = false;
    }

    const [total, feedbacks] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, roomId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: feedbacks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      message: 'Lấy danh sách phản ánh cá nhân thành công.',
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - GET /my-feedback]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh sách phản ánh cá nhân.',
    });
  }
});

// =========================================================================
// 3. LẤY DANH SÁCH GÓP Ý CÓ PHÂN TRANG VÀ BỘ LỌC
// GET /api/feedback
// =========================================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    // 1. Chặn Thợ kỹ thuật truy cập phân hệ phản ánh
    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền truy cập hòm thư góp ý/phản ánh.',
      });
    }

    const {
      roomId,
      residentId,
      isResolved,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    // 2. Kiểm soát phạm vi truy cập theo bản ghi (Record-Level Access Control)
    if (currentUser.role === Role.RESIDENT) {
      // Cư dân TUYỆT ĐỐI CHỈ xem danh sách phản ánh của chính mình
      where.residentId = currentUser.id;
      if (roomId && !isNaN(Number(roomId))) {
        // Nếu cư dân lọc theo phòng, chỉ cho phép nếu khớp phòng của họ
        if (currentUser.roomId && Number(roomId) === currentUser.roomId) {
          where.roomId = Number(roomId);
        }
      }
    } else if (currentUser.role === Role.ADMIN || currentUser.role === Role.BQL) {
      // BQL & Admin có toàn quyền lọc theo cư dân hoặc căn hộ
      if (residentId && !isNaN(Number(residentId))) {
        where.residentId = Number(residentId);
      }
      if (roomId && !isNaN(Number(roomId))) {
        where.roomId = Number(roomId);
      }
    }

    // 3. Bộ lọc trạng thái giải quyết
    if (isResolved !== undefined) {
      if (isResolved === 'true') where.isResolved = true;
      if (isResolved === 'false') where.isResolved = false;
    }

    // 4. Tìm kiếm từ khóa theo tiêu đề hoặc nội dung (giới hạn độ dài để chống ReDoS / Slow Query)
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const trimmedSearch = search.trim().slice(0, 100);
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { title: { contains: trimmedSearch, mode: 'insensitive' } },
          { content: { contains: trimmedSearch, mode: 'insensitive' } },
        ],
      });
    }

    // 5. Truy vấn phân trang
    const [total, feedbacks] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, roomId: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: feedbacks,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
      message: 'Lấy danh sách góp ý/phản ánh thành công.',
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - GET /]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh sách phản ánh.',
    });
  }
});

// =========================================================================
// 4. XEM CHI TIẾT MỘT PHẢN ÁNH
// GET /api/feedback/:id
// =========================================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    if (currentUser.role === Role.TECHNICIAN) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản Thợ kỹ thuật không có quyền truy cập hòm thư góp ý/phản ánh.',
      });
    }

    const feedbackId = Number(req.params.id);
    if (isNaN(feedbackId) || feedbackId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mã phản ánh (id) không hợp lệ.',
      });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: {
        room: true,
        resident: { select: { id: true, fullName: true, roomId: true } },
      },
    });

    // BẢO MẬT CHỐNG DÒ TÌM ID (ANTI-ENUMERATION):
    // Trả về 404 cho cả hai trường hợp: không tồn tại HOẶC thuộc về cư dân khác
    // Điều này ngăn kẻ xấu dò quét ID để biết phản ánh nào tồn tại trong hệ thống
    if (!feedback || (currentUser.role === Role.RESIDENT && feedback.residentId !== currentUser.id)) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy phản ánh hoặc bạn không có quyền truy cập phản ánh này.',
      });
    }

    res.json({
      success: true,
      data: feedback,
      message: 'Chi tiết phản ánh của cư dân.',
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - GET /:id]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy chi tiết phản ánh.',
    });
  }
});

// =========================================================================
// 5. BAN QUẢN LÝ / ADMIN TRẢ LỜI PHẢN ÁNH
// POST /api/feedback/:id/reply hoặc PUT /api/feedback/:id/reply
// =========================================================================
const handleReply = async (req: Request, res: Response) => {
  try {
    const feedbackId = Number(req.params.id);
    if (isNaN(feedbackId) || feedbackId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mã phản ánh (id) không hợp lệ.',
      });
    }

    const validation = validateReplyInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    // Mặc định khi BQL trả lời, coi như phản ánh đã được tiếp nhận và xử lý (isResolved = true)
    // Trừ khi BQL chủ động truyền cờ isResolved: false
    const resolvedValue = req.body.isResolved !== undefined ? Boolean(req.body.isResolved) : true;

    // Cập nhật nguyên tử bảo đảm tính nhất quán (ACID Transaction)
    const updatedFeedback = await prisma.$transaction(async (tx) => {
      const existing = await tx.feedback.findUnique({
        where: { id: feedbackId },
      });

      if (!existing) {
        return null;
      }

      return tx.feedback.update({
        where: { id: feedbackId },
        data: {
          reply: String(req.body.reply).trim(),
          isResolved: resolvedValue,
          repliedAt: new Date(),
        },
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, roomId: true } },
        },
      });
    });

    if (!updatedFeedback) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy phản ánh cần phản hồi.',
      });
    }

    res.json({
      success: true,
      data: updatedFeedback,
      message: 'Gửi phản hồi cho cư dân thành công.',
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - handleReply]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi gửi phản hồi.',
    });
  }
};

router.post('/:id/reply', requireRoles(Role.ADMIN, Role.BQL), handleReply);
router.put('/:id/reply', requireRoles(Role.ADMIN, Role.BQL), handleReply);

// =========================================================================
// 6. BAN QUẢN LÝ / ADMIN CẬP NHẬT TRẠNG THÁI GIẢI QUYẾT ĐỘC LẬP
// PATCH /api/feedback/:id/status
// =========================================================================
router.patch('/:id/status', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const feedbackId = Number(req.params.id);
    if (isNaN(feedbackId) || feedbackId <= 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mã phản ánh (id) không hợp lệ.',
      });
    }

    const validation = validateStatusInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const updatedFeedback = await prisma.$transaction(async (tx) => {
      const existing = await tx.feedback.findUnique({
        where: { id: feedbackId },
      });

      if (!existing) {
        return null;
      }

      return tx.feedback.update({
        where: { id: feedbackId },
        data: {
          isResolved: Boolean(req.body.isResolved),
        },
        include: {
          room: true,
          resident: { select: { id: true, fullName: true, roomId: true } },
        },
      });
    });

    if (!updatedFeedback) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy phản ánh cần cập nhật trạng thái.',
      });
    }

    res.json({
      success: true,
      data: updatedFeedback,
      message: `Cập nhật trạng thái phản ánh thành công (${updatedFeedback.isResolved ? 'Đã giải quyết' : 'Chưa giải quyết'}).`,
    });
  } catch (error: any) {
    console.error('[Feedback Controller Error - PATCH /:id/status]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi cập nhật trạng thái phản ánh.',
    });
  }
});

export default router;
