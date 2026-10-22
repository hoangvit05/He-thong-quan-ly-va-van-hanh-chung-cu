// =========================================================================
// PHÂN HỆ QUẢN LÝ CĂN HỘ (ROOMS MODULE)
// Phụ trách: Việt Hoàng (Backend Lead)
// Chức năng:
//   1. Lấy danh mục căn hộ tòa nhà, lọc tầng, trạng thái, tính residentCount
//   2. Tạo mới căn hộ (Chống trùng roomNumber, khởi tạo VACANT/MAINTENANCE)
//   3. Cập nhật thông tin căn hộ (Bảo vệ tính nhất quán trạng thái và cư dân)
// =========================================================================

import { Router, Request, Response } from 'express';
import { Role, RoomStatus } from '@prisma/client';
import prisma from '../../database/prisma';
import { extractUser, requireRoles } from '../../common/middleware/auth';
import {
  validateRoomsQuery,
  validateCreateRoomInput,
  validateUpdateRoomInput,
  validateRoomIdParam,
} from './rooms.validator';

const roomsRouter = Router();

roomsRouter.use(extractUser);

/**
 * GET /api/rooms
 * Lấy danh mục phòng dành cho giao diện quản lý căn hộ
 */
roomsRouter.get('/', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const validation = validateRoomsQuery(req.query);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { page, limit, search, floor, status } = validation.parsed;

    const whereCondition: any = {};

    if (search) {
      whereCondition.roomNumber = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (floor !== undefined) {
      whereCondition.floor = floor;
    }

    if (status !== undefined) {
      whereCondition.status = status;
    }

    const skip = (page - 1) * limit;

    const [total, rooms] = await Promise.all([
      prisma.room.count({ where: whereCondition }),
      prisma.room.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
        select: {
          id: true,
          roomNumber: true,
          floor: true,
          area: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              users: {
                where: {
                  role: Role.RESIDENT,
                  isApproved: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedRooms = rooms.map((r: any) => ({
      id: r.id,
      roomNumber: r.roomNumber,
      floor: r.floor,
      area: r.area,
      status: r.status,
      residentCount: r._count?.users ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: mappedRooms,
      message: 'Lấy danh mục căn hộ thành công.',
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('[Rooms Controller Error - GET /]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi lấy danh mục căn hộ.',
    });
  }
});

/**
 * POST /api/rooms
 * Tạo căn hộ mới trong tòa nhà
 */
roomsRouter.post('/', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const validation = validateCreateRoomInput(req.body);
    if (!validation.isValid || !validation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: validation.errors.join('; '),
      });
    }

    const { roomNumber, floor, area, status } = validation.parsed;

    // Kiểm tra trước số phòng có bị trùng hay không
    const existing = await prisma.room.findUnique({
      where: { roomNumber },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        data: null,
        message: `Số phòng [${roomNumber}] đã tồn tại trong hệ thống.`,
      });
    }

    const newRoom = await prisma.room.create({
      data: {
        roomNumber,
        floor,
        area,
        status,
      },
      select: {
        id: true,
        roomNumber: true,
        floor: true,
        area: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        ...newRoom,
        residentCount: 0,
      },
      message: 'Tạo căn hộ mới thành công.',
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const target = error?.meta?.target;
      if (Array.isArray(target) && target.includes('roomNumber')) {
        return res.status(409).json({
          success: false,
          data: null,
          message: 'Số phòng đã tồn tại trong hệ thống.',
        });
      }
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Số phòng đã tồn tại trong hệ thống.',
      });
    }

    console.error('[Rooms Controller Error - POST /]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi tạo căn hộ mới.',
    });
  }
});

/**
 * PUT /api/rooms/:id
 * Cập nhật thông tin căn hộ
 */
roomsRouter.put('/:id', requireRoles(Role.ADMIN, Role.BQL), async (req: Request, res: Response) => {
  try {
    const idValidation = validateRoomIdParam(req.params.id);
    if (!idValidation.isValid || !idValidation.roomId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: idValidation.error || 'Mã định danh căn hộ không hợp lệ.',
      });
    }

    const roomId = idValidation.roomId;

    const bodyValidation = validateUpdateRoomInput(req.body);
    if (!bodyValidation.isValid || !bodyValidation.parsed) {
      return res.status(400).json({
        success: false,
        data: null,
        message: bodyValidation.errors.join('; '),
      });
    }

    const parsed = bodyValidation.parsed;

    // 1. Kiểm tra sự tồn tại của phòng
    const existingRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        _count: {
          select: {
            users: {
              where: {
                role: Role.RESIDENT,
                isApproved: true,
              },
            },
          },
        },
      },
    });

    if (!existingRoom) {
      return res.status(404).json({
        success: false,
        data: null,
        message: `Không tìm thấy căn hộ với mã định danh [${roomId}].`,
      });
    }

    // 2. Nếu đổi số phòng, kiểm tra không bị trùng với phòng khác
    if (parsed.roomNumber && parsed.roomNumber !== existingRoom.roomNumber) {
      const duplicate = await prisma.room.findUnique({
        where: { roomNumber: parsed.roomNumber },
      });
      if (duplicate && duplicate.id !== roomId) {
        return res.status(409).json({
          success: false,
          data: null,
          message: `Số phòng [${parsed.roomNumber}] đã tồn tại trên căn hộ khác.`,
        });
      }
    }

    // 3. Bảo vệ tính nhất quán trạng thái phòng (Status Guards)
    const approvedResidentsCount = existingRoom._count?.users ?? 0;

    if (parsed.status === RoomStatus.VACANT && approvedResidentsCount > 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `Không thể chuyển căn hộ sang trạng thái Trống (VACANT) khi vẫn còn ${approvedResidentsCount} cư dân đã được phê duyệt cư trú.`,
      });
    }

    if (parsed.status === RoomStatus.OCCUPIED && approvedResidentsCount === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể chuyển căn hộ sang trạng thái Đang có người ở (OCCUPIED) khi chưa có cư dân nào được phê duyệt.',
      });
    }

    // 4. Cập nhật trong transaction có khóa FOR UPDATE để bảo vệ tính nhất quán trước các request đồng thời
    const updatedRoom = await prisma.$transaction(async (tx) => {
      // Khóa hàng phòng bằng FOR UPDATE để serialize với các thao tác duyệt/gán phòng đồng thời
      await tx.$queryRaw`SELECT id, status FROM "Room" WHERE id = ${roomId} FOR UPDATE`;

      const currentRoom = await tx.room.findUnique({
        where: { id: roomId },
      });

      if (!currentRoom) {
        throw new Error('ROOM_NOT_FOUND');
      }

      // Nếu đổi số phòng, kiểm tra không bị trùng với phòng khác
      if (parsed.roomNumber && parsed.roomNumber !== currentRoom.roomNumber) {
        const duplicate = await tx.room.findUnique({
          where: { roomNumber: parsed.roomNumber },
        });
        if (duplicate && duplicate.id !== roomId) {
          throw new Error('DUPLICATE_ROOM_NUMBER');
        }
      }

      // Đếm số cư dân đã duyệt TRỰC TIẾP TRONG TRANSACTION khi đang giữ khóa FOR UPDATE
      const currentApprovedCount = await tx.user.count({
        where: { roomId, role: Role.RESIDENT, isApproved: true },
      });

      if (parsed.status === RoomStatus.VACANT && currentApprovedCount > 0) {
        throw new Error('STATUS_GUARD_VACANT_CONFLICT');
      }

      if (parsed.status === RoomStatus.OCCUPIED && currentApprovedCount === 0) {
        throw new Error('STATUS_GUARD_OCCUPIED_CONFLICT');
      }

      const updateData: any = {};
      if (parsed.roomNumber) updateData.roomNumber = parsed.roomNumber;
      if (parsed.floor !== undefined) updateData.floor = parsed.floor;
      if (parsed.area !== undefined) updateData.area = parsed.area;
      if (parsed.status) updateData.status = parsed.status;

      const updated = await tx.room.update({
        where: { id: roomId },
        data: updateData,
        select: {
          id: true,
          roomNumber: true,
          floor: true,
          area: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...updated,
        residentCount: currentApprovedCount,
      };
    });

    return res.status(200).json({
      success: true,
      data: updatedRoom,
      message: 'Cập nhật thông tin căn hộ thành công.',
    });
  } catch (error: any) {
    if (error?.message === 'ROOM_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Không tìm thấy căn hộ với mã định danh yêu cầu.',
      });
    }

    if (error?.message === 'DUPLICATE_ROOM_NUMBER') {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Số phòng đã tồn tại trên căn hộ khác.',
      });
    }

    if (error?.message === 'STATUS_GUARD_VACANT_CONFLICT') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể chuyển căn hộ sang trạng thái Trống (VACANT) khi vẫn còn cư dân đã được phê duyệt cư trú.',
      });
    }

    if (error?.message === 'STATUS_GUARD_OCCUPIED_CONFLICT') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Không thể chuyển căn hộ sang trạng thái Đang có người ở (OCCUPIED) khi chưa có cư dân nào được phê duyệt.',
      });
    }

    if (error?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        data: null,
        message: 'Số phòng đã tồn tại trên căn hộ khác.',
      });
    }

    console.error('[Rooms Controller Error - PUT /:id]:', error?.message || error);
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Lỗi máy chủ khi cập nhật thông tin căn hộ.',
    });
  }
});

export default roomsRouter;
