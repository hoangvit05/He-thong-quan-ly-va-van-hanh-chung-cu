import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import '../types/auth';

const INSECURE_DEFAULT_SECRETS = ['super-secret-jwt-key', 'secret', '123456', 'jwt-secret', 'default', 'password'];

/**
 * Lấy JWT Secret động và kiểm tra tính an toàn nghiêm ngặt
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret || INSECURE_DEFAULT_SECRETS.includes(secret.toLowerCase()) || secret.length < 32) {
      throw new Error(
        '[FATAL SECURITY ERROR] Ứng dụng từ chối khởi động ở môi trường Production: JWT_SECRET bị thiếu, quá ngắn (< 32 ký tự), hoặc đang dùng giá trị mặc định không an toàn! Vui lòng cấu hình JWT_SECRET mạnh trong biến môi trường.'
      );
    }
    return secret;
  }

  return secret || 'super-secret-jwt-key';
}

/**
 * Kiểm tra tính hợp lệ của JWT Secret khi khởi động ứng dụng (Fail-Fast)
 */
export function validateJwtSecretAtStartup(): void {
  getJwtSecret();
}

/**
 * Middleware trích xuất và xác thực thông tin người dùng từ JWT Token
 */
export function extractUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const secret = getJwtSecret();
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;
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

    // BẢO MẬT: Header giả lập danh tính (x-user-id, x-user-role)
    // 1. Tuyệt đối KHÔNG được bật chỉ vì NODE_ENV !== 'production'
    // 2. Tuyệt đối BỊ CẤM ở môi trường Production bất kể cờ nào
    // 3. Chỉ bật khi có cấu hình tường minh ALLOW_DEV_AUTH_HEADERS=true hoặc trong môi trường test (NODE_ENV=test)
    const isProduction = process.env.NODE_ENV === 'production';
    const isExplicitlyEnabled =
      !isProduction &&
      (process.env.ALLOW_DEV_AUTH_HEADERS === 'true' || process.env.NODE_ENV === 'test');

    if (isExplicitlyEnabled) {
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
    }

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      req.authError = 'TOKEN_EXPIRED';
    } else if (error.name === 'JsonWebTokenError') {
      req.authError = 'INVALID_SIGNATURE';
    } else {
      req.authError = 'AUTH_ERROR';
    }
    next();
  }
}

/**
 * Bắt buộc người dùng phải đăng nhập (yêu cầu req.user)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }

  extractUser(req, res, () => {
    if (req.user) {
      return next();
    }

    if (req.authError === 'TOKEN_EXPIRED') {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Phiên đăng nhập đã hết hạn (Token Expired). Vui lòng đăng nhập lại.',
      });
      return;
    }

    if (req.authError === 'INVALID_SIGNATURE') {
      res.status(401).json({
        success: false,
        data: null,
        message: 'Mã xác thực không hợp lệ (Invalid Token Signature hoặc sai chữ ký bí mật).',
      });
      return;
    }

    res.status(401).json({
      success: false,
      data: null,
      message: 'Yêu cầu đăng nhập. Vui lòng cung cấp Authorization Bearer Token hợp lệ.',
    });
  });
}

/**
 * Phân quyền theo vai trò (Role-based Access Control - RBAC)
 */
export function requireRoles(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const handleAuthorization = () => {
      if (!req.user) {
        if (req.authError === 'TOKEN_EXPIRED') {
          res.status(401).json({
            success: false,
            data: null,
            message: 'Phiên đăng nhập đã hết hạn (Token Expired). Vui lòng đăng nhập lại.',
          });
          return;
        }
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
    };

    if (req.user) {
      handleAuthorization();
    } else {
      extractUser(req, res, handleAuthorization);
    }
  };
}
