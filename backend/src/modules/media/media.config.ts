import path from 'path';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { Role } from '@prisma/client';

// Nạp tự động biến môi trường từ .env cục bộ được Git ignore
dotenv.config();
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}
if (!process.env.CLOUDINARY_CLOUD_NAME) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

/**
 * Danh sách mục đích tải lên được whitelist toàn hệ thống
 */
export const WHITELISTED_PURPOSES = ['tickets', 'materials', 'announcements'] as const;
export type MediaPurpose = typeof WHITELISTED_PURPOSES[number];

/**
 * Phân quyền vai trò được phép yêu cầu từng mục đích tải lên
 */
export const PURPOSE_ROLE_PERMISSIONS: Record<MediaPurpose, Role[]> = {
  tickets: [Role.RESIDENT, Role.BQL, Role.ADMIN],
  materials: [Role.TECHNICIAN, Role.BQL, Role.ADMIN],
  announcements: [Role.BQL, Role.ADMIN],
};

/**
 * Chính sách Delivery Type theo mục đích:
 * - announcements: 'upload' (Công khai qua CDN cho toàn cư dân)
 * - tickets & materials: 'authenticated' (Riêng tư, chống xem trực tiếp nếu không có Signed URL)
 */
export const DELIVERY_TYPE_BY_PURPOSE: Record<MediaPurpose, 'upload' | 'authenticated'> = {
  announcements: 'upload',
  tickets: 'authenticated',
  materials: 'authenticated',
};

/**
 * Giới hạn dung lượng tệp V1
 * - Ảnh: tối đa 5 MB
 * - Video: tối đa 20 MB
 */
export const MEDIA_LIMITS = {
  IMAGE: {
    MAX_BYTES: 5 * 1024 * 1024, // 5,242,880 bytes
    ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
  },
  VIDEO: {
    MAX_BYTES: 20 * 1024 * 1024, // 20,971,520 bytes
    ALLOWED_FORMATS: ['mp4', 'mov'],
  },
};

/**
 * Kiểm tra xem các biến môi trường Cloudinary có được cấu hình hợp lệ hay không
 */
export function isCloudinaryConfigured(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();


  return Boolean(
    cloudName &&
    apiKey &&
    apiSecret &&
    cloudName !== 'your_cloud_name_here' &&
    apiKey !== 'your_api_key_here' &&
    apiSecret !== 'your_api_secret_here'
  );
}

/**
 * Lấy cấu hình Cloudinary hiện tại (nếu có)
 */
export function getCloudinaryConfig(): { cloudName: string; apiKey: string; apiSecret: string } | null {
  if (!isCloudinaryConfigured()) {
    return null;
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY!.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET!.trim(),
  };
}

/**
 * Lấy cấu hình Cloudinary và ném lỗi rõ ràng nếu thiếu (Fail-Fast)
 */
export function requireCloudinaryConfig(): { cloudName: string; apiKey: string; apiSecret: string } {
  const config = getCloudinaryConfig();
  if (!config) {
    throw new Error(
      'CLOUDINARY_NOT_CONFIGURED: Thiếu biến môi trường CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY hoặc CLOUDINARY_API_SECRET trên máy chủ.'
    );
  }
  return config;
}

/**
 * Khởi tạo Cloudinary SDK với cấu hình hiện tại
 */
export function initCloudinaryClient() {
  const config = getCloudinaryConfig();
  if (config) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
  }
  return cloudinary;
}
