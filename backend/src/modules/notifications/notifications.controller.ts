// =========================================================================
// BỘ ĐIỀU KHIỂN PHÂN HỆ THÔNG BÁO TÒA NHÀ (NOTIFICATIONS CONTROLLER)
// Phụ trách: Việt Hoàng (Backend Lead)
// Chức năng:
//   1. GET  /api/notifications - Xem danh sách thông báo (phân quyền nghiêm ngặt)
//   2. POST /api/notifications - Admin & BQL soạn và phát thông báo mới
// =========================================================================

import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRoles } from '../../common/middleware/auth';
import { ApiResponse } from '../../common/types/api-response';
import {
  validateCreateNotificationInput,
  validateNotificationQuery,
} from './notifications.validator';
import { NotificationService } from './notifications.service';

const router = Router();

/**
 * GET /api/notifications
 * Lấy danh sách thông báo theo phân quyền người dùng và phân trang
 * - ADMIN/BQL: Xem toàn bộ thông báo tòa nhà
 * - RESIDENT: Xem thông báo chung + thông báo của căn hộ mình
 * - TECHNICIAN: Xem thông báo chung toàn tòa nhà
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const query = validateNotificationQuery(req.query);

    const result = await NotificationService.getNotifications({
      user,
      page: query.page,
      limit: query.limit,
      targetRoom: query.targetRoom,
    });

    const response: ApiResponse<typeof result.notifications> = {
      success: true,
      data: result.notifications,
      message: 'Lấy danh sách thông báo thành công.',
      pagination: result.pagination,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[Notifications Controller Error - GET /]:', err.message);
    const statusCode = err.statusCode || 500;
    const response: ApiResponse<null> = {
      success: false,
      data: null,
      message: err.message || 'Lỗi máy chủ khi tải danh sách thông báo.',
    };
    return res.status(statusCode).json(response);
  }
});

/**
 * POST /api/notifications
 * Soạn và phát thông báo mới (Chỉ dành cho ADMIN và BQL)
 * Hỗ trợ thông báo chung (targetRoom: null) hoặc riêng căn hộ (targetRoom: "101")
 */
router.post(
  '/',
  requireAuth,
  requireRoles(Role.ADMIN, Role.BQL),
  async (req: Request, res: Response) => {
    try {
      const user = req.user!;

      // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào
      const validation = validateCreateNotificationInput(req.body);
      if (!validation.isValid || !validation.data) {
        const response: ApiResponse<null> = {
          success: false,
          data: null,
          message: validation.error || 'Dữ liệu thông báo không hợp lệ.',
        };
        return res.status(400).json(response);
      }

      // 2. Gọi Service để tạo bản ghi và phát Socket.IO
      // authorId lấy tuyệt đối từ principal đã xác thực (chống giả mạo authorId)
      const notification = await NotificationService.createNotification({
        title: validation.data.title,
        content: validation.data.content,
        targetRoom: validation.data.targetRoom,
        authorId: user.id,
      });

      const response: ApiResponse<typeof notification> = {
        success: true,
        data: notification,
        message: validation.data.targetRoom
          ? `Tạo và gửi thông báo tới căn hộ [${validation.data.targetRoom}] thành công.`
          : 'Tạo và phát thông báo chung toàn tòa nhà thành công.',
      };

      return res.status(201).json(response);
    } catch (err: any) {
      console.error('[Notifications Controller Error - POST /]:', err.message);
      const statusCode = err.statusCode || 500;
      const response: ApiResponse<null> = {
        success: false,
        data: null,
        message: err.message || 'Lỗi máy chủ khi tạo thông báo.',
      };
      return res.status(statusCode).json(response);
    }
  }
);

export default router;
