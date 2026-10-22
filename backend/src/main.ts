import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rootRouter from './app.module';
import { validateJwtSecretAtStartup } from './common/middleware/auth';
import { globalErrorHandler } from './common/middleware/error-handler';
import { initSocketServer } from './modules/notifications/notifications.socket';

dotenv.config();

// Kiểm tra tính bảo mật của JWT Secret khi khởi động (Từ chối khởi động ở Production nếu secret yếu)
validateJwtSecretAtStartup();

export function createExpressApp(): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // Link toàn bộ router hệ thống
  app.use('/api', rootRouter);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Hệ thống Quản lý Chung cư Backend đang chạy mượt mà!' });
  });

  // Global Error Handler - Đăng ký sau cùng sau toàn bộ routes và middlewares
  app.use(globalErrorHandler);

  return app;
}

const app = createExpressApp();
const PORT = process.env.PORT || 5000;

// Khởi tạo HTTP Server bọc ngoài Express để tích hợp Socket.IO Realtime
const server = http.createServer(app);
const io = initSocketServer(server);

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[Backend Server] Đang lắng nghe tại cổng: http://localhost:${PORT}`);
    console.log(`[API Base URL] http://localhost:${PORT}/api`);
    console.log(`[Socket.IO Realtime] Sẵn sàng phục vụ kết nối WebSocket/Polling`);
  });
}

export { app, server, io };
