// =========================================================================
// CHÍNH SÁCH TÀI SẢN ĐA PHƯƠNG TIỆN & BỘ SINH MEDIA ASSET (ZERO-ASSET DEFAULT)
// Phân hệ: backend/dataset/seed/generators/media-asset.generator.ts
// Đặc tả: Milestone 8 – MediaAsset Policy & Real Asset Integration
// =========================================================================

import { Role } from '@prisma/client';
import { DATASET_CONFIG } from '../../config/dataset.config';
import type { GeneratedUser } from './user.generator';
import type { GeneratedTicket } from './ticket.generator';

/**
 * Mục đích sử dụng tài nguyên được phép trong hệ thống
 */
export const WHITELISTED_MEDIA_PURPOSES = ['tickets', 'materials', 'announcements'] as const;
export type MediaPurpose = (typeof WHITELISTED_MEDIA_PURPOSES)[number];

/**
 * Phân quyền vai trò người dùng được phép tải lên theo từng mục đích
 */
export const MEDIA_PURPOSE_ROLE_PERMISSIONS: Record<MediaPurpose, Role[]> = {
  tickets: [Role.RESIDENT, Role.BQL, Role.ADMIN],
  materials: [Role.TECHNICIAN, Role.BQL, Role.ADMIN],
  announcements: [Role.BQL, Role.ADMIN],
};

/**
 * Kiểu phân phối CDN tương ứng từng mục đích:
 * - announcements: 'upload' (Công khai qua CDN cho toàn cư dân xem bảng tin)
 * - tickets & materials: 'authenticated' (Riêng tư, chỉ truy cập qua Signed URL bảo mật)
 */
export const MEDIA_DELIVERY_TYPE_BY_PURPOSE: Record<MediaPurpose, 'upload' | 'authenticated'> = {
  announcements: 'upload',
  tickets: 'authenticated',
  materials: 'authenticated',
};

/**
 * Giới hạn dung lượng và định dạng tệp chuẩn hóa của hệ thống:
 * - Ảnh: tối đa 5 MB (5,242,880 bytes), định dạng: jpg, jpeg, png, webp
 * - Video: tối đa 20 MB (20,971,520 bytes), định dạng: mp4, mov
 */
export const MEDIA_POLICY_LIMITS = {
  IMAGE: {
    MAX_BYTES: 5 * 1024 * 1024,
    ALLOWED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
  },
  VIDEO: {
    MAX_BYTES: 20 * 1024 * 1024,
    ALLOWED_FORMATS: ['mp4', 'mov'],
  },
  INTENT_TOKEN_EXPIRY_SECONDS: 15 * 60, // Token HMAC có hiệu lực 15 phút
} as const;

/**
 * Interface cấu trúc bản ghi MediaAsset tương thích 100% Prisma schema
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

/**
 * Dữ liệu đầu vào của một tài sản thật đã qua xác minh từ Cloudinary Admin API
 */
export interface VerifiedRealAssetInput {
  publicId: string;
  url: string;
  resourceType: 'image' | 'video';
  deliveryType?: 'upload' | 'authenticated' | 'private';
  purpose: MediaPurpose;
  bytes: number;
  format: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  uploaderId: number;
  ticketId?: number | null;
  isConfirmed: true;
  confirmedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MediaAssetGeneratorOptions {
  seed?: number;
  verifiedAssets?: VerifiedRealAssetInput[];
  maxVerified?: number;
}

/**
 * Kiểm tra tính hợp lệ của một tài sản thật đã qua xác minh
 */
export function validateVerifiedAssetInput(
  asset: VerifiedRealAssetInput,
  users?: GeneratedUser[],
  tickets?: GeneratedTicket[]
): { isValid: boolean; error?: string } {
  if (!asset || typeof asset !== 'object') {
    return { isValid: false, error: 'Asset input phải là một đối tượng hợp lệ.' };
  }

  // 1. Kiểm tra publicId
  if (!asset.publicId || typeof asset.publicId !== 'string' || !asset.publicId.trim()) {
    return { isValid: false, error: 'publicId là bắt buộc và không được để trống.' };
  }
  const trimmedPublicId = asset.publicId.trim();
  if (
    trimmedPublicId.includes('..') ||
    trimmedPublicId.startsWith('/') ||
    trimmedPublicId.includes('\\')
  ) {
    return { isValid: false, error: `publicId '${asset.publicId}' chứa ký tự không an toàn (Path Traversal).` };
  }
  if (trimmedPublicId.includes('fake') || trimmedPublicId.includes('mock') || trimmedPublicId.includes('dummy')) {
    return { isValid: false, error: `publicId '${asset.publicId}' vi phạm chính sách cấm asset giả mạo.` };
  }

  // 2. Kiểm tra URL
  if (!asset.url || typeof asset.url !== 'string') {
    return { isValid: false, error: 'URL tài sản là bắt buộc.' };
  }
  if (!asset.url.startsWith('https://')) {
    return { isValid: false, error: 'URL tài sản phải sử dụng giao thức HTTPS bảo mật.' };
  }
  if (asset.url.includes('example.com') || asset.url.includes('fake') || asset.url.includes('dummy')) {
    return { isValid: false, error: `URL '${asset.url}' chứa domain/placeholder giả mạo.` };
  }

  // 3. Kiểm tra resourceType
  if (asset.resourceType !== 'image' && asset.resourceType !== 'video') {
    return { isValid: false, error: `resourceType '${asset.resourceType}' không hợp lệ (chỉ chấp nhận 'image' hoặc 'video').` };
  }

  // 4. Kiểm tra purpose
  if (!WHITELISTED_MEDIA_PURPOSES.includes(asset.purpose)) {
    return {
      isValid: false,
      error: `purpose '${asset.purpose}' không nằm trong Whitelist: [${WHITELISTED_MEDIA_PURPOSES.join(', ')}].`,
    };
  }

  // 5. Kiểm tra dung lượng (bytes) và định dạng (format)
  const format = asset.format.trim().toLowerCase();
  const allowedImageFormats: readonly string[] = MEDIA_POLICY_LIMITS.IMAGE.ALLOWED_FORMATS;
  const allowedVideoFormats: readonly string[] = MEDIA_POLICY_LIMITS.VIDEO.ALLOWED_FORMATS;

  if (asset.resourceType === 'image') {
    if (!allowedImageFormats.includes(format)) {
      return {
        isValid: false,
        error: `Định dạng ảnh '.${format}' không được hỗ trợ. Chỉ cho phép: [${MEDIA_POLICY_LIMITS.IMAGE.ALLOWED_FORMATS.join(', ')}].`,
      };
    }
    if (asset.bytes <= 0 || asset.bytes > MEDIA_POLICY_LIMITS.IMAGE.MAX_BYTES) {
      return {
        isValid: false,
        error: `Dung lượng ảnh (${asset.bytes} bytes) vượt quá giới hạn 5MB (${MEDIA_POLICY_LIMITS.IMAGE.MAX_BYTES} bytes).`,
      };
    }
  } else {
    if (!allowedVideoFormats.includes(format)) {
      return {
        isValid: false,
        error: `Định dạng video '.${format}' không được hỗ trợ. Chỉ cho phép: [${MEDIA_POLICY_LIMITS.VIDEO.ALLOWED_FORMATS.join(', ')}].`,
      };
    }
    if (asset.bytes <= 0 || asset.bytes > MEDIA_POLICY_LIMITS.VIDEO.MAX_BYTES) {
      return {
        isValid: false,
        error: `Dung lượng video (${asset.bytes} bytes) vượt quá giới hạn 20MB (${MEDIA_POLICY_LIMITS.VIDEO.MAX_BYTES} bytes).`,
      };
    }
  }

  // 6. Kiểm tra trạng thái xác nhận: Bắt buộc isConfirmed = true và có confirmedAt hợp lệ
  if (asset.isConfirmed !== true) {
    return { isValid: false, error: 'Chỉ tài sản đã xác minh thành công (isConfirmed = true) mới được đưa vào dataset.' };
  }
  if (!(asset.confirmedAt instanceof Date) || isNaN(asset.confirmedAt.getTime())) {
    return { isValid: false, error: 'confirmedAt phải là đối tượng Date hợp lệ.' };
  }

  // 7. Kiểm tra khóa ngoại uploaderId và quyền hạn vai trò (RBAC) nếu danh sách user được cung cấp
  if (users && users.length > 0) {
    const uploader = users.find((u) => u.id === asset.uploaderId);
    if (!uploader) {
      return { isValid: false, error: `uploaderId ${asset.uploaderId} không tồn tại trong danh sách User.` };
    }
    const allowedRoles = MEDIA_PURPOSE_ROLE_PERMISSIONS[asset.purpose];
    if (!allowedRoles.includes(uploader.role)) {
      return {
        isValid: false,
        error: `Người dùng ${uploader.id} (vai trò ${uploader.role}) không có quyền tải lên cho mục đích '${asset.purpose}'.`,
      };
    }
  }

  // 8. Kiểm tra khóa ngoại ticketId nếu có liên kết ticket
  if (asset.ticketId !== undefined && asset.ticketId !== null) {
    if (asset.purpose !== 'tickets' && asset.purpose !== 'materials') {
      return { isValid: false, error: `ticketId chỉ được phép gán cho mục đích 'tickets' hoặc 'materials'.` };
    }
    if (tickets && tickets.length > 0) {
      const ticket = tickets.find((t) => t.id === asset.ticketId);
      if (!ticket) {
        return { isValid: false, error: `ticketId ${asset.ticketId} không tồn tại trong danh sách Ticket.` };
      }
    }
  }

  return { isValid: true };
}

/**
 * TRÌNH SINH DỮ LIỆU MEDIA ASSET (MEDIA ASSET GENERATOR)
 *
 * NGUYÊN TẮC BẢO MẬT & TRUNG THỰC DỮ LIỆU:
 * 1. Mặc định trả về mảng rỗng [] (ZERO-ASSET MODE).
 * 2. Tuyệt đối KHÔNG tự tạo Cloudinary URL, publicId hoặc metadata giả mạo.
 * 3. Tuyệt đối KHÔNG tạo bản ghi isConfirmed = true giả mạo để lấp đầy số lượng.
 * 4. Tuyệt đối KHÔNG gọi Cloudinary API hoặc tự upload file trong quá trình seed.
 * 5. Chỉ khi có tài nguyên thật đã qua quy trình upload & xác minh thành công của Backend
 *    (thông qua Cloudinary Direct Signed Upload và Cloudinary Admin API verification),
 *    các tài sản đó mới được hợp thức hóa vào danh sách MediaAsset.
 */
export function generateMediaAssets(
  users: GeneratedUser[] = [],
  tickets: GeneratedTicket[] = [],
  options: MediaAssetGeneratorOptions = {}
): GeneratedMediaAsset[] {
  // Mặc định không có verifiedAssets -> trả về mảng rỗng [] (Zero-Asset)
  if (!options.verifiedAssets || options.verifiedAssets.length === 0) {
    return [];
  }

  // Nếu người dùng cung cấp danh sách tài nguyên thật, kiểm tra nghiêm ngặt từng phần tử
  const result: GeneratedMediaAsset[] = [];
  const seenPublicIds = new Set<string>();

  for (let i = 0; i < options.verifiedAssets.length; i++) {
    const rawAsset = options.verifiedAssets[i];
    const validation = validateVerifiedAssetInput(rawAsset, users, tickets);

    if (!validation.isValid) {
      throw new Error(`[MediaAsset Validation Error] Tài sản thứ ${i + 1} không hợp lệ: ${validation.error}`);
    }

    if (seenPublicIds.has(rawAsset.publicId)) {
      throw new Error(`[MediaAsset Validation Error] publicId '${rawAsset.publicId}' bị trùng lặp.`);
    }
    seenPublicIds.add(rawAsset.publicId);

    const deliveryType = rawAsset.deliveryType || MEDIA_DELIVERY_TYPE_BY_PURPOSE[rawAsset.purpose] || 'authenticated';
    const createdAt = rawAsset.createdAt || rawAsset.confirmedAt;
    const updatedAt = rawAsset.updatedAt || rawAsset.confirmedAt;

    result.push({
      id: i + 1,
      publicId: rawAsset.publicId.trim(),
      url: rawAsset.url.trim(),
      resourceType: rawAsset.resourceType,
      deliveryType,
      purpose: rawAsset.purpose,
      bytes: rawAsset.bytes,
      format: rawAsset.format.trim().toLowerCase(),
      width: rawAsset.width ?? null,
      height: rawAsset.height ?? null,
      duration: rawAsset.duration ?? null,
      uploaderId: rawAsset.uploaderId,
      ticketId: rawAsset.ticketId ?? null,
      isConfirmed: true,
      confirmedAt: rawAsset.confirmedAt,
      createdAt,
      updatedAt,
    });
  }

  // Đảm bảo không vượt quá giới hạn tối đa theo cấu hình (hoặc options.maxVerified nếu được override phục vụ test)
  const allowedMax = options.maxVerified !== undefined ? options.maxVerified : DATASET_CONFIG.TARGET_COUNTS.MEDIA_ASSETS.MAX_VERIFIED;
  if (result.length > allowedMax) {
    throw new Error(
      `Số lượng MediaAsset (${result.length}) vượt quá giới hạn MAX_VERIFIED (${allowedMax}).`
    );
  }

  return result;
}
