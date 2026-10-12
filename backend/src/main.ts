import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rootRouter from './app.module';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Link toàn bộ router hệ thống
app.use('/api', rootRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Hệ thống Quản lý Chung cư Backend đang chạy mượt mà!' });
});

app.listen(PORT, () => {
  console.log(`[Backend Server] Đang lắng nghe tại cổng: http://localhost:${PORT}`);
  console.log(`[API Base URL] http://localhost:${PORT}/api`);
});
