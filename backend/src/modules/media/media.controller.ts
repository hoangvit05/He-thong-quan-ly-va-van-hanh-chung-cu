// =========================================================================
// CONTROLLER TẢI LÊN ĐA PHƯƠNG TIỆN (MEDIA UPLOAD CONTROLLER)
// Phụ trách: Việt Hoàng — Backend Lead
// =========================================================================
import { Router, Request, Response } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validateSignatureRequest, validateConfirmRequest } from './media.validator';
import { createUploadSignature, confirmUploadedAsset, generateSignedAccessUrl } from './media.service';

const router = Router();

// Toàn bộ các thao tác tải lên và xác nhận media bắt buộc phải đăng nhập (Bearer Token)
router.use(requireAuth);

/**
 * 1. CẤP CHỮ KÝ TẢI LÊN CLOUDINARY TRỰC TIẾP (DIRECT SIGNED UPLOAD)
 * POST /api/media/signature
 */
router.post('/signature', async (req: Request, res: Response) => {
  try {
    const validation = validateSignatureRequest(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.error || 'Dữ liệu yêu cầu cấp chữ ký không hợp lệ.',
      });
    }

    const currentUser = req.user!;
    const signatureData = await createUploadSignature(currentUser, validation.data);

    res.json({
      success: true,
      data: signatureData,
      message: 'Cấp chữ ký tải lên Cloudinary thành công.',
    });
  } catch (error: any) {
    const errorMsg = error?.message || 'Lỗi xử lý cấp chữ ký tải lên';

    if (errorMsg.startsWith('CLOUDINARY_NOT_CONFIGURED')) {
      return res.status(503).json({
        success: false,
        data: null,
        message: 'Dịch vụ lưu trữ tệp Cloudinary chưa được cấu hình trên máy chủ.',
      });
    }

    if (errorMsg.startsWith('FORBIDDEN_')) {
      return res.status(403).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    if (errorMsg.startsWith('NOT_FOUND_')) {
      return res.status(404).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    if (
      errorMsg.startsWith('INVALID_') ||
      errorMsg.startsWith('MISSING_')
    ) {
      return res.status(400).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    console.error('[Media Controller - Signature Error]:', errorMsg);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi nội bộ khi khởi tạo phiên tải lên tệp.',
    });
  }
});

/**
 * 2. XÁC NHẬN TÀI SẢN ĐÃ TẢI LÊN (CONFIRM UPLOADED ASSET)
 * POST /api/media/confirm
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const validation = validateConfirmRequest(req.body);
    if (!validation.isValid || !validation.data) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.error || 'Dữ liệu yêu cầu xác nhận không hợp lệ.',
      });
    }

    const currentUser = req.user!;
    const confirmedData = await confirmUploadedAsset(currentUser, validation.data);

    res.json({
      success: true,
      data: confirmedData,
      message: 'Xác nhận tệp tải lên thành công.',
    });
  } catch (error: any) {
    const errorMsg = error?.message || 'Lỗi xử lý xác nhận tải lên';

    if (errorMsg.startsWith('FORBIDDEN_')) {
      return res.status(403).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    if (errorMsg.startsWith('ASSET_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    if (
      errorMsg.startsWith('FILE_TOO_LARGE') ||
      errorMsg.startsWith('INVALID_FORMAT') ||
      errorMsg.startsWith('MISMATCHED_') ||
      errorMsg.startsWith('INVALID_INTENT_') ||
      errorMsg.startsWith('EXPIRED_INTENT_') ||
      errorMsg.startsWith('MALFORMED_INTENT_')
    ) {
      return res.status(400).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    if (errorMsg.startsWith('CLOUDINARY_API_ERROR')) {
      return res.status(502).json({
        success: false,
        data: null,
        message: errorMsg.split(': ')[1] || errorMsg,
      });
    }

    console.error('[Media Controller - Confirm Error]:', errorMsg);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi nội bộ khi xác nhận tệp đã tải lên.',
    });
  }
});

import { Role } from '@prisma/client';
import prisma from '../../database/prisma';

/**
 * 3. LẤY ĐƯỜNG DẪN TRUY CẬP CÓ CHỮ KÝ CÓ THỜI HẠN (SIGNED EXPIRING ACCESS URL)
 * GET /api/media/access/:publicId
 * Áp dụng Record-Level Access Control: Chỉ cấp URL cho người dùng có thẩm quyền đối với sự cố/căn hộ
 */
router.get('/access/:publicId(*)', async (req: Request, res: Response) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId || !publicId.trim()) {
      return res.status(400).json({ success: false, data: null, message: 'Thiếu định danh publicId.' });
    }

    const trimmedPublicId = publicId.trim();
    const currentUser = req.user!;

    // Phân quyền đọc tài sản nhạy cảm:
    // 1. ADMIN và BQL có quyền xem toàn bộ media trong hệ thống tòa nhà
    if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.BQL) {
      // 2. Nếu là thông báo chung (announcements) -> Cho phép toàn bộ cư dân/thợ xem
      const isAnnouncement = trimmedPublicId.includes('announcements');
      if (!isAnnouncement) {
        // 3. Nếu là ảnh sự cố hoặc vật tư: kiểm tra theo ticket hoặc user
        const ticketMatch = trimmedPublicId.match(/ticket_(\d+)/) || trimmedPublicId.match(/t_(\d+)/);
        if (ticketMatch) {
          const ticketId = parseInt(ticketMatch[1], 10);
          const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { residentId: true, roomId: true, technicianId: true },
          });

          if (!ticket) {
            return res.status(404).json({ success: false, data: null, message: 'Không tìm thấy phiếu sự cố liên quan.' });
          }

          if (currentUser.role === Role.RESIDENT) {
            const isOwner = ticket.residentId === currentUser.id;
            const isRoomResident = !!(ticket.roomId && currentUser.roomId && ticket.roomId === currentUser.roomId);
            if (!isOwner && !isRoomResident) {
              return res.status(403).json({
                success: false,
                data: null,
                message: 'Bạn không có quyền truy cập hình ảnh sự cố của căn hộ khác.',
              });
            }
          } else if (currentUser.role === Role.TECHNICIAN) {
            if (ticket.technicianId !== currentUser.id) {
              return res.status(403).json({
                success: false,
                data: null,
                message: 'Thợ kỹ thuật chỉ có quyền xem ảnh của phiếu sự cố được phân công trực tiếp cho mình.',
              });
            }
          }
        } else {
          // Nếu không có ticketId trong path, kiểm tra theo userId trong publicId (ví dụ: tickets_u42_...)
          const userMatch = trimmedPublicId.match(/u_?(\d+)/);
          if (userMatch) {
            const ownerUserId = parseInt(userMatch[1], 10);
            if (currentUser.id !== ownerUserId) {
              return res.status(403).json({
                success: false,
                data: null,
                message: 'Bạn không có quyền truy cập tệp tải lên của người dùng khác.',
              });
            }
          }
        }
      }
    }

    const resourceType = req.query.resourceType === 'video' ? 'video' : 'image';
    const signedUrl = generateSignedAccessUrl(trimmedPublicId, resourceType);

    res.json({
      success: true,
      data: { publicId: trimmedPublicId, accessUrl: signedUrl },
      message: 'Tạo đường dẫn truy cập có chữ ký thành công.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      data: null,
      message: error?.message || 'Lỗi khi tạo đường dẫn truy cập.',
    });
  }
});

export default router;
