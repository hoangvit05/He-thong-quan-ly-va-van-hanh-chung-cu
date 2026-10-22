import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rootRouter from './app.module';
import { validateJwtSecretAtStartup } from './common/middleware/auth';
import { initSocketServer } from './modules/notifications/notifications.socket';

dotenv.config();

// Kiểm tra tính bảo mật của JWT Secret khi khởi động (Từ chối khởi động ở Production nếu secret yếu)
validateJwtSecretAtStartup();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Link toàn bộ router hệ thống
app.use('/api', rootRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hệ thống Quản lý Chung cư Backend đang chạy mượt mà!' });
});

// Khởi tạo HTTP Server bọc ngoài Express để tích hợp Socket.IO Realtime
const server = http.createServer(app);
const io = initSocketServer(server);

server.listen(PORT, () => {
  console.log(`[Backend Server] Đang lắng nghe tại cổng: http://localhost:${PORT}`);
  console.log(`[API Base URL] http://localhost:${PORT}/api`);
  console.log(`[Socket.IO Realtime] Sẵn sàng phục vụ kết nối WebSocket/Polling`);
});

export { app, server, io };
