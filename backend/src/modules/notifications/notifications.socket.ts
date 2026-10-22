// =========================================================================
// QUẢN LÝ SOCKET.IO REALTIME (NOTIFICATIONS & EVENTS REALTIME MANAGER)
// Phụ trách: Việt Hoàng (Backend Lead)
// =========================================================================

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { getJwtSecret } from '../../common/middleware/auth';
import prisma from '../../database/prisma';

export interface AuthenticatedSocketUser {
  id: number;
  role: Role;
  username: string;
  fullName: string;
  roomId: number | null;
  roomNumber?: string | null;
}

export interface NotificationPayload {
  id: number;
  title: string;
  content: string;
  targetRoom: string | null;
  authorId: number | null;
  author?: {
    id: number;
    fullName: string;
    role: Role;
    username: string;
  } | null;
  createdAt: Date | string;
}

let ioInstance: SocketIOServer | null = null;

/**
 * Khởi tạo Socket.IO Server và gắn middleware xác thực JWT
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  ioInstance = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // 1. Socket Authentication Middleware: Bắt buộc xác thực Token trước khi kết nối
  ioInstance.use(async (socket: Socket, next) => {
    try {
      const authHeader = socket.handshake.headers.authorization;
      const token =
        socket.handshake.auth?.token ||
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null);

      if (!token) {
        return next(new Error('AUTHENTICATION_ERROR: Authorization Bearer Token không được cung cấp.'));
      }

      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;

      if (!decoded || !decoded.id || !decoded.role) {
        return next(new Error('AUTHENTICATION_ERROR: Mã xác thực không hợp lệ hoặc thiếu thông tin danh tính.'));
      }

      const userPayload: AuthenticatedSocketUser = {
        id: Number(decoded.id),
        role: decoded.role as Role,
        username: decoded.username,
        fullName: decoded.fullName,
        roomId: decoded.roomId ? Number(decoded.roomId) : null,
      };

      // Gắn thông tin người dùng vào socket data
      socket.data.user = userPayload;
      next();
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return next(new Error('AUTHENTICATION_ERROR: Phiên đăng nhập đã hết hạn (Token Expired).'));
      }
      return next(new Error(`AUTHENTICATION_ERROR: ${err.message || 'Xác thực socket thất bại.'}`));
    }
  });

  // 2. Xử lý kết nối và phân bổ Room logic theo dữ liệu Backend
  ioInstance.on('connection', async (socket: Socket) => {
    const user = socket.data.user as AuthenticatedSocketUser;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // A. Mọi người dùng đã xác thực đều tham gia Room cá nhân và Room toàn chung cư
    socket.join(`user:${user.id}`);
    socket.join('building:all');

    // B. Phân bổ Room theo vai trò:
    if (user.role === Role.ADMIN || user.role === Role.BQL) {
      // Room dành riêng cho ban quản trị và ban quản lý
      socket.join('staff:all');
    } else if (user.role === Role.TECHNICIAN) {
      // Room dành riêng cho thợ kỹ thuật
      socket.join('technician:all');
    } else if (user.role === Role.RESIDENT) {
      // Cư dân: Chỉ tham gia room căn hộ được Backend xác thực, không tin input từ client
      // Tra cứu số phòng thực tế của User từ CSDL để triệt tiêu nguy cơ Stale Token
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { roomId: true, room: { select: { roomNumber: true } } },
        });
        if (dbUser?.room) {
          user.roomId = dbUser.roomId;
          user.roomNumber = dbUser.room.roomNumber;
          socket.join(`room:${dbUser.room.roomNumber}`);
        } else if (user.roomId) {
          // Fallback nếu người dùng chưa cập nhật quan hệ user
          const room = await prisma.room.findUnique({
            where: { id: user.roomId },
            select: { roomNumber: true },
          });
          if (room) {
            user.roomNumber = room.roomNumber;
            socket.join(`room:${room.roomNumber}`);
          }
        }
      } catch (dbErr) {
        console.error(`[Socket Error]: Không thể nạp room cho cư dân [${user.id}]:`, dbErr);
      }
    }

    socket.on('disconnect', () => {
      // Socket tự động rời toàn bộ room khi ngắt kết nối
    });
  });

  return ioInstance;
}

/**
 * Lấy singleton instance của Socket.IO Server
 */
export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}

export interface SocketRoomUpdateResult {
  success: boolean;
  fallbackDisconnected: boolean;
  error?: string;
}

/**
 * Cập nhật room membership cho các socket đang kết nối của một người dùng khi chuyển phòng
 * Giải quyết kịch bản: Cư dân đổi phòng trong khi socket vẫn đang duy trì kết nối
 * Fail-safe: Nếu việc cập nhật membership thất bại, tiến hành ngắt kết nối an toàn các socket của user
 * để khi client reconnect, kết nối mới sẽ nạp lại đúng căn hộ mới nhất từ CSDL (chống rò rỉ phòng cũ).
 */
export async function updateUserSocketRoom(
  userId: number,
  oldRoomNumber: string | null | undefined,
  newRoomNumber: string | null | undefined,
  newRoomId?: number | null
): Promise<SocketRoomUpdateResult> {
  if (!ioInstance) {
    return { success: true, fallbackDisconnected: false };
  }

  const userRoom = `user:${userId}`;

  try {
    if (oldRoomNumber) {
      ioInstance.in(userRoom).socketsLeave(`room:${oldRoomNumber}`);
    }
    if (newRoomNumber) {
      ioInstance.in(userRoom).socketsJoin(`room:${newRoomNumber}`);
    }

    const sockets = await ioInstance.in(userRoom).fetchSockets();
    for (const socket of sockets) {
      if (socket.data && socket.data.user) {
        if (newRoomId !== undefined) {
          socket.data.user.roomId = newRoomId;
        }
        if (newRoomNumber !== undefined) {
          socket.data.user.roomNumber = newRoomNumber;
        }
      }
    }
    return { success: true, fallbackDisconnected: false };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.error(
      `[Socket Error - Membership Update Failed]: User [${userId}] chuyển từ [${oldRoomNumber}] sang [${newRoomNumber}]: ${errorMsg}`
    );

    // Kích hoạt Disconnect Fallback an toàn (Fail-Closed):
    // Ngắt kết nối socket của user để buộc client reconnect và nạp membership mới nhất từ database
    let disconnected = false;
    try {
      if (typeof (ioInstance.in(userRoom) as any).disconnectSockets === 'function') {
        ioInstance.in(userRoom).disconnectSockets(true);
        disconnected = true;
      } else {
        const remainingSockets = await ioInstance.in(userRoom).fetchSockets().catch(() => []);
        for (const s of remainingSockets) {
          s.disconnect(true);
        }
        disconnected = true;
      }
      console.warn(
        `[Socket Fallback]: Đã ngắt kết nối an toàn các socket của user [${userId}] để buộc re-sync từ CSDL.`
      );
    } catch (disconnectErr: any) {
      console.error(
        `[Socket Critical Error]: Không thể ngắt kết nối fallback cho user [${userId}]:`,
        disconnectErr?.message || disconnectErr
      );
    }

    return {
      success: false,
      fallbackDisconnected: disconnected,
      error: errorMsg,
    };
  }
}

/**
 * Phát sự kiện thông báo mới (notification:new) tới đúng phạm vi được phép
 */
export function emitNewNotification(notification: NotificationPayload): void {
  if (!ioInstance) {
    return;
  }

  const eventName = 'notification:new';

  if (!notification.targetRoom) {
    // Thông báo chung toàn tòa nhà -> Gửi tới room 'building:all'
    ioInstance.to('building:all').emit(eventName, notification);
  } else {
    // Thông báo riêng cho một căn hộ:
    // 1. Gửi tới cư dân thuộc căn hộ đích ('room:101')
    // 2. Gửi đồng thời tới BQL/Admin ('staff:all') để ban quản lý theo dõi,
    //    nhưng KHÔNG phát tới cư dân phòng khác hoặc thợ kỹ thuật
    ioInstance
      .to(`room:${notification.targetRoom}`)
      .to('staff:all')
      .emit(eventName, notification);
  }
}
