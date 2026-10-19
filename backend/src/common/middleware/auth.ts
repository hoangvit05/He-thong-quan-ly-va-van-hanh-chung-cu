import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key';

/**
 * Middleware trích xuất thông tin người dùng từ JWT Token hoặc Headers thử nghiệm
 * Gắn vào req.user nếu hợp lệ
 */
export function extractUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded && decoded.id && decoded.role) {
        req.user = {
          id: Number(decoded.id),
          role: decoded.role as Role,
          username: decoded.username,
          fullName: decoded.fullName,
          roomId: decoded.roomId ? Number(decoded.roomId) : null,
        };
        return next();
      }
    }

    // Hỗ trợ header kiểm thử phát triển cục bộ khi module Auth chưa hoàn tất seed DB
    const devUserId = req.headers['x-user-id'];
    const devUserRole = req.headers['x-user-role'];
    const devRoomId = req.headers['x-user-room-id'];

    if (devUserId && devUserRole) {
      const roleStr = String(devUserRole).toUpperCase();
      if (Object.values(Role).includes(roleStr as Role)) {
        req.user = {
          id: Number(devUserId),
          role: roleStr as Role,
          roomId: devRoomId ? Number(devRoomId) : null,
        };
        return next();
      }
    }

    next();
  } catch (error) {
    // Token không hợp lệ hoặc hết hạn -> tiếp tục không có req.user
    next();
  }
}

/**
 * Bắt buộc người dùng phải đăng nhập (yêu cầu req.user)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  extractUser(req, res, () => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Yêu cầu đăng nhập. Vui lòng cung cấp Authorization Bearer Token hoặc x-user-id header.',
      });
      return;
    }
    next();
  });
}

/**
 * Phân quyền theo vai trò (Role-based Access Control - RBAC)
 */
export function requireRoles(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    extractUser(req, res, () => {
      if (!req.user) {
        res.status(401).json({
          success: false,
          data: null,
          message: 'Yêu cầu đăng nhập để truy cập tài nguyên này.',
        });
        return;
      }

      if (!allowedRoles.includes(req.user.role)) {
        res.status(403).json({
          success: false,
          data: null,
          message: `Từ chối truy cập! Vai trò [${req.user.role}] không có quyền thực hiện thao tác này. Cần quyền: [${allowedRoles.join(', ')}].`,
        });
        return;
      }

      next();
    });
  };
}
