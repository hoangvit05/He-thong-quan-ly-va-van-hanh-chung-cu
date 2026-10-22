// =========================================================================
// DỊCH VỤ QUẢN LÝ THÔNG BÁO TÒA NHÀ (NOTIFICATION SERVICE)
// Phụ trách: Việt Hoàng (Backend Lead)
// Mục tiêu: Đóng gói logic nghiệp vụ thông báo, hỗ trợ gọi nội bộ từ các
//           module khác (Tickets, Invoices) trong tương lai.
// =========================================================================

import { PrismaClient, Role } from '@prisma/client';
import defaultPrisma from '../../database/prisma';
import { AuthUser } from '../../common/types/auth';
import { emitNewNotification, NotificationPayload } from './notifications.socket';

export interface CreateNotificationParams {
  title: string;
  content: string;
  targetRoom?: string | null;
  authorId: number;
}

export interface GetNotificationsParams {
  user: AuthUser;
  page?: number;
  limit?: number;
  targetRoom?: string;
}

export class NotificationService {
  /**
   * Tạo thông báo mới và phát sự kiện realtime
   */
  static async createNotification(
    params: CreateNotificationParams,
    prisma: PrismaClient = defaultPrisma
  ) {
    const { title, content, targetRoom, authorId } = params;

    // 1. Nếu có chỉ định targetRoom, kiểm tra tính tồn tại của căn hộ trong CSDL
    if (targetRoom) {
      const roomExists = await prisma.room.findUnique({
        where: { roomNumber: targetRoom },
        select: { id: true, roomNumber: true },
      });

      if (!roomExists) {
        const error: any = new Error(`Căn hộ đích [${targetRoom}] không tồn tại trong hệ thống tòa nhà.`);
        error.statusCode = 400;
        throw error;
      }
    }

    // 2. Ghi bản ghi vào CSDL qua Prisma
    const notification = await prisma.notification.create({
      data: {
        title,
        content,
        targetRoom: targetRoom || null,
        authorId,
      },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            role: true,
            username: true,
          },
        },
      },
    });

    // 3. Phát sự kiện realtime qua Socket.IO (Fail-safe: Không làm hỏng response nếu Socket gặp sự cố)
    try {
      const payload: NotificationPayload = {
        id: notification.id,
        title: notification.title,
        content: notification.content,
        targetRoom: notification.targetRoom,
        authorId: notification.authorId,
        author: notification.author,
        createdAt: notification.createdAt,
      };
      emitNewNotification(payload);
    } catch (socketErr) {
      console.warn('[NotificationService Warning]: Phát sự kiện Socket.IO gặp lỗi:', socketErr);
    }

    return notification;
  }

  /**
   * Lấy danh sách thông báo theo phân quyền và phân trang an toàn
   */
  static async getNotifications(
    params: GetNotificationsParams,
    prisma: PrismaClient = defaultPrisma
  ) {
    const { user, page = 1, limit = 20, targetRoom } = params;
    const skip = (page - 1) * limit;

    // Xây dựng điều kiện lọc (WHERE clause) bảo vệ cấp cơ sở dữ liệu
    const where: any = {};

    if (user.role === Role.ADMIN || user.role === Role.BQL) {
      // Ban quản trị và BQL: Xem toàn bộ thông báo của tòa nhà, có thể lọc theo targetRoom
      if (targetRoom) {
        where.targetRoom = targetRoom;
      }
    } else if (user.role === Role.RESIDENT) {
      // Cư dân: Chỉ xem thông báo chung (targetRoom: null) VÀ thông báo gửi đích danh phòng mình
      let userRoomNumber: string | null = null;

      // Tra cứu số phòng thực tế từ CSDL để đảm bảo tính nhất quán (Anti-Stale Token / Anti-IDOR)
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { roomId: true, room: { select: { roomNumber: true } } },
        });
        if (dbUser?.room) {
          userRoomNumber = dbUser.room.roomNumber;
        } else if (user.roomId) {
          const room = await prisma.room.findUnique({
            where: { id: user.roomId },
            select: { roomNumber: true },
          });
          if (room) {
            userRoomNumber = room.roomNumber;
          }
        }
      } catch {
        if (user.roomId) {
          const room = await prisma.room.findUnique({
            where: { id: user.roomId },
            select: { roomNumber: true },
          });
          if (room) {
            userRoomNumber = room.roomNumber;
          }
        }
      }

      if (userRoomNumber) {
        where.OR = [{ targetRoom: null }, { targetRoom: userRoomNumber }];
      } else {
        // Cư dân chưa được gán phòng: Chỉ nhận thông báo chung
        where.targetRoom = null;
      }
    } else if (user.role === Role.TECHNICIAN) {
      // Thợ kỹ thuật: Chỉ xem thông báo chung toàn tòa nhà
      where.targetRoom = null;
    }

    // Thực hiện đếm tổng số bản ghi và lấy dữ liệu phân trang
    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // Sắp xếp ổn định
        include: {
          author: {
            select: {
              id: true,
              fullName: true,
              role: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }
}
