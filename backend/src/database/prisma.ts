import { PrismaClient } from '@prisma/client';

// Khởi tạo một PrismaClient instance duy nhất (Singleton Pattern)
// Giúp tránh tạo quá nhiều kết nối cơ sở dữ liệu khi chạy trong môi trường phát triển
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
