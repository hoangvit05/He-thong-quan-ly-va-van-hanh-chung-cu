import axios from 'axios';
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { applyRequestAuth, formatAxiosError } from '../utils/auth.ts';

/**
 * Xác định Base URL cho API theo môi trường:
 * - Development: Mặc định http://localhost:5000 nếu không có cấu hình VITE_API_URL.
 * - Production: Sử dụng VITE_API_URL được cấu hình rõ ràng, hoặc chuỗi rỗng '' (same-origin relative path /api)
 *   để tuyệt đối không gọi nhầm về localhost trên máy người dùng trong bản production.
 * - Ghi chú quan trọng: VITE_API_URL là API origin (ví dụ: 'http://localhost:5000' hoặc 'https://api.chungcu.vn').
 *   Không bao gồm tiền tố '/api' ở cuối vì các endpoints trong endpoints.ts đã chứa sẵn tiền tố '/api'.
 *   Hàm tự động chuẩn hóa loại bỏ trailing slash và trailing /api nếu người dùng lỡ cấu hình dư.
 */
export function getApiBaseUrl(customEnvUrl?: string, customIsDev?: boolean): string {
  const envUrl =
    typeof customEnvUrl === 'string'
      ? customEnvUrl
      : typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL;

  if (typeof envUrl === 'string' && envUrl.trim() !== '') {
    let cleaned = envUrl.trim().replace(/\/+$/, '');
    if (cleaned.endsWith('/api')) {
      cleaned = cleaned.slice(0, -4).replace(/\/+$/, '');
    }
    return cleaned;
  }

  // Xác định môi trường Development:
  // Nếu có customIsDev truyền vào thì ưu tiên; nếu không, đọc từ import.meta.env.DEV
  const isDev =
    typeof customIsDev === 'boolean'
      ? customIsDev
      : Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV);

  if (isDev) {
    return 'http://localhost:5000';
  }

  // Bản Production không cấu hình URL: sử dụng same-origin relative URL (không gọi localhost máy client)
  return '';
}

export const axiosClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use(
  (config) => applyRequestAuth(config as any) as InternalAxiosRequestConfig,
  (error) => Promise.reject(error)
);

axiosClient.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => Promise.reject(formatAxiosError(error))
);

export { applyRequestAuth, formatAxiosError };
export default axiosClient;
