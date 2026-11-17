// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN TÀI NGUYÊN MEDIA (MEDIA ASSET INTEGRITY CHECK)
// Phân hệ: backend/dataset/validation/checks/media.check.ts
// Đặc tả: Milestone 10 — Kiểm toán chính sách Zero-Asset và an toàn URL media
// =========================================================================

import { CheckResult, DatasetSnapshot } from './types';

export { CheckResult };

export interface MediaValidationInput {
  fakeCloudinaryAssets: number;
  unconfirmedAssetsCount: number;
  invalidMediaUrls: number;
}

/**
 * Hàm kiểm tra từ bộ đếm số liệu thô (giữ tương thích ngược với các test cũ)
 */
export function checkMediaIntegrity(input: MediaValidationInput): CheckResult {
  const errors: string[] = [];

  if (input.fakeCloudinaryAssets > 0) {
    errors.push(`Phát hiện ${input.fakeCloudinaryAssets} bản ghi MediaAsset giả mạo trong cơ sở dữ liệu.`);
  }

  if (input.unconfirmedAssetsCount > 0) {
    errors.push(`Phát hiện ${input.unconfirmedAssetsCount} bản ghi MediaAsset có isConfirmed = false.`);
  }

  if (input.invalidMediaUrls > 0) {
    errors.push(`Phát hiện ${input.invalidMediaUrls} URL media chứa mã Base64 hoặc giao thức không an toàn.`);
  }

  return {
    name: 'Media Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Tài nguyên Media tuân thủ nghiêm ngặt chính sách bảo mật.'
        : `Phát hiện ${errors.length} vi phạm Media: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: input,
  };
}

/**
 * Kiểm tra xem một chuỗi có phải là URL hợp lệ (http/https) và không chứa Base64
 */
function isValidUrl(url: string): boolean {
  if (url.length > 1000) return false;
  if (url.startsWith('data:') || url.includes(';base64,')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Kiểm tra toàn diện tính toàn vẹn MediaAsset và URL media trực tiếp trên Dataset Snapshot
 */
export function validateMediaIntegrity(snapshot: DatasetSnapshot): CheckResult {
  const errors: string[] = [];
  let fakeAssets = 0;
  let unconfirmedAssets = 0;
  let invalidUrls = 0;

  // 1. Kiểm tra chính sách Zero-Asset của bảng MediaAsset
  if (snapshot.mediaAssets.length > 0) {
    fakeAssets += snapshot.mediaAssets.length;
    errors.push(
      `Vi phạm chính sách Zero-Asset: Bảng MediaAsset phải có chính xác 0 bản ghi nhưng phát hiện ${snapshot.mediaAssets.length} bản ghi.`
    );

    for (const ma of snapshot.mediaAssets) {
      if (ma.isConfirmed) {
        errors.push(
          `Bản ghi MediaAsset #${ma.id ?? ma.publicId} có isConfirmed = true bất hợp pháp (chống tự xác thực tài sản giả).`
        );
      }
      if (ma.url && (ma.url.includes('res.cloudinary.com') || ma.url.includes('fake'))) {
        errors.push(
          `Bản ghi MediaAsset #${ma.id ?? ma.publicId} chứa Cloudinary URL tự sinh/giả mạo: ${ma.url}`
        );
      }
    }
  }

  // 2. Kiểm tra các URL đính kèm trong Ticket (mediaUrl, completedMediaUrl)
  for (const t of snapshot.tickets) {
    if (t.mediaUrl !== null && t.mediaUrl !== undefined) {
      if (typeof t.mediaUrl !== 'string' || !isValidUrl(t.mediaUrl)) {
        invalidUrls++;
        errors.push(
          `Ticket #${t.id} có mediaUrl không hợp lệ (phải là URL http/https hợp lệ, tối đa 1000 ký tự và không chứa Base64).`
        );
      }
    }

    if (t.completedMediaUrl !== null && t.completedMediaUrl !== undefined) {
      if (typeof t.completedMediaUrl !== 'string' || !isValidUrl(t.completedMediaUrl)) {
        invalidUrls++;
        errors.push(
          `Ticket #${t.id} có completedMediaUrl không hợp lệ (phải là URL http/https hợp lệ, tối đa 1000 ký tự và không chứa Base64).`
        );
      }
    }
  }

  return {
    name: 'Media Integrity Check',
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? 'Tài nguyên Media tuân thủ nghiêm ngặt chính sách Zero-Asset và an toàn URL 100%.'
        : `Phát hiện ${errors.length} vi phạm Media: ${errors.join('; ')}`,
    violationsCount: errors.length,
    errors,
    details: {
      fakeCloudinaryAssets: fakeAssets,
      unconfirmedAssetsCount: unconfirmedAssets,
      invalidMediaUrls: invalidUrls,
      totalErrors: errors.length,
    },
  };
}
