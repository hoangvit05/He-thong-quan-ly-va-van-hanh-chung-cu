// =========================================================================
// TIỆN ÍCH KIỂM TRA HỢP LỆ DỮ LIỆU ĐẦU VÀO (DATA VALIDATION & ANTI-BLOAT)
// Phụ trách: Hiếu (Bảo vệ tính toàn vẹn và hiệu năng của Cơ sở dữ liệu)
// =========================================================================

/**
 * Kiểm tra xem chuỗi có phải là đường dẫn URL hợp lệ hay không.
 * Chặn tuyệt đối chuỗi Base64 (data:image/...) hoặc file nhị phân lọt vào DB.
 */
export function isValidMediaUrl(url: unknown): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Giới hạn độ dài tối đa 1000 ký tự để chống DoS và tràn bộ nhớ
  if (url.length > 1000) return false;

  // Phát hiện và chặn ngay lập tức nếu là chuỗi Base64
  if (url.startsWith('data:') || url.includes(';base64,')) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Kiểm tra xem một chuỗi có nghi vấn chứa dữ liệu mã hóa Base64 ảnh/file dung lượng lớn hay không
 */
export function containsBase64Payload(content: unknown): boolean {
  if (typeof content !== 'string') return false;
  // Bắt các pattern chuỗi Base64 thông dụng (cả ở đầu chuỗi hoặc nhúng bên trong)
  const base64Regex = /data:(image|video|application)\/[a-zA-Z0-9.+-]+;base64,/i;
  return base64Regex.test(content) || content.includes(';base64,') || (content.length > 5000 && !/\s/.test(content));
}

/**
 * Chuẩn hóa và làm sạch chuỗi kê khai vật tư (materials)
 * - Chặn Base64
 * - Giới hạn độ dài tối đa 2000 ký tự để chống phình to DB
 */
export function sanitizeMaterials(materials: unknown): { isValid: boolean; sanitized?: string; error?: string } {
  if (materials === null || materials === undefined) {
    return { isValid: true, sanitized: undefined };
  }

  if (typeof materials !== 'string') {
    return { isValid: false, error: 'Kê khai vật tư phải là chuỗi văn bản hoặc JSON hợp lệ.' };
  }

  if (containsBase64Payload(materials)) {
    return { isValid: false, error: 'Không được gửi ảnh Base64 vào trường kê khai vật tư! Hãy tải ảnh lên Cloud trước.' };
  }

  if (materials.length > 2000) {
    return { isValid: false, error: 'Nội dung vật tư kê khai quá dài (tối đa 2000 ký tự).' };
  }

  return { isValid: true, sanitized: materials.trim() };
}
