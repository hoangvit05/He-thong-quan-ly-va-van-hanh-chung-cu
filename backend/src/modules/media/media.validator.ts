// =========================================================================
// VALIDATOR DỮ LIỆU TẢI LÊN ĐA PHƯƠNG TIỆN (MEDIA UPLOAD VALIDATOR)
// Phụ trách: Việt Hoàng — Backend Lead
// =========================================================================
import { WHITELISTED_PURPOSES, MediaPurpose, MEDIA_LIMITS } from './media.config';

export interface SignatureRequestInput {
  purpose: MediaPurpose;
  resourceType: 'image' | 'video';
  ticketId?: number;
}

export interface ConfirmRequestInput {
  publicId: string;
  intentToken: string;
  resourceType: 'image' | 'video';
  bytes?: number;
  format?: string;
}

/**
 * Kiểm tra dữ liệu yêu cầu cấp chữ ký tải lên (POST /api/media/signature)
 */
export function validateSignatureRequest(body: any): { isValid: boolean; data?: SignatureRequestInput; error?: string } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Dữ liệu yêu cầu không hợp lệ. Payload phải là JSON Object.' };
  }

  // 1. Kiểm tra purpose bắt buộc và phải nằm trong Whitelist
  const { purpose, resourceType, ticketId } = body;
  if (!purpose || typeof purpose !== 'string') {
    return { isValid: false, error: `Mục đích tải lên (purpose) là bắt buộc. Các mục đích hợp lệ: [${WHITELISTED_PURPOSES.join(', ')}].` };
  }

  const normalizedPurpose = purpose.trim().toLowerCase() as MediaPurpose;
  if (!WHITELISTED_PURPOSES.includes(normalizedPurpose)) {
    return {
      isValid: false,
      error: `Mục đích tải lên '${purpose}' không được chấp nhận. Hệ thống chỉ cho phép: [${WHITELISTED_PURPOSES.join(', ')}].`,
    };
  }

  // 2. Chặn tuyệt đối việc client tự gửi đường dẫn folder tùy ý (Path Traversal / Custom Folder Injection)
  if (body.folder !== undefined) {
    return {
      isValid: false,
      error: 'Không được tự ý chỉ định thư mục (folder). Thư mục lưu trữ được máy chủ quyết định an toàn theo mục đích.',
    };
  }

  // 3. Kiểm tra resourceType
  let resolvedResourceType: 'image' | 'video' = 'image';
  if (resourceType !== undefined && resourceType !== null) {
    if (typeof resourceType !== 'string' || !['image', 'video'].includes(resourceType.trim().toLowerCase())) {
      return { isValid: false, error: 'Loại tài nguyên (resourceType) chỉ có thể là "image" hoặc "video".' };
    }
    resolvedResourceType = resourceType.trim().toLowerCase() as 'image' | 'video';
  }

  // 4. Kiểm tra ticketId nếu có
  let resolvedTicketId: number | undefined;
  if (ticketId !== undefined && ticketId !== null) {
    const parsedId = Number(ticketId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return { isValid: false, error: 'Mã phiếu sự cố (ticketId) phải là số nguyên dương hợp lệ.' };
    }
    resolvedTicketId = parsedId;
  }

  return {
    isValid: true,
    data: {
      purpose: normalizedPurpose,
      resourceType: resolvedResourceType,
      ticketId: resolvedTicketId,
    },
  };
}

/**
 * Kiểm tra dữ liệu yêu cầu xác nhận tải lên (POST /api/media/confirm)
 */
export function validateConfirmRequest(body: any): { isValid: boolean; data?: ConfirmRequestInput; error?: string } {
  if (!body || typeof body !== 'object') {
    return { isValid: false, error: 'Dữ liệu yêu cầu không hợp lệ. Payload phải là JSON Object.' };
  }

  const { publicId, intentToken, resourceType, bytes, format } = body;

  if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
    return { isValid: false, error: 'Định danh tài sản (publicId) là bắt buộc.' };
  }

  const trimmedPublicId = publicId.trim();
  if (trimmedPublicId.length > 300) {
    return { isValid: false, error: 'Định danh tài sản (publicId) quá dài.' };
  }

  // Chống Path Traversal trong publicId
  if (trimmedPublicId.includes('..') || trimmedPublicId.startsWith('/') || trimmedPublicId.includes('\\')) {
    return { isValid: false, error: 'Định danh tài sản (publicId) chứa ký tự điều hướng không an toàn.' };
  }

  if (!intentToken || typeof intentToken !== 'string' || !intentToken.trim()) {
    return { isValid: false, error: 'Mã xác thực phiên tải lên (intentToken) là bắt buộc để chứng minh quyền sở hữu.' };
  }

  let resolvedResourceType: 'image' | 'video' = 'image';
  if (resourceType !== undefined && resourceType !== null) {
    const rType = String(resourceType).trim().toLowerCase();
    if (rType !== 'image' && rType !== 'video') {
      return { isValid: false, error: 'resourceType phải là "image" hoặc "video".' };
    }
    resolvedResourceType = rType as 'image' | 'video';
  }

  let resolvedBytes: number | undefined;
  if (bytes !== undefined && bytes !== null) {
    const numBytes = Number(bytes);
    if (isNaN(numBytes) || numBytes <= 0) {
      return { isValid: false, error: 'Dung lượng tệp (bytes) phải là số dương hợp lệ.' };
    }
    resolvedBytes = numBytes;
  }

  return {
    isValid: true,
    data: {
      publicId: trimmedPublicId,
      intentToken: intentToken.trim(),
      resourceType: resolvedResourceType,
      bytes: resolvedBytes,
      format: typeof format === 'string' ? format.trim().toLowerCase() : undefined,
    },
  };
}

/**
 * Kiểm tra xem URL có đúng cấu trúc Cloudinary an toàn hay không
 */
export function isValidCloudinaryUrl(url: unknown, expectedCloudName?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url.length > 1000) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'res.cloudinary.com') return false;

    // Định dạng: /<cloud_name>/(image|video)/upload/...
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 3) return false;

    const [cloudName, resourceType, deliveryType] = segments;
    if (expectedCloudName && cloudName !== expectedCloudName) {
      return false;
    }

    if (!['image', 'video'].includes(resourceType)) return false;
    if (!['upload', 'authenticated', 'private'].includes(deliveryType)) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Trích xuất publicId từ Cloudinary secure URL
 */
export function extractPublicIdFromCloudinaryUrl(url: string): string | null {
  if (!isValidCloudinaryUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    // segments: [cloudName, resourceType, deliveryType, (v1234)?, ...publicIdWithExt]
    let pathSegments = segments.slice(3);
    if (pathSegments.length === 0) return null;

    // Bỏ version nếu có (ví dụ v1729600000)
    if (pathSegments[0].startsWith('v') && /^\d+$/.test(pathSegments[0].substring(1))) {
      pathSegments = pathSegments.slice(1);
    }

    if (pathSegments.length === 0) return null;

    const fullPathWithExt = pathSegments.join('/');
    // Bỏ phần extension cuối cùng
    const lastDotIndex = fullPathWithExt.lastIndexOf('.');
    return lastDotIndex !== -1 ? fullPathWithExt.substring(0, lastDotIndex) : fullPathWithExt;
  } catch {
    return null;
  }
}
