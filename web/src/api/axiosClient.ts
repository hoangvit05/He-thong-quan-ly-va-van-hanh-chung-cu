import axios from 'axios';
import { getStoredToken, clearAuthSession } from '../utils/auth';

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Nếu gửi dữ liệu dạng FormData (upload media, tệp đính kèm), xóa Content-Type
    // để trình duyệt tự động thiết lập multipart/form-data cùng boundary hợp lệ
    const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
    if (isFormData && config.headers) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

axiosClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;
    const backendData = error?.response?.data;

    // Xử lý 401 Unauthorized: Xóa phiên và chuyển về /login đúng một lần, chống vòng lặp redirect
    if (status === 401) {
      clearAuthSession();
      const url = String(error?.config?.url || '');
      const isLoginRequest = url.includes('/auth/login');
      const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
      if (!isLoginRequest && !isLoginPage && typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }

    // Xác định thông báo lỗi thân thiện dựa trên HTTP status code nếu Backend không gửi message cụ thể
    let fallbackMessage = 'Đã xảy ra lỗi khi kết nối tới máy chủ.';
    if (!error?.response) {
      fallbackMessage = 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền mạng hoặc liên hệ quản trị viên.';
    } else if (status === 400) {
      fallbackMessage = 'Yêu cầu không hợp lệ hoặc thiếu thông tin bắt buộc.';
    } else if (status === 401) {
      fallbackMessage = 'Phiên đăng nhập đã hết hạn hoặc thông tin xác thực không chính xác.';
    } else if (status === 403) {
      fallbackMessage = 'Bạn không có quyền thực hiện thao tác hoặc truy cập tài nguyên này.';
    } else if (status === 404) {
      fallbackMessage = 'Không tìm thấy tài nguyên yêu cầu trên máy chủ.';
    } else if (status === 409) {
      fallbackMessage = 'Dữ liệu đã tồn tại hoặc xảy ra xung đột trạng thái.';
    } else if (status === 422) {
      fallbackMessage = 'Dữ liệu gửi lên không vượt qua được kiểm tra logic của hệ thống.';
    } else if (status === 429) {
      fallbackMessage = 'Quá nhiều yêu cầu gửi tới hệ thống cùng lúc. Vui lòng thử lại sau giây lát.';
    } else if (status === 500) {
      fallbackMessage = 'Lỗi máy chủ nội bộ. Vui lòng liên hệ ban quản trị để được hỗ trợ.';
    } else if (status === 502 || status === 503) {
      fallbackMessage = 'Dịch vụ máy chủ tạm thời không sẵn sàng hoặc đang bảo trì. Vui lòng thử lại sau.';
    }

    // Ưu tiên bảo toàn thông điệp chuẩn từ Backend envelope: { success: false, message: '...' }
    const message =
      backendData?.message ||
      backendData?.error ||
      error?.message ||
      fallbackMessage;

    return Promise.reject({
      status,
      message,
      data: backendData?.data ?? null,
      raw: backendData,
    });
  }
);

export default axiosClient;
