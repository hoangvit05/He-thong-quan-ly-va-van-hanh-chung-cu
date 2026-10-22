// =========================================================================
// PHÂN HỆ QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN (USERS & RESIDENTS MODULE)
// Phụ trách: Việt Hoàng (Backend Lead)
// Chức năng:
//   1. Admin quản lý tài khoản nội bộ (Admin, BQL, Thợ kỹ thuật)
//   2. Admin tạo mới tài khoản BQL & Thợ kỹ thuật
//   3. Ban quản lý & Admin quản lý danh sách cư dân căn hộ
//   4. Phê duyệt tài khoản cư dân mới (Hỗ trợ cả Canonical và Alias endpoints)
// =========================================================================

import { Router, Request, Response } from 'express';
import { Role, RoomStatus } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireAuth, requireRoles } from '../../common/middleware/auth';
import { hashPassword } from '../../common/utils/security';
import {
  validateAdminUsersQuery,
  validateCreateStaffInput,
  validateResidentsQuery,
  validateUserIdParam,
  validateAssignRoomInput,
} from './users.validator';
import { updateUserSocketRoom } from '../notifications/notifications.socket';

// =========================================================================
// SERVICE FUNCTION CHUNG CHO THAO TÁC DUYỆT TÀI KHOẢN CƯ DÂN
// Dùng chung cho cả Canonical (/apartments/residents/:id/approve)
// và Compatibility Alias (/admin/users/:id/approve)
// =========================================================================
export async function approveResidentHandler(req: Request, res: Response) {
  try {
    const paramValidation = validateUserIdParam(req.params.id);
    if (!paramValidation.isValid || !paramValidation.userId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: paramValidation.error || 'Mã định danh cư dân không hợp lệ.',
      });
    }

    const userId = paramValidation.userId;

    // 1. Kiểm tra sự tồn tại của người dùng
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        room: {
          select: {
            id: true,
            roomNumber: true,
            floor: true,
            area: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy tài khoản người dùng trên hệ thống.',
      });
    }

    // 2. Kiểm tra vai trò: Chỉ tài khoản RESIDENT mới thuộc quy trình phê duyệt cư dân
    if (user.role !== Role.RESIDENT) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Chỉ có thể phê duyệt tài khoản cư dân. Tài khoản này có vai trò [${user.role}].`,
      });
    }

    // 3. Kiểm tra điều kiện phòng: Cư dân bắt buộc phải được gán vào căn hộ trước khi duyệt
    if (user.roomId === null || !user.room) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Tài khoản cư dân chưa được gán vào căn hộ nào. Vui lòng gán căn hộ trước khi phê duyệt.',
      });
    }

    // 4. Kiểm tra trạng thái phòng: Không thể duyệt vào phòng đang bảo dưỡng (MAINTENANCE)
    if (user.room.status === RoomStatus.MAINTENANCE) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể phê duyệt cư dân vào căn hộ đang trong trạng thái bảo trì (MAINTENANCE).',
      });
    }

    // 5. Xử lý trường hợp tài khoản đã được duyệt trước đó (Idempotent response)
    if (user.isApproved) {
      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          phone: user.phone,
          email: user.email,
          role: user.role,
          roomId: user.roomId,
          isApproved: true,
          room: user.room,
        },
        message: 'Tài khoản cư dân đã được phê duyệt trước đó.',
      });
    }

    // Thực hiện toàn bộ kiểm tra và cập nhật trong transaction có khóa FOR UPDATE để bảo đảm tính nguyên tử và chống race condition
    const result = await prisma.$transaction(async (tx) => {
      // 1. Khóa hàng User của cư dân
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              area: true,
              status: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      if (user.role !== Role.RESIDENT) {
        throw new Error(`INVALID_ROLE_${user.role}`);
      }

      if (user.roomId === null || !user.room) {
        throw new Error('NO_ROOM_ASSIGNED');
      }

      // 2. Khóa hàng Room tương ứng
      await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${user.roomId} FOR UPDATE`;

      const currentRoom = await tx.room.findUnique({
        where: { id: user.roomId },
        select: { id: true, status: true },
      });

      if (!currentRoom) {
        throw new Error('ROOM_NOT_FOUND');
      }

      if (currentRoom.status === RoomStatus.MAINTENANCE) {
        throw new Error('ROOM_MAINTENANCE');
      }

      if (user.isApproved) {
        return {
          idempotent: true,
          data: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email,
            role: user.role,
            roomId: user.roomId,
            isApproved: true,
            room: user.room,
          },
        };
      }

      // 3. Cập nhật trạng thái duyệt của cư dân
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isApproved: true },
        include: {
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              area: true,
              status: true,
            },
          },
        },
      });

      // 4. Nếu căn hộ đang là VACANT, cập nhật thành OCCUPIED khi cư dân đầu tiên được duyệt
      if (currentRoom.status === RoomStatus.VACANT) {
        await tx.room.update({
          where: { id: user.roomId },
          data: { status: RoomStatus.OCCUPIED },
        });
        if (updated.room) {
          updated.room.status = RoomStatus.OCCUPIED;
        }
      }

      return {
        idempotent: false,
        data: {
          id: updated.id,
          username: updated.username,
          fullName: updated.fullName,
          phone: updated.phone,
          email: updated.email,
          role: updated.role,
          roomId: updated.roomId,
          isApproved: updated.isApproved,
          room: updated.room,
        },
      };
    });

    if (result.idempotent) {
      return res.status(200).json({
        success: true,
        data: result.data,
        message: 'Tài khoản cư dân đã được phê duyệt trước đó.',
      });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
      message: 'Phê duyệt tài khoản cư dân thành công.',
    });
  } catch (error: any) {
    if (error?.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy tài khoản người dùng trên hệ thống.',
      });
    }

    if (error?.message?.startsWith('INVALID_ROLE_')) {
      const role = error.message.replace('INVALID_ROLE_', '');
      return res.status(400).json({
        success: false,
        data: null,
        message: `Chỉ có thể phê duyệt tài khoản cư dân. Tài khoản này có vai trò [${role}].`,
      });
    }

    if (error?.message === 'NO_ROOM_ASSIGNED') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Tài khoản cư dân chưa được gán vào căn hộ nào. Vui lòng gán căn hộ trước khi phê duyệt.',
      });
    }

    if (error?.message === 'ROOM_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy căn hộ tương ứng với cư dân.',
      });
    }

    if (error?.message === 'ROOM_MAINTENANCE') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể phê duyệt cư dân vào căn hộ đang trong trạng thái bảo trì (MAINTENANCE).',
      });
    }

    console.error('[Users Controller Error - approveResidentHandler]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi phê duyệt tài khoản cư dân. Vui lòng thử lại sau.',
    });
  }
}

// =========================================================================
// SERVICE FUNCTION GÁN VÀ ĐIỀU CHUYỂN CĂN HỘ CHO CƯ DÂN
// Endpoint: PUT /api/apartments/residents/:id/room
// =========================================================================
export async function assignResidentRoomHandler(req: Request, res: Response) {
  try {
    const paramValidation = validateUserIdParam(req.params.id);
    if (!paramValidation.isValid || !paramValidation.userId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: paramValidation.error || 'Mã định danh cư dân không hợp lệ.',
      });
    }

    const bodyValidation = validateAssignRoomInput(req.body);
    if (!bodyValidation.isValid || !bodyValidation.roomId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: bodyValidation.error || 'Dữ liệu gán căn hộ không hợp lệ.',
      });
    }

    const userId = paramValidation.userId;
    const targetRoomId = bodyValidation.roomId;

    // Thực hiện gán / chuyển phòng trong transaction có khóa FOR UPDATE để ngăn chặn race condition
    const result = await prisma.$transaction(async (tx) => {
      // 1. Khóa hàng User của cư dân
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              area: true,
              status: true,
            },
          },
        },
      });

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      if (user.role !== Role.RESIDENT) {
        throw new Error(`INVALID_ROLE_${user.role}`);
      }

      // 2. Khóa các phòng liên quan theo thứ tự ID tăng dần để triệt tiêu hoàn toàn nguy cơ deadlock
      const oldRoomId = user.roomId;
      const roomsToLock = Array.from(
        new Set([targetRoomId, ...(oldRoomId ? [oldRoomId] : [])])
      ).sort((a, b) => a - b);

      for (const rid of roomsToLock) {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${rid} FOR UPDATE`;
      }

      // 3. Đọc dữ liệu mới nhất của phòng đích trong transaction khi đã giữ khóa
      const targetRoom = await tx.room.findUnique({
        where: { id: targetRoomId },
        select: {
          id: true,
          roomNumber: true,
          floor: true,
          area: true,
          status: true,
        },
      });

      if (!targetRoom) {
        throw new Error('TARGET_ROOM_NOT_FOUND');
      }

      if (targetRoom.status === RoomStatus.MAINTENANCE) {
        throw new Error('TARGET_ROOM_MAINTENANCE');
      }

      if (user.roomId === targetRoomId) {
        return {
          idempotent: true,
          oldRoomId,
          data: {
            id: user.id,
            username: user.username,
            fullName: user.fullName,
            phone: user.phone,
            email: user.email,
            role: user.role,
            roomId: user.roomId,
            isApproved: user.isApproved,
            room: targetRoom,
          },
        };
      }

      const isApproved = user.isApproved;

      // 4. Cập nhật roomId cho cư dân
      const updated = await tx.user.update({
        where: { id: userId },
        data: { roomId: targetRoomId },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          email: true,
          role: true,
          roomId: true,
          isApproved: true,
          createdAt: true,
          updatedAt: true,
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              area: true,
              status: true,
            },
          },
        },
      });

      // 5. Nếu cư dân ĐÃ DUYỆT (isApproved = true), đồng bộ trạng thái cả 2 phòng
      if (isApproved) {
        // Phòng đích: nếu đang VACANT thì chuyển thành OCCUPIED
        if (targetRoom.status === RoomStatus.VACANT) {
          await tx.room.update({
            where: { id: targetRoomId },
            data: { status: RoomStatus.OCCUPIED },
          });
          if (updated.room) {
            updated.room.status = RoomStatus.OCCUPIED;
          }
        }

        // Phòng cũ (nếu có): kiểm tra số lượng cư dân đã duyệt còn lại
        if (oldRoomId && oldRoomId !== targetRoomId) {
          const remainingApproved = await tx.user.count({
            where: {
              roomId: oldRoomId,
              role: Role.RESIDENT,
              isApproved: true,
              id: { not: userId },
            },
          });

          if (remainingApproved === 0) {
            const oldRoom = await tx.room.findUnique({
              where: { id: oldRoomId },
              select: { id: true, status: true },
            });
            if (oldRoom && oldRoom.status !== RoomStatus.MAINTENANCE) {
              await tx.room.update({
                where: { id: oldRoomId },
                data: { status: RoomStatus.VACANT },
              });
            }
          }
        }
      }

      return {
        idempotent: false,
        oldRoomId,
        oldRoomNumber: user.room?.roomNumber || null,
        data: updated,
      };
    });

    if (result.idempotent) {
      return res.status(200).json({
        success: true,
        data: result.data,
        message: 'Cư dân đã được gán vào căn hộ này trước đó.',
      });
    }

    // ĐỒNG BỘ REALTIME: Cập nhật Socket.IO room membership cho các socket đang kết nối của cư dân
    // Giúp cư dân lập tức rời room cũ và gia nhập room mới mà không cần ngắt kết nối (Data Isolation)
    if (result.data.room?.roomNumber) {
      updateUserSocketRoom(
        userId,
        result.oldRoomNumber,
        result.data.room.roomNumber,
        targetRoomId
      )
        .then((syncRes) => {
          if (!syncRes.success) {
            console.warn(
              `[Users Controller - Socket Sync Warning]: User [${userId}] cập nhật room thất bại, đã kích hoạt disconnect fallback: ${syncRes.error}`
            );
          }
        })
        .catch((syncErr) => {
          console.error(
            `[Users Controller - Socket Sync Error]: User [${userId}] gặp lỗi khi đồng bộ socket room:`,
            syncErr?.message || syncErr
          );
        });
    }

    return res.status(200).json({
      success: true,
      data: result.data,
      message: result.oldRoomId ? 'Chuyển căn hộ cho cư dân thành công.' : 'Gán căn hộ cho cư dân thành công.',
    });
  } catch (error: any) {
    if (error?.message === 'USER_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy tài khoản người dùng trên hệ thống.',
      });
    }

    if (error?.message?.startsWith('INVALID_ROLE_')) {
      const role = error.message.replace('INVALID_ROLE_', '');
      return res.status(400).json({
        success: false,
        data: null,
        message: `Chỉ có thể gán căn hộ cho tài khoản có vai trò cư dân. Tài khoản này có vai trò [${role}].`,
      });
    }

    if (error?.message === 'TARGET_ROOM_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy căn hộ đích yêu cầu.',
      });
    }

    if (error?.message === 'TARGET_ROOM_MAINTENANCE') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể gán cư dân vào căn hộ đang trong trạng thái bảo trì (MAINTENANCE).',
      });
    }

    console.error('[Users Controller Error - assignResidentRoomHandler]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi gán căn hộ cho cư dân.',
    });
  }
}

// =========================================================================
// ROUTER 1: ADMIN USERS ROUTER (/api/admin/users)
// Quản lý nhân sự nội bộ (Admin, BQL, Thợ kỹ thuật)
// =========================================================================
const adminUsersRouter = Router();

adminUsersRouter.use(extractUser);

/**
 * GET /api/admin/users
 * Lấy danh sách tài khoản nội bộ (Admin xem được Admin, BQL, Thợ; BQL chỉ xem Thợ kỹ thuật)
 */
adminUsersRouter.get('/', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const currentUser = req.user!;
    const validation = validateAdminUsersQuery(req.query);

    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { role, page, limit, search } = validation.parsed;

    // Phân quyền theo nguyên tắc Least Privilege:
    // BQL chỉ được phép xem danh sách TECHNICIAN để phân phối việc sửa chữa
    let roleFilter: any;
    if (currentUser.role === Role.BQL) {
      roleFilter = Role.TECHNICIAN;
    } else {
      // ADMIN: Nếu có query role hợp lệ thì lọc theo role đó; nếu không thì mặc định xem các role nội bộ
      if (role) {
        roleFilter = role;
      } else {
        roleFilter = { in: [Role.ADMIN, Role.BQL, Role.TECHNICIAN] };
      }
    }

    const whereCondition: any = {
      role: roleFilter,
    };

    if (search) {
      whereCondition.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count({ where: whereCondition }),
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          email: true,
          role: true,
          roomId: true,
          isApproved: true,
          createdAt: true,
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: users,
      message: 'Lấy danh sách tài khoản thành công.',
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('[Admin Users Error - GET /]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh sách tài khoản.',
    });
  }
});

/**
 * POST /api/admin/users
 * Admin tạo tài khoản nhân viên BQL hoặc Thợ kỹ thuật mới
 */
adminUsersRouter.post('/', requireRoles(Role.ADMIN), async (req: Request, res: Response) => {
  try {
    const validation = validateCreateStaffInput(req.body);

    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { username, password, fullName, role, phone, email } = validation.parsed;

    // Băm mật khẩu bằng Bcrypt 10 rounds qua tiện ích bảo mật dùng chung
    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName,
        role,
        phone,
        email,
        isApproved: true, // Nhân viên nội bộ do Admin tạo được kích hoạt ngay
        roomId: null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phone: true,
        email: true,
        isApproved: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: newUser,
      message: 'Tạo tài khoản nhân viên thành công.',
    });
  } catch (error: any) {
    // Bắt lỗi vi phạm ràng buộc duy nhất trong Prisma (P2002)
    if (error?.code === 'P2002') {
      const target = error?.meta?.target;
      if (Array.isArray(target) && target.includes('email')) {
        return res.status(409).json({
          success: false,
          data: null,
          message: 'Địa chỉ email đã được sử dụng bởi tài khoản khác.',
        });
      }
      if (Array.isArray(target) && target.includes('username')) {
        return res.status(409).json({
          success: false,
          data: null,
          message: 'Tên đăng nhập đã tồn tại trong hệ thống.',
        });
      }
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Tên đăng nhập hoặc email đã tồn tại trong hệ thống.',
      });
    }

    console.error('[Admin Users Error - POST /]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi tạo tài khoản nhân viên.',
    });
  }
});

/**
 * PUT /api/admin/users/:id/approve
 * Compatibility Alias cho thao tác duyệt tài khoản cư dân
 */
adminUsersRouter.put('/:id/approve', requireRoles(Role.ADMIN, Role.BQL), approveResidentHandler);

// =========================================================================
// ROUTER 2: RESIDENTS ROUTER (/api/apartments/residents)
// Quản lý danh sách cư dân theo căn hộ & duyệt cư dân mới
// =========================================================================
export const residentsRouter = Router();

residentsRouter.use(extractUser);

/**
 * GET /api/apartments/residents
 * Lấy danh sách cư dân phục vụ trang Quản lý Căn hộ & Cư dân (ResidentsPage.tsx)
 */
residentsRouter.get('/', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const validation = validateResidentsQuery(req.query);

    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { roomId, isApproved, page, limit, search } = validation.parsed;

    // Nếu có truyền roomId, kiểm tra phòng có tồn tại trên hệ thống không
    if (roomId !== undefined) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });
      if (!room) {
        return res.status(404).json({
          success: false,
          data: null,
          message: `Không tìm thấy căn hộ với mã định danh [${roomId}].`,
        });
      }
    }

    // ÉP BUỘC CHẶT CHẼ: Endpoint này CHỈ trả về tài khoản RESIDENT
    const whereCondition: any = {
      role: Role.RESIDENT,
    };

    if (roomId !== undefined) {
      whereCondition.roomId = roomId;
    }

    if (isApproved !== undefined) {
      whereCondition.isApproved = isApproved;
    }

    if (search) {
      whereCondition.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [total, residents] = await Promise.all([
      prisma.user.count({ where: whereCondition }),
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          fullName: true,
          phone: true,
          email: true,
          role: true,
          roomId: true,
          isApproved: true,
          createdAt: true,
          room: {
            select: {
              id: true,
              roomNumber: true,
              floor: true,
              area: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: residents,
      message: 'Lấy danh sách cư dân thành công.',
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('[Residents Router Error - GET /]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh sách cư dân.',
    });
  }
});

/**
 * PUT /api/apartments/residents/:id/approve
 * Canonical Endpoint cho thao tác duyệt tài khoản cư dân
 */
residentsRouter.put('/:id/approve', requireRoles(Role.ADMIN, Role.BQL), approveResidentHandler);

/**
 * PUT /api/apartments/residents/:id/room
 * Endpoint riêng gán và chuyển căn hộ cho cư dân
 */
residentsRouter.put('/:id/room', requireRoles(Role.ADMIN, Role.BQL), assignResidentRoomHandler);

export default adminUsersRouter;
