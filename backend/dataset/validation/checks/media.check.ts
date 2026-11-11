// =========================================================================
// KIỂM TRA TÍNH TOÀN VẸN TÀI NGUYÊN MEDIA (MEDIA ASSET INTEGRITY CHECK)
// =========================================================================

import { CheckResult } from './counts.check';

export interface MediaValidationInput {
  fakeCloudinaryAssets: number;
  unconfirmedAssetsCount: number;
  invalidMediaUrls: number;
}

/**
 * Kiểm tra tính toàn vẹn MediaAsset và bảo đảm không tạo fake asset
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
    message: errors.length === 0 ? 'Tài nguyên Media tuân thủ nghiêm ngặt chính sách bảo mật.' : errors.join('; '),
    details: input,
  };
}

