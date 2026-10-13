// =========================================================================
// TIỆN ÍCH SINH MÃ VIETQR ĐỘNG (DYNAMIC VIETQR GENERATOR)
// Phụ trách: Hiếu (Module Hóa đơn & Biểu phí)
// Đảm bảo không lưu tệp ảnh QR tĩnh vào DB, mà sinh URL động theo chuẩn VietQR
// =========================================================================

export interface VietQRParams {
  bankId?: string;       // Mã BIN ngân hàng (ví dụ: "MB", "ICB", "VCB")
  accountNo?: string;    // Số tài khoản Ban quản lý
  accountName?: string;  // Tên chủ tài khoản BQL
  amount: number;        // Số tiền cần nộp (totalAmount)
  description: string;   // Cú pháp nộp: ví dụ "TIEN PHI PHONG 101 THANG 10"
  template?: 'compact' | 'compact2' | 'qr_only' | 'print';
}

/**
 * Sinh đường dẫn ảnh mã QR động từ cổng VietQR Quốc gia
 */
export function generateVietQRUrl(params: VietQRParams): string {
  // Lấy thông tin tài khoản BQL từ biến môi trường (hoặc fallback mặc định)
  const bankId = params.bankId || process.env.BQL_BANK_ID || 'MB';
  const accountNo = params.accountNo || process.env.BQL_ACCOUNT_NO || '9999999999';
  const template = params.template || 'compact';

  const cleanAmount = Math.max(0, Math.round(params.amount));
  const encodedInfo = encodeURIComponent(params.description.trim());
  const encodedName = params.accountName ? `&accountName=${encodeURIComponent(params.accountName)}` : '';

  // Cấu trúc URL chuẩn VietQR
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?amount=${cleanAmount}&addInfo=${encodedInfo}${encodedName}`;
}
