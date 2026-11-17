// =========================================================================
// CHÍNH SÁCH TÀI SẢN ĐA PHƯƠNG TIỆN & BỘ SINH MEDIA ASSET (ZERO-ASSET POLICY)
// Phân hệ: backend/dataset/seed/generators/media-asset.generator.ts
// Đặc tả: Milestone 8.1 – Hardened Zero-Asset Policy & No Untrusted Ingestion
// =========================================================================

import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import type { GeneratedUser } from './user.generator';
import type { GeneratedTicket } from './ticket.generator';

/**
 * Danh sách mục đích tải lên được whitelist toàn hệ thống
 * Nguồn chân lý: backend/src/modules/media/media.config.ts
 */
export const WHITELISTED_MEDIA_PURPOSES = ['tickets', 'materials', 'announcements'] as const;
export type MediaPurpose = (typeof WHITELISTED_MEDIA_PURPOSES)[number];

/**
 * Phân quyền vai trò được phép yêu cầu từng mục đích tải lên
 * Nguồn chân lý: backend/src/modules/media/media.config.ts
 */
export const MEDIA_PURPOSE_ROLE_PERMISSIONS: Record<MediaPurpose, Role[]> = {
  tickets: [Role.RESIDENT, Role.BQL, Role.ADMIN],
  materials: [Role.TECHNICIAN, Role.BQL, Role.ADMIN],
  announcements: [Role.BQL, Role.ADMIN],
};

/**
 * Chính sách Delivery Type theo mục đích:
 * Nguồn chân lý: backend/src/modules/media/media.config.ts
 * - announcements: 'upload' (Công khai qua CDN cho toàn cư dân xem bảng tin)
 * - tickets & materials: 'authenticated' (Riêng tư, chống xem trực tiếp nếu không có Signed URL)
 */
export const MEDIA_DELIVERY_TYPE_BY_PURPOSE: Record<MediaPurpose, 'upload' | 'authenticated'> = {
  announcements: 'upload',
  tickets: 'authenticated',
  materials: 'authenticated',
};

/**
 * Giới hạn dung lượng và định dạng tệp chuẩn hóa của hệ thống:
 * Nguồn chân lý: backend/src/modules/media/media.config.ts
 * - Ảnh: tối đa 5 MB (5,242,880 bytes), định dạng: jpg, jpeg, png, webp
 * - Video: tối đa 20 MB (20,971,520 bytes), định dạng: mp4, mov
 * - Upload Intent Token: HMAC-SHA256 có hiệu lực 15 phút (900 giây)
 */
export const MEDIA_POLICY_LIMITS = {
  IMAGE: {
    MAX_BYTES: 5 * 1024 * 1024,
    ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'] as const,
  },
  VIDEO: {
    MAX_BYTES: 20 * 1024 * 1024,
    ALLOWED_FORMATS: ['mp4', 'mov'] as const,
  },
  INTENT_TOKEN_EXPIRY_SECONDS: 15 * 60,
} as const;

/**
 * Interface cấu trúc bản ghi MediaAsset tương thích 100% Prisma schema
 * Nguồn chân lý: backend/src/database/schema.prisma (model MediaAsset)
 */
export interface GeneratedMediaAsset {
  id: number;
  publicId: string;
  url: string;
  resourceType: 'image' | 'video';
  deliveryType: 'upload' | 'authenticated' | 'private';
  purpose: MediaPurpose;
  bytes: number;
  format: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  uploaderId: number;
  ticketId: number | null;
  isConfirmed: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaAssetGeneratorOptions {
  seed?: number;
}

/**
 * TRÌNH SINH DỮ LIỆU MEDIA ASSET (ZERO-ASSET GENERATOR)
 *
 * NGUYÊN TẮC BẢO MẬT & KIẾN TRÚC BẮT BUỘC (M8.1):
 * 1. Mặc định LUÔN LUÔN trả về mảng rỗng [] (ZERO-ASSET MODE).
 * 2. Tuyệt đối KHÔNG tự tạo Cloudinary URL, publicId, signature hoặc metadata giả mạo.
 * 3. Tuyệt đối KHÔNG tự đặt isConfirmed = true.
 * 4. Tuyệt đối KHÔNG có API nhận dữ liệu tự khai báo từ caller (caller-controlled metadata)
 *    để hợp thức hóa thành bản ghi MediaAsset.
 * 5. Tuyệt đối KHÔNG gọi Cloudinary API hoặc backend API trong quá trình seed.
 * 6. Tài sản thật chỉ được tạo ra thông qua quy trình Upload & Confirm hợp lệ của Backend:
 *    - POST /api/media/signature (Backend kiểm tra RBAC, sinh Intent Token 15 phút và chữ ký Cloudinary)
 *    - Cloudinary Direct Signed Upload (Client upload trực tiếp từ thiết bị lên Cloudinary)
 *    - POST /api/media/confirm (Client gửi publicId và Intent Token để yêu cầu xác nhận)
 *    - Cloudinary Admin API verification (Backend xác thực dung lượng và định dạng thực tế qua Admin API)
 *    - Backend lưu bản ghi vào PostgreSQL với isConfirmed = true và confirmedAt = now()
 *
 * Dataset Seed Engine chỉ chịu trách nhiệm nạp dữ liệu khởi tạo an toàn, KHÔNG thay thế
 * hoặc giả lập quy trình kiểm duyệt bảo mật của Backend.
 */
export function generateMediaAssets(
  _users: GeneratedUser[] = [],
  _tickets: GeneratedTicket[] = [],
  _options: MediaAssetGeneratorOptions = {}
): GeneratedMediaAsset[] {
  // Chính sách Zero-Asset cứng: Luôn trả về mảng rỗng []
  // Không nhận object giả mạo, không có code path nào tạo MediaAsset
  return [];
}
