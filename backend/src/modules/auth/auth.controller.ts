// =========================================================================
// PHÂN HỆ XÁC THỰC & QUẢN LÝ PHIÊN ĐĂNG NHẬP (AUTHENTICATION MODULE)
// Phụ trách: Đặng Hoàng (Leader) & Hiếu
// Chức năng: Đăng nhập (username/email/phone), cấp JWT Token, đổi mật khẩu, xem hồ sơ cá nhân
// An toàn bảo mật: Bcrypt hash, JWT HS256 (1 ngày), Resident isApproved check, Anti-Enumeration
// =========================================================================

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireAuth, getJwtSecret } from '../../common/middleware/auth';
import { comparePassword, hashPassword } from '../../common/utils/security';
import { validateLoginInput, validateChangePasswordInput } from './auth.validator';

// Precomputed dummy bcrypt hash để triệt tiêu chênh lệch thời gian xử lý (Anti-Timing Attack)
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

// Bộ nhớ đệm giới hạn tần suất thử đăng nhập sai (Anti-Brute Force Throttling)
interface LoginAttempt {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
}
const loginAttempts = new Map<string, LoginAttempt>();
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 phút
const BLOCK_DURATION_MS = 5 * 60 * 1000; // Khóa 5 phút

export function resetLoginAttempts(): void {
  loginAttempts.clear();
}

// Định kỳ dọn dẹp các mục đã hết hạn (chống rò rỉ bộ nhớ)
setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of loginAttempts.entries()) {
    if (attempt.blockedUntil && attempt.blockedUntil < now) {
      loginAttempts.delete(key);
    } else if (now - attempt.firstAttemptAt > WINDOW_MS && !attempt.blockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 60000).unref();

const router = Router();

// Trích xuất thông tin người dùng từ JWT Token nếu có gửi kèm Header Authorization
router.use(extractUser);

// =========================================================================
// 1. ĐĂNG NHẬP HỆ THỐNG & CẤP JWT TOKEN
// POST /api/auth/login
// =========================================================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validation = validateLoginInput(req.body);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { identifier, password } = validation.parsed;

    // 0. Kiểm tra giới hạn tần suất thử sai (Chống tấn công Brute-force & Credential Stuffing)
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const throttleKey = `${clientIp}:${identifier.toLowerCase()}`;
    const now = Date.now();

    const attempt = loginAttempts.get(throttleKey);
    if (attempt?.blockedUntil && attempt.blockedUntil > now) {
      const remainingSeconds = Math.ceil((attempt.blockedUntil - now) / 1000);
      return res.status(429).json({
        success: false,
        data: null,
        message: `Tài khoản tạm thời bị khóa do đăng nhập sai quá ${MAX_FAILED_ATTEMPTS} lần liên tiếp. Vui lòng thử lại sau ${remainingSeconds} giây.`,
      });
    }

    // 1. Tra cứu tài khoản an toàn qua Prisma Parameterization
    // Hỗ trợ đăng nhập linh hoạt bằng username, email hoặc phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier.toLowerCase() },
          { phone: identifier },
        ],
      },
      include: {
        room: true,
      },
    });

    // 2. Kiểm tra tài khoản tồn tại và so khớp mật khẩu bằng Bcrypt
    // Chạy dummy compare nếu không tìm thấy user để triệt tiêu chênh lệch thời gian (Timing-Safe)
    let isPasswordValid = false;
    if (user) {
      isPasswordValid = await comparePassword(password, user.password);
    } else {
      await comparePassword(password, DUMMY_HASH);
    }

    if (!user || !isPasswordValid) {
      // Ghi nhận lần thử thất bại
      const current = loginAttempts.get(throttleKey) || { count: 0, firstAttemptAt: now };
      if (now - current.firstAttemptAt > WINDOW_MS) {
        current.count = 1;
        current.firstAttemptAt = now;
      } else {
        current.count++;
      }
      if (current.count >= MAX_FAILED_ATTEMPTS) {
        current.blockedUntil = now + BLOCK_DURATION_MS;
      }
      loginAttempts.set(throttleKey, current);

      return res.status(401).json({
        success: false,
        data: null,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
      });
    }

    // Đăng nhập thành công -> Xóa bộ đếm thử sai
    loginAttempts.delete(throttleKey);

    // 3. Kiểm tra trạng thái phê duyệt tài khoản cư dân (isApproved check)
    // Cư dân tự đăng ký hoặc chưa được BQL kích hoạt (isApproved = false) bị từ chối truy cập
    if (user.role === Role.RESIDENT && !user.isApproved) {
      return res.status(403).json({
        success: false,
        data: null,
        message: 'Tài khoản cư dân của bạn đang chờ Ban quản lý phê duyệt. Vui lòng liên hệ văn phòng BQL.',
      });
    }

    // 4. Ký và cấp JWT Token thật với thời hạn 1 ngày
    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
        fullName: user.fullName,
        roomId: user.roomId,
      },
      secret,
      { expiresIn: '1d', algorithm: 'HS256' }
    );

    // 5. Trả về token và dữ liệu người dùng đã được làm sạch (loại bỏ password hash)
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          roomId: user.roomId,
          roomNumber: user.room?.roomNumber || null,
          isApproved: user.isApproved,
        },
      },
      message: 'Đăng nhập thành công.',
    });
  } catch (error: any) {
    console.error('[Auth Controller Error - POST /login]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi xử lý đăng nhập. Vui lòng thử lại sau.',
    });
  }
});

// =========================================================================
// 2. ĐỔI MẬT KHẨU TÀI KHOẢN
// POST /api/auth/change-password
// =========================================================================
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    const validation = validateChangePasswordInput(req.body);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { currentPassword, newPassword } = validation.parsed;

    // 1. Lấy thông tin user hiện tại từ Database
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy tài khoản người dùng trên hệ thống.',
      });
    }

    // 2. Kiểm tra mật khẩu hiện tại
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Mật khẩu hiện tại không chính xác.',
      });
    }

    // 3. Băm mật khẩu mới bằng Bcrypt và cập nhật an toàn vào Database
    const newHashedPassword = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { password: newHashedPassword },
    });

    res.json({
      success: true,
      data: null,
      message: 'Đổi mật khẩu thành công. Mật khẩu mới đã được cập nhật.',
    });
  } catch (error: any) {
    console.error('[Auth Controller Error - POST /change-password]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi đổi mật khẩu. Vui lòng thử lại sau.',
    });
  }
});

// =========================================================================
// 3. XEM THÔNG TIN TÀI KHOẢN & HỒ SƠ CÁ NHÂN
// GET /api/auth/me
// =========================================================================
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;

    // Truy vấn dữ liệu mới nhất từ cơ sở dữ liệu thay vì chỉ dựa vào claims cũ trong token
    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
      include: {
        room: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy thông tin tài khoản người dùng.',
      });
    }

    // Trả về thông tin hồ sơ và phòng (ẩn tuyệt đối trường mật khẩu hash)
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        roomId: user.roomId,
        room: user.room
          ? {
              id: user.room.id,
              roomNumber: user.room.roomNumber,
              floor: user.room.floor,
              area: user.room.area,
              status: user.room.status,
            }
          : null,
        isApproved: user.isApproved,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      message: 'Lấy thông tin tài khoản cá nhân thành công.',
    });
  } catch (error: any) {
    console.error('[Auth Controller Error - GET /me]:', error?.message || error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy thông tin tài khoản.',
    });
  }
});

export default router;
