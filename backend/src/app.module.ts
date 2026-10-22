// ===================================================================
// FILE LINK TẬP TRUNG TOÀN BỘ CÁC MODULE BACKEND VÀO ỨNG DỤNG
// Phụ trách duyệt: Đặng Hoàng (Leader)
// Thành viên KHÔNG tự ý sửa file này, chỉ code trong module của mình!
// ===================================================================

import { Router } from 'express';
// 1. Modules của Đặng Hoàng
import authRoutes from './modules/auth/auth.controller';
import usersRoutes, { residentsRouter } from './modules/users/users.controller';
import notificationsRoutes from './modules/notifications/notifications.controller';
import roomsRoutes from './modules/rooms/rooms.controller';

// 2. Modules của Hiếu
import ticketsRoutes from './modules/tickets/tickets.controller';
import invoicesRoutes from './modules/invoices/invoices.controller';
import feedbackRoutes from './modules/feedback/feedback.controller';

// 3. Modules Tải lên Đa phương tiện Cloudinary của Việt Hoàng
import mediaRoutes from './modules/media/media.controller';

const rootRouter = Router();

// Link toàn bộ API theo đúng quy ước:
rootRouter.use('/auth', authRoutes);
rootRouter.use('/admin/users', usersRoutes);
rootRouter.use('/apartments/residents', residentsRouter);
rootRouter.use('/rooms', roomsRoutes);
rootRouter.use('/notifications', notificationsRoutes);
rootRouter.use('/media', mediaRoutes);

rootRouter.use('/tickets', ticketsRoutes);
rootRouter.use('/technician/tickets', ticketsRoutes);
rootRouter.use('/invoices', invoicesRoutes);
rootRouter.use('/feedback', feedbackRoutes);

export default rootRouter;
