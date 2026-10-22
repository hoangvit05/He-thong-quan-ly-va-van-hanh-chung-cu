import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/api-response';

/**
 * Hàm khử nhạy cảm thông điệp log để không in secret, token hay dữ liệu nhạy cảm
 */
export function sanitizeForLog(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/(token|password|secret|apikey)[=:\s]+[^\s&"'}]+/gi, '$1=[REDACTED]');
}

/**
 * Global Express Error Handler Middleware
 * Bắt và chuẩn hóa toàn bộ lỗi phát sinh trong luồng xử lý HTTP Request của Express:
 * - JSON request sai cú pháp từ body-parser -> HTTP 400 chuẩn JSON API contract
 * - Payload vượt quá dung lượng cho phép -> HTTP 413 chuẩn JSON API contract
 * - Từ chối chính sách CORS -> HTTP 403 chuẩn JSON API contract
 * - Lỗi hệ thống / runtime không dự kiến -> HTTP 500 với thông báo chung, ngăn chặn rò rỉ stack trace, SQL, file path, hoặc credentials
 * - Nếu response headers đã được gửi -> ủy thác cho Express next(err) theo chuẩn Express
 */
export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 1. Nếu headers đã được gửi xuống client, bắt buộc phải ủy thác cho handler mặc định của Express
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let clientMessage = 'Đã xảy ra lỗi nội bộ máy chủ. Vui lòng thử lại sau.';

  // 2. Nhận diện các lớp lỗi cú pháp JSON và tải trọng (Body Parser)
  const isSyntaxError =
    (err instanceof SyntaxError || err?.name === 'SyntaxError') &&
    (err?.status === 400 || err?.statusCode === 400 || 'body' in (err || {}) || err?.type === 'entity.parse.failed');

  const isPayloadTooLarge =
    err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413;

  const isCorsError =
    err?.name === 'CorsError' || (typeof err?.message === 'string' && err.message.includes('CORS'));

  if (isSyntaxError) {
    statusCode = 400;
    clientMessage = 'Dữ liệu JSON trong yêu cầu không hợp lệ (Cú pháp JSON sai).';
  } else if (isPayloadTooLarge) {
    statusCode = 413;
    clientMessage = 'Dung lượng dữ liệu gửi lên vượt quá giới hạn cho phép.';
  } else if (isCorsError) {
    statusCode = 403;
    clientMessage = 'Yêu cầu bị từ chối bởi chính sách CORS.';
  }

  // 3. Ghi log phía server phục vụ điều tra sự cố (Lọc bỏ token, mật khẩu, API secret)
  const safeMethod = req.method;
  const safeUrl = sanitizeForLog(req.originalUrl || req.url);
  const safeErrName = err?.name || 'Error';
  const safeErrMsg = sanitizeForLog(typeof err?.message === 'string' ? err.message : 'Unknown error');

  console.error(`[GlobalErrorHandler] [${safeMethod}] ${safeUrl} -> HTTP ${statusCode} | ${safeErrName}: ${safeErrMsg}`);

  // 4. Trả lời Client theo đúng cấu trúc ApiResponse chuẩn của toàn hệ thống
  const responseBody: ApiResponse<null> = {
    success: false,
    data: null,
    message: clientMessage,
  };

  res.status(statusCode).json(responseBody);
}
